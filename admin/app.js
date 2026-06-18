const OWNER = "wangqiwei366";
const REPO = "wangqiwei366.github.io";
const BRANCH = "master";

const state = {
  token: localStorage.getItem("siteAdminToken") || "",
  posts: [],
  current: null,
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
    publish: ["发布新文章", "写完后直接发布到 GitHub。"],
    posts: ["文章管理", "查看或删除已经发布的文章。"],
    progress: ["发布进度", "查看每次操作记录。"],
  };
  $("#pageTitle").textContent = titles[name][0];
  $("#pageSubtitle").textContent = titles[name][1];
}

function requireToken() {
  if (!state.token) throw new Error("先保存 GitHub Token");
}

async function github(path, options = {}) {
  requireToken();
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.message || "GitHub 请求失败");
  return data;
}

function contentsUrl(path) {
  return `/repos/${OWNER}/${REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function testToken() {
  if (!state.token) {
    renderTokenState();
    return;
  }
  try {
    const user = await github("/user");
    $("#tokenState").textContent = `已连接：${user.login}`;
    $("#tokenState").className = "pill good";
    $("#repoState").textContent = "已连接";
  } catch (error) {
    $("#tokenState").textContent = "Token 失效";
    $("#tokenState").className = "pill";
    $("#repoState").textContent = "需重设";
  }
}

function renderTokenState() {
  $("#tokenState").textContent = state.token ? "已保存，待检查" : "未连接";
  $("#tokenState").className = state.token ? "pill good" : "pill";
  $("#repoState").textContent = state.token ? "待检查" : "未连接";
}

async function loadPosts() {
  const files = await github(`${contentsUrl("_posts")}?ref=${BRANCH}`);
  const postFiles = files.filter((file) => /\.(md|markdown)$/i.test(file.name));
  const posts = [];
  for (const file of postFiles) {
    const raw = await fetchRaw(file.download_url);
    const parsed = parsePost(raw);
    posts.push({
      path: file.path,
      sha: file.sha,
      title: parsed.data.title || file.name,
      date: parsed.data.date || file.name.slice(0, 10),
      author: parsed.data.author || "",
      tags: parsed.data.tags || [],
      body: parsed.body,
      raw,
    });
  }
  state.posts = posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  renderPosts();
  $("#postCount").textContent = state.posts.length;
}

async function fetchRaw(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("读取文章失败");
  return response.text();
}

function parsePost(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: raw };
  const data = {};
  let key = "";
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) {
      key = pair[1];
      let value = pair[2].trim();
      value = value.replace(/^["']|["']$/g, "");
      data[key] = value;
      continue;
    }
    const item = line.match(/^\s+-\s*(.*)$/);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(item[1].trim());
    }
  }
  return { data, body: raw.slice(match[0].length) };
}

function renderPostFile(data, body) {
  const lines = [
    "---",
    'layout: "post"',
    `title: "${yaml(data.title)}"`,
    `subtitle: "${yaml(data.subtitle)}"`,
    `date: "${data.date}"`,
    `author: "${yaml(data.author)}"`,
  ];
  if (data.image) lines.push(`header-img: "${yaml(data.image)}"`);
  lines.push("published: true", "hidden: false", "managed: true", "tags:");
  data.tags.forEach((tag) => lines.push(`  - ${tag}`));
  lines.push("---", "");
  return `${lines.join("\n")}${body.trim()}\n`;
}

function yaml(value) {
  return String(value || "").replace(/"/g, '\\"');
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "new-post";
}

async function publishPost() {
  const title = $("#postTitle").value.trim();
  const body = $("#postBody").value.trim();
  if (!title) return toast("先填写标题");
  if (!body) return toast("先填写正文");
  const entry = progress(title);
  try {
    updateProgress(entry.id, "整理文章", 25);
    const date = fromDate($("#postDate").value);
    const tags = $("#postTags").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    const path = `_posts/${date.slice(0, 10)}-${slug(title)}.md`;
    const content = renderPostFile({
      title,
      subtitle: $("#postSubtitle").value.trim(),
      date,
      author: $("#postAuthor").value.trim() || "kimi",
      image: $("#postImage").value.trim(),
      tags,
    }, body);
    updateProgress(entry.id, "上传到 GitHub", 70, path);
    await github(contentsUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Publish ${path}`,
        content: utf8ToBase64(content),
        branch: BRANCH,
      }),
    });
    updateProgress(entry.id, "发布完成，等待 GitHub Pages 刷新", 100, path, "done");
    toast("文章已发布");
    await loadPosts();
    setView("progress");
  } catch (error) {
    updateProgress(entry.id, error.message, 100, "", "failed");
    toast(error.message);
  }
}

async function deletePost() {
  if (!state.current) return toast("先选择文章");
  if (!confirm("确定删除这篇文章吗？")) return;
  const entry = progress(`删除：${state.current.title}`);
  try {
    updateProgress(entry.id, "从 GitHub 删除", 70, state.current.path);
    await github(contentsUrl(state.current.path), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Delete ${state.current.path}`,
        sha: state.current.sha,
        branch: BRANCH,
      }),
    });
    state.current = null;
    updateProgress(entry.id, "删除完成", 100, "", "done");
    toast("文章已删除");
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
  const filtered = state.posts.filter((post) => `${post.title} ${post.date} ${post.tags.join(" ")}`.toLowerCase().includes(keyword));
  const html = filtered.map((post) => `
    <button class="item ${state.current?.path === post.path ? "active" : ""}" data-path="${escapeHtml(post.path)}">
      <strong>${escapeHtml(post.title)}</strong>
      <span>${escapeHtml(post.date)} · ${escapeHtml(post.tags.join("、"))}</span>
    </button>
  `).join("") || `<div class="item">没有文章</div>`;
  $("#postList").innerHTML = html;
  $("#recentList").innerHTML = html;
}

function openPost(path) {
  state.current = state.posts.find((post) => post.path === path);
  if (!state.current) return;
  $("#readerTitle").textContent = state.current.title;
  $("#readerMeta").textContent = `${state.current.date} · ${state.current.author}`;
  $("#readerBody").innerHTML = markdown(state.current.body);
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

function progress(title) {
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

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
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
  const date = value ? new Date(value) : new Date();
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDate(value) {
  return value ? `${value.replace("T", " ")}:00` : new Date().toISOString().slice(0, 10) + " 12:00:00";
}

function bind() {
  $$(".nav").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("#newPostBtn").addEventListener("click", () => setView("publish"));
  $("#saveTokenBtn").addEventListener("click", async () => {
    state.token = $("#tokenInput").value.trim();
    if (!state.token) return toast("先粘贴 Token");
    localStorage.setItem("siteAdminToken", state.token);
    $("#tokenInput").value = "";
    renderTokenState();
    await testToken();
    await loadPosts().catch((error) => toast(error.message));
  });
  $("#forgetTokenBtn").addEventListener("click", () => {
    state.token = "";
    localStorage.removeItem("siteAdminToken");
    renderTokenState();
    toast("已清除本设备 Token");
  });
  $("#refreshBtn").addEventListener("click", () => loadPosts().catch((error) => toast(error.message)));
  $("#publishBtn").addEventListener("click", publishPost);
  $("#deleteBtn").addEventListener("click", deletePost);
  $("#searchInput").addEventListener("input", renderPosts);
  $("#postBody").addEventListener("input", () => {
    $("#preview").innerHTML = markdown($("#postBody").value);
  });
  $("#postList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-path]");
    if (button) openPost(button.dataset.path);
  });
  $("#recentList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-path]");
    if (button) openPost(button.dataset.path);
  });
  $("#clearProgressBtn").addEventListener("click", () => {
    state.progress = [];
    saveProgress();
    renderProgress();
  });
}

bind();
$("#postDate").value = toDateInput();
renderTokenState();
renderProgress();
testToken().then(() => {
  if (state.token) return loadPosts();
}).catch((error) => toast(error.message));
