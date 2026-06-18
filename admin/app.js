const state = {
  apiBase: localStorage.getItem("siteAdminApiBase") || "https://wangqiwei366-site-admin.wangqiwei366.workers.dev",
  password: sessionStorage.getItem("siteAdminPassword") || "",
  posts: [],
  current: null,
  editing: null,
  progress: JSON.parse(localStorage.getItem("siteAdminProgress") || "[]"),
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  $("#statusText").textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 2400);
}

function setView(name) {
  $$(".view").forEach((view) => view.classList.remove("active"));
  $(`#${name}View`).classList.add("active");
  $$(".nav").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  const titles = {
    dashboard: ["总览", "在任何设备上管理这个 GitHub Pages 网站。"],
    publish: [state.editing ? "修改文章" : "发布新文章", state.editing ? "保存后会覆盖原文章。" : "写完后直接发布到 GitHub。"],
    posts: ["文章管理", "查看、修改或删除已经发布的文章。"],
    progress: ["发布进度", "查看每次操作记录。"],
  };
  $("#pageTitle").textContent = titles[name][0];
  $("#pageSubtitle").textContent = titles[name][1];
}

function normalizeApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function requireBackend() {
  if (!state.apiBase) throw new Error("先填写后端地址");
  if (!state.password) throw new Error("先填写管理密码");
}

async function api(path, options = {}) {
  requireBackend();
  const response = await fetch(`${state.apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Password": state.password,
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "操作失败");
  return data;
}

function renderConnectionState(message = "") {
  if (!state.apiBase || !state.password) {
    $("#tokenState").textContent = "未连接";
    $("#tokenState").className = "pill";
    $("#repoState").textContent = "未连接";
  } else {
    $("#tokenState").textContent = message || "已保存，待检查";
    $("#tokenState").className = "pill good";
    $("#repoState").textContent = "待检查";
  }
  $("#apiInput").value = state.apiBase;
}

async function testBackend() {
  if (!state.apiBase || !state.password) {
    renderConnectionState();
    return;
  }
  const result = await api("/health");
  $("#tokenState").textContent = `已连接：${result.repo}`;
  $("#tokenState").className = "pill good";
  $("#repoState").textContent = "已连接";
}

async function loadPosts() {
  const result = await api("/posts");
  state.posts = result.posts || [];
  state.posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  renderPosts();
  $("#postCount").textContent = state.posts.length;
}

function resetEditor() {
  state.editing = null;
  $("#editorTitle").textContent = "发布新文章";
  $("#editorMeta").textContent = "写完后会直接发布到 GitHub。";
  $("#publishBtn").textContent = "发布";
  $("#cancelEditBtn").style.display = "none";
  $("#postTitle").value = "";
  $("#postSubtitle").value = "";
  $("#postDate").value = toDateInput();
  $("#postAuthor").value = "kimi";
  $("#postImage").value = "";
  $("#postTags").value = "";
  $("#postBody").value = "";
  $("#preview").innerHTML = "";
}

function fillEditor(post) {
  state.editing = post;
  $("#editorTitle").textContent = "修改文章";
  $("#editorMeta").textContent = post.path;
  $("#publishBtn").textContent = "保存修改";
  $("#cancelEditBtn").style.display = "";
  $("#postTitle").value = post.title || "";
  $("#postSubtitle").value = post.subtitle || "";
  $("#postDate").value = toDateInput(post.date);
  $("#postAuthor").value = post.author || "kimi";
  $("#postImage").value = post.image || "";
  $("#postTags").value = (post.tags || []).join("，");
  $("#postBody").value = post.body || "";
  $("#preview").innerHTML = markdown(post.body || "");
  setView("publish");
}

async function publishPost() {
  const title = $("#postTitle").value.trim();
  const body = $("#postBody").value.trim();
  if (!title) return toast("先填写标题");
  if (!body) return toast("先填写正文");
  const isEdit = !!state.editing;
  const entry = createProgress(isEdit ? `修改：${title}` : title);
  try {
    updateProgress(entry.id, "整理文章", 25);
    const payload = {
      title,
      subtitle: $("#postSubtitle").value.trim(),
      date: fromDate($("#postDate").value),
      author: $("#postAuthor").value.trim() || "kimi",
      image: $("#postImage").value.trim(),
      tags: $("#postTags").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      body,
    };
    if (state.editing) {
      payload.path = state.editing.path;
      payload.sha = state.editing.sha;
    }
    updateProgress(entry.id, isEdit ? "保存修改到后端" : "提交到后端", 55, payload.path || "");
    const result = await api("/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    updateProgress(entry.id, isEdit ? "修改完成，等待 GitHub Pages 刷新" : "发布完成，等待 GitHub Pages 刷新", 100, result.post?.path || "", "done");
    toast(isEdit ? "文章已修改" : "文章已发布");
    await loadPosts();
    resetEditor();
    setView("progress");
  } catch (error) {
    updateProgress(entry.id, error.message, 100, "", "failed");
    toast(error.message);
  }
}

async function deletePost() {
  if (!state.current) return toast("先选择文章");
  if (!confirm("确定删除这篇文章吗？")) return;
  const entry = createProgress(`删除：${state.current.title}`);
  try {
    updateProgress(entry.id, "提交删除请求", 55, state.current.path);
    await api("/posts", {
      method: "DELETE",
      body: JSON.stringify({ path: state.current.path, sha: state.current.sha }),
    });
    updateProgress(entry.id, "删除完成", 100, state.current.path, "done");
    toast("文章已删除");
    state.current = null;
    await loadPosts();
    $("#readerTitle").textContent = "选择一篇文章";
    $("#readerMeta").textContent = "选择文章后可查看内容。";
    $("#readerBody").innerHTML = "";
  } catch (error) {
    updateProgress(entry.id, error.message, 100, "", "failed");
    toast(error.message);
  }
}

function renderPosts() {
  const keyword = $("#searchInput")?.value.trim().toLowerCase() || "";
  const filtered = state.posts.filter((post) => `${post.title} ${post.date} ${(post.tags || []).join(" ")}`.toLowerCase().includes(keyword));
  const html = filtered.map((post) => `
    <button class="item ${state.current?.path === post.path ? "active" : ""}" data-path="${escapeHtml(post.path)}">
      <strong>${escapeHtml(post.title)}</strong>
      <span>${escapeHtml(post.date)} · ${escapeHtml((post.tags || []).join("、"))}</span>
    </button>
  `).join("") || `<div class="item">没有文章</div>`;
  $("#postList").innerHTML = html;
  $("#recentList").innerHTML = html;
}

function openPost(path) {
  state.current = state.posts.find((post) => post.path === path);
  if (!state.current) return;
  $("#readerTitle").textContent = state.current.title;
  $("#readerMeta").textContent = `${state.current.date || ""} · ${state.current.author || ""}`;
  $("#readerBody").innerHTML = markdown(state.current.body || "");
  renderPosts();
  setView("posts");
}

function markdown(source) {
  return escapeHtml(source)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">')
    .split(/\n{2,}/)
    .map((block) => block.startsWith("<h") || block.startsWith("<img") ? block : `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function createProgress(title) {
  const item = { id: String(Date.now()), title, message: "准备开始", percent: 0, path: "", status: "running", time: new Date().toLocaleString() };
  state.progress.unshift(item);
  saveProgress();
  renderProgress();
  return item;
}

function updateProgress(id, message, percent, path = "", status = "running") {
  const item = state.progress.find((entry) => entry.id === id);
  if (!item) return;
  item.message = message;
  item.percent = percent;
  item.path = path || item.path;
  item.status = status;
  saveProgress();
  renderProgress();
}

function saveProgress() {
  localStorage.setItem("siteAdminProgress", JSON.stringify(state.progress.slice(0, 30)));
}

function renderProgress() {
  $("#progressList").innerHTML = state.progress.map((item) => `
    <div class="progress-item">
      <strong>${escapeHtml(item.title)}</strong>
      <div class="bar"><i style="width:${item.percent}%"></i></div>
      <span>${escapeHtml(item.message)}${item.path ? ` · ${escapeHtml(item.path)}` : ""}</span>
    </div>
  `).join("") || `<div class="item">还没有记录</div>`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function toDateInput(value) {
  if (!value) value = new Date();
  const date = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (num) => String(num).padStart(2, "0");
  return `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}T${pad(safe.getHours())}:${pad(safe.getMinutes())}`;
}

function fromDate(value) {
  return value ? `${value.replace("T", " ")}:00` : new Date().toISOString().slice(0, 10) + " 12:00:00";
}

function bind() {
  $$(".nav").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("#newPostBtn").addEventListener("click", () => {
    resetEditor();
    setView("publish");
  });
  $("#saveTokenBtn")?.addEventListener("click", async () => {
    state.apiBase = normalizeApiBase($("#apiInput").value);
    state.password = $("#passwordInput").value;
    if (!state.apiBase) return toast("先填写后端地址");
    if (!state.password) return toast("先填写管理密码");
    localStorage.setItem("siteAdminApiBase", state.apiBase);
    sessionStorage.setItem("siteAdminPassword", state.password);
    $("#passwordInput").value = "";
    renderConnectionState();
    await testBackend();
    await loadPosts().catch((error) => toast(error.message));
  });
  $("#forgetTokenBtn")?.addEventListener("click", () => {
    state.apiBase = "";
    state.password = "";
    localStorage.removeItem("siteAdminApiBase");
    sessionStorage.removeItem("siteAdminPassword");
    renderConnectionState();
    toast("已清除本设备连接信息");
  });
  $("#refreshBtn")?.addEventListener("click", () => loadPosts().catch((error) => toast(error.message)));
  $("#publishBtn")?.addEventListener("click", publishPost);
  $("#cancelEditBtn")?.addEventListener("click", () => {
    resetEditor();
    setView("posts");
  });
  $("#editBtn")?.addEventListener("click", () => {
    if (!state.current) return toast("先选择文章");
    fillEditor(state.current);
  });
  $("#deleteBtn")?.addEventListener("click", deletePost);
  $("#searchInput")?.addEventListener("input", renderPosts);
  $("#postBody")?.addEventListener("input", () => {
    $("#preview").innerHTML = markdown($("#postBody").value);
  });
  $("#postList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-path]");
    if (button) openPost(button.dataset.path);
  });
  $("#recentList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-path]");
    if (button) openPost(button.dataset.path);
  });
  $("#clearProgressBtn")?.addEventListener("click", () => {
    state.progress = [];
    saveProgress();
    renderProgress();
  });
}

bind();
resetEditor();
renderConnectionState();
renderProgress();
testBackend().then(() => {
  if (state.apiBase && state.password) return loadPosts();
}).catch((error) => toast(error.message));
