const GITHUB_OWNER = "wangqiwei366";
const GITHUB_REPO = "wangqiwei366.github.io";
const GITHUB_BRANCH = "master";
const DEFAULT_WORKER_URL = "https://wangqiwei366-site-admin.wangqiwei366.workers.dev";

sessionStorage.removeItem("siteAdminGithubToken");
sessionStorage.removeItem("siteAdminPassword");

function readStoredProgress() {
  try {
    const value = JSON.parse(localStorage.getItem("siteAdminProgress") || "[]");
    if (Array.isArray(value)) return value;
  } catch (error) {
    // Ignore damaged local state and start with an empty activity list.
  }
  localStorage.removeItem("siteAdminProgress");
  return [];
}

const state = {
  connectionMode: localStorage.getItem("siteAdminConnectionMode") === "worker" ? "worker" : "github",
  apiBase: localStorage.getItem("siteAdminApiBase") || DEFAULT_WORKER_URL,
  password: "",
  githubToken: "",
  connecting: false,
  operationBusy: false,
  repositoryRevision: 0,
  postsRequest: 0,
  posts: [],
  current: null,
  editing: null,
  about: { zh: "", en: "", zhSha: "", enSha: "" },
  aboutRevision: 0,
  aboutRequest: 0,
  progress: readStoredProgress(),
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
    about: ["自我介绍", "修改网站 About 页面里的个人介绍。"],
    progress: ["发布进度", "查看每次操作记录。"],
  };
  $("#pageTitle").textContent = titles[name][0];
  $("#pageSubtitle").textContent = titles[name][1];
}

function normalizeApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function hasBackendCredential() {
  if (state.connectionMode === "github") return Boolean(state.githubToken);
  return Boolean(state.apiBase && state.password);
}

function requireBackend() {
  if (state.connectionMode === "github") {
    if (!state.githubToken) throw new Error("先填写 GitHub 访问令牌");
    return;
  }
  if (!state.apiBase) throw new Error("先填写后端地址");
  if (!state.password) throw new Error("先填写管理密码");
}

async function api(path, options = {}) {
  requireBackend();
  if (state.connectionMode === "github") return directApi(path, options);
  return workerApi(path, options);
}

async function workerApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`${state.apiBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Password": state.password,
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error("私密后端无法访问，请切换到直接 GitHub");
  }
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`私密后端返回异常（HTTP ${response.status}）`);
  }
  if (!response.ok || !data.ok) throw new Error(data.error || `操作失败（HTTP ${response.status}）`);
  return data;
}

function renderConnectionState(message = "") {
  $$(".mode-button").forEach((button) => {
    const active = button.dataset.mode === state.connectionMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#githubConnectionFields").hidden = state.connectionMode !== "github";
  $("#workerConnectionFields").hidden = state.connectionMode !== "worker";
  $("#apiInput").value = state.apiBase;
  if (!hasBackendCredential()) {
    $("#tokenState").textContent = "未连接";
    $("#tokenState").className = "pill";
    $("#repoState").textContent = "未连接";
  } else {
    $("#tokenState").textContent = message || "已保存，待检查";
    $("#tokenState").className = "pill good";
    $("#repoState").textContent = "待检查";
  }
}

function renderConnectionError(error) {
  const message = connectionErrorMessage(error);
  $("#tokenState").textContent = "连接失败";
  $("#tokenState").className = "pill bad";
  $("#repoState").textContent = "连接失败";
  $("#statusText").textContent = message;
  return message;
}

function connectionErrorMessage(error) {
  if (error?.status === 401) return "GitHub 令牌无效或已过期";
  if (error?.status === 403 && /rate limit/i.test(String(error?.message || ""))) return "GitHub 请求频率过高，请稍后重试";
  if (error?.status === 403 && /personal access token|permission|accessible/i.test(String(error?.message || ""))) {
    return "GitHub 令牌缺少仓库写入权限";
  }
  if (error?.status === 403) return `GitHub 拒绝了请求：${error.message || "HTTP 403"}`;
  if (error?.status === 404 && error?.requestPath === `/repos/${GITHUB_OWNER}/${GITHUB_REPO}`) return "GitHub 令牌无法访问这个仓库";
  if (error?.status === 404) return "GitHub 上找不到所需文件";
  if (error?.status === 409 && /同名文章/.test(String(error?.message || ""))) return error.message;
  if (error?.status === 409 || error?.status === 422) return "内容已发生变化，请刷新后重试";
  const message = String(error?.message || error || "连接失败");
  if (/failed to fetch|networkerror|load failed/i.test(message)) return "无法连接 GitHub，请检查当前网络";
  return message;
}

function setConnectionMode(mode) {
  if (state.connecting || state.operationBusy) return;
  const nextMode = mode === "worker" ? "worker" : "github";
  if (nextMode === state.connectionMode) return;
  state.connectionMode = nextMode;
  localStorage.setItem("siteAdminConnectionMode", state.connectionMode);
  clearRepositoryState();
  renderConnectionState();
}

function setConnectionBusy(busy) {
  state.connecting = busy;
  renderBusyState();
}

function setOperationBusy(busy) {
  state.operationBusy = busy;
  renderBusyState();
}

function renderBusyState() {
  const busy = state.connecting || state.operationBusy;
  $$("button, input, textarea, select").forEach((element) => { element.disabled = busy; });
  $("#saveTokenBtn").textContent = state.connecting ? "连接中" : "连接";
  document.body.setAttribute("aria-busy", String(busy));
}

async function testBackend() {
  if (!hasBackendCredential()) {
    renderConnectionState();
    return;
  }
  const result = await api("/health");
  $("#tokenState").textContent = `已连接：${result.repo}`;
  $("#tokenState").className = "pill good";
  $("#repoState").textContent = "已连接";
  $("#statusText").textContent = "已连接 GitHub";
}

async function directApi(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const payload = options.body ? JSON.parse(options.body) : {};
  if (method === "GET" && path === "/health") {
    const repo = await github(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}`);
    if (repo.permissions?.push === false) {
      const error = new Error("GitHub 令牌缺少仓库写入权限");
      error.status = 403;
      throw error;
    }
    return { ok: true, repo: `${GITHUB_OWNER}/${GITHUB_REPO}` };
  }
  if (method === "GET" && path === "/posts") return { ok: true, posts: await directListPosts() };
  if (method === "POST" && path === "/posts") return { ok: true, post: await directSavePost(payload) };
  if (method === "DELETE" && path === "/posts") return { ok: true, result: await directDeletePost(payload) };
  if (method === "GET" && path === "/about") return { ok: true, about: await directGetAbout() };
  if (method === "POST" && path === "/about") return { ok: true, about: await directSaveAbout(payload) };
  throw new Error("没有这个接口");
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`GitHub 返回异常（HTTP ${response.status}）`);
    }
  }
  if (!response.ok) {
    const error = new Error(data.message || `GitHub 请求失败（HTTP ${response.status}）`);
    error.status = response.status;
    error.requestPath = path;
    throw error;
  }
  return data;
}

function contentsPath(path) {
  const encoded = String(path || "").split("/").map(encodeURIComponent).join("/");
  return `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encoded}`;
}

async function directListPosts() {
  const files = await github(`${contentsPath("_posts")}?ref=${encodeURIComponent(GITHUB_BRANCH)}`);
  const posts = await Promise.all(files.filter((item) => /\.(md|markdown)$/i.test(item.name)).map(async (file) => {
    const detail = await github(`${contentsPath(file.path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`);
    const parsed = parseFrontMatter(decodeBase64(detail.content || ""));
    return {
      path: file.path,
      sha: detail.sha,
      title: parsed.data.title || file.name,
      subtitle: parsed.data.subtitle || "",
      date: parsed.data.date || file.name.slice(0, 10),
      author: parsed.data.author || "",
      image: parsed.data["header-img"] || "",
      tags: parsed.data.tags || [],
      videoUrl: parsed.data.videoUrl || "",
      videoPoster: parsed.data.videoPoster || "",
      videoDuration: parsed.data.videoDuration || "",
      body: parsed.body,
      frontMatter: parsed.frontMatter,
    };
  }));
  return posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function validateVideoUrl(value, label) {
  if (!value) return;
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label}必须是 http(s) 地址`); }
  if (!(url.protocol === "http:" || url.protocol === "https:") || !url.hostname) {
    throw new Error(`${label}必须是 http(s) 地址`);
  }
}

function validateVideoFields(payload) {
  const videoUrl = String(payload.videoUrl || "").trim();
  const videoPoster = String(payload.videoPoster || "").trim();
  const videoDuration = String(payload.videoDuration || "").trim();
  validateVideoUrl(videoUrl, "视频地址");
  validateVideoUrl(videoPoster, "视频封面");
  if (videoPoster && !videoUrl) throw new Error("填写视频封面前请先填写视频地址");
  if (videoDuration.length > 32) throw new Error("视频时长不能超过 32 个字符");
}

async function directSavePost(payload) {
  const title = String(payload.title || "").trim();
  const body = String(payload.body || "").trim();
  if (!title) throw new Error("先填写标题");
  if (!body) throw new Error("先填写正文");
  const date = String(payload.date || new Date().toISOString().slice(0, 10) + " 12:00:00");
  const existingPath = String(payload.path || "").replace(/^\/+/, "");
  const path = existingPath.startsWith("_posts/") ? existingPath : `_posts/${date.slice(0, 10)}-${slug(title)}.md`;
  validateVideoFields(payload);
  const content = renderPost({
    title,
    subtitle: payload.subtitle || "",
    date,
    author: payload.author || "kimi",
    image: payload.image || "",
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    videoUrl: payload.videoUrl || "",
    videoPoster: payload.videoPoster || "",
    videoDuration: payload.videoDuration || "",
  }, body, payload.frontMatter || "");
  let existingSha = String(payload.sha || "");
  if (!existingPath) {
    const conflictSha = await getDirectSha(path);
    if (conflictSha) {
      const error = new Error(`同名文章已存在：${path}`);
      error.status = 409;
      throw error;
    }
  } else if (!existingSha) {
    existingSha = await getDirectSha(path);
  }
  const requestBody = {
    message: existingSha ? `Update ${path}` : `Publish ${path}`,
    content: encodeBase64(content),
    branch: GITHUB_BRANCH,
  };
  if (existingSha) requestBody.sha = existingSha;
  const result = await github(contentsPath(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  return { path, sha: result.content?.sha || "" };
}

async function directDeletePost(payload) {
  const path = String(payload.path || "").replace(/^\/+/, "");
  if (!path.startsWith("_posts/")) throw new Error("只能删除文章文件");
  const sha = payload.sha || await getDirectSha(path);
  if (!sha) return { path, deleted: false };
  await github(contentsPath(path), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: `Delete ${path}`, sha, branch: GITHUB_BRANCH }),
  });
  return { path, deleted: true };
}

async function directGetAbout() {
  const reference = await github(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/ref/heads/${encodeURIComponent(GITHUB_BRANCH)}`);
  const ref = reference.object?.sha;
  if (!ref) throw new Error("无法读取 GitHub 分支状态");
  const [zh, en] = await Promise.all([
    readDirectTextFile("_includes/about/zh.md", ref),
    readDirectTextFile("_includes/about/en.md", ref),
  ]);
  return { zh: zh.content, en: en.content, zhSha: zh.sha, enSha: en.sha };
}

async function directSaveAbout(payload) {
  const zh = String(payload.zh || "").trim();
  const en = String(payload.en || "").trim();
  if (!zh) throw new Error("中文自我介绍不能为空");
  if (!en) throw new Error("英文自我介绍不能为空");
  if (!payload.zhSha || !payload.enSha) throw new Error("请先载入自我介绍再保存");

  const reference = await github(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/ref/heads/${encodeURIComponent(GITHUB_BRANCH)}`);
  const headSha = reference.object?.sha;
  if (!headSha) throw new Error("无法读取 GitHub 分支状态");
  const [parentCommit, currentZh, currentEn] = await Promise.all([
    github(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${headSha}`),
    readDirectTextFile("_includes/about/zh.md", headSha),
    readDirectTextFile("_includes/about/en.md", headSha),
  ]);
  if (currentZh.sha !== payload.zhSha || currentEn.sha !== payload.enSha) {
    const error = new Error("自我介绍已发生变化，请重新载入后再保存");
    error.status = 409;
    throw error;
  }
  const baseTreeSha = parentCommit.tree?.sha;
  if (!baseTreeSha) throw new Error("无法读取 GitHub 文件树");

  const blobPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/blobs`;
  const [zhBlob, enBlob] = await Promise.all([
    github(blobPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: encodeBase64(`${zh}\n`), encoding: "base64" }),
    }),
    github(blobPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: encodeBase64(`${en}\n`), encoding: "base64" }),
    }),
  ]);
  const tree = await github(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [
        { path: "_includes/about/zh.md", mode: "100644", type: "blob", sha: zhBlob.sha },
        { path: "_includes/about/en.md", mode: "100644", type: "blob", sha: enBlob.sha },
      ],
    }),
  });
  const commit = await github(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Update About text", tree: tree.sha, parents: [headSha] }),
  });
  await github(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${encodeURIComponent(GITHUB_BRANCH)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return { zh, en, zhSha: zhBlob.sha, enSha: enBlob.sha };
}

async function readDirectTextFile(path, ref = GITHUB_BRANCH) {
  const data = await github(`${contentsPath(path)}?ref=${encodeURIComponent(ref)}`);
  return { content: decodeBase64(data.content || ""), sha: data.sha || "" };
}

async function getDirectSha(path) {
  try {
    const data = await github(`${contentsPath(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`);
    return data.sha || "";
  } catch (error) {
    if (error?.status === 404) return "";
    throw error;
  }
}

function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: raw, frontMatter: "" };
  const data = {};
  let key = "";
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) {
      key = pair[1];
      data[key] = pair[2].trim().replace(/^["']|["']$/g, "");
      continue;
    }
    const item = line.match(/^\s+-\s*(.*)$/);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(item[1].trim());
    }
  }
  return { data, body: raw.slice(match[0].length), frontMatter: match[1] };
}

function renderPost(data, body, frontMatter = "") {
  const lines = ["---"];
  const preserved = preserveFrontMatter(frontMatter);
  if (preserved.length) {
    lines.push(...preserved);
  } else {
    lines.push('layout: "post"', "published: true", "hidden: false", "managed: true");
  }
  lines.push(
    `title: "${yaml(data.title)}"`,
    `subtitle: "${yaml(data.subtitle)}"`,
    `date: "${yaml(data.date)}"`,
    `author: "${yaml(data.author)}"`,
  );
  if (data.image) lines.push(`header-img: "${yaml(data.image)}"`);
  if (data.videoUrl) lines.push(`videoUrl: "${yaml(data.videoUrl)}"`);
  if (data.videoPoster) lines.push(`videoPoster: "${yaml(data.videoPoster)}"`);
  if (data.videoDuration) lines.push(`videoDuration: "${yaml(data.videoDuration)}"`);
  lines.push("tags:");
  data.tags.filter(Boolean).forEach((tag) => lines.push(`  - ${tag}`));
  lines.push("---", "");
  return `${lines.join("\n")}${body.trim()}\n`;
}

function preserveFrontMatter(frontMatter) {
  const controlled = new Set(["title", "subtitle", "date", "author", "header-img", "tags", "videoUrl", "videoPoster", "videoDuration"]);
  const result = [];
  let skip = false;
  for (const line of String(frontMatter || "").split(/\r?\n/)) {
    const key = line.match(/^([A-Za-z0-9_-]+):(?:\s|$)/);
    if (key) skip = controlled.has(key[1]);
    if (!skip) result.push(line);
  }
  while (result.length && !result[0].trim()) result.shift();
  while (result.length && !result[result.length - 1].trim()) result.pop();
  return result;
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

function yaml(value) {
  return String(value || "").replace(/"/g, '\\"');
}

function decodeBase64(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function loadPosts() {
  const revision = state.repositoryRevision;
  const request = ++state.postsRequest;
  const result = await api("/posts");
  if (revision !== state.repositoryRevision || request !== state.postsRequest) return false;
  state.posts = result.posts || [];
  state.posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  renderPosts();
  $("#postCount").textContent = state.posts.length;
  return true;
}

async function loadAbout() {
  const request = ++state.aboutRequest;
  const revision = state.aboutRevision;
  const result = await api("/about");
  if (request !== state.aboutRequest) return false;
  if (revision !== state.aboutRevision) {
    toast("检测到新的输入，本次载入未覆盖草稿");
    return false;
  }
  state.about = result.about || { zh: "", en: "", zhSha: "", enSha: "" };
  $("#aboutZh").value = state.about.zh || "";
  $("#aboutEn").value = state.about.en || "";
  updateAboutPreview();
  toast("自我介绍已载入");
  return true;
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
  $("#postVideoUrl").value = "";
  $("#postVideoPoster").value = "";
  $("#postVideoDuration").value = "";
  $("#postBody").value = "";
  $("#preview").innerHTML = "";
}

function clearRepositoryState() {
  state.repositoryRevision += 1;
  state.posts = [];
  state.current = null;
  state.editing = null;
  state.about = { zh: "", en: "", zhSha: "", enSha: "" };
  state.aboutRequest += 1;
  state.aboutRevision += 1;
  $("#postCount").textContent = "0";
  $("#readerTitle").textContent = "选择一篇文章";
  $("#readerMeta").textContent = "选择文章后可查看内容。";
  $("#readerBody").innerHTML = "";
  $("#aboutZh").value = "";
  $("#aboutEn").value = "";
  $("#aboutPreview").innerHTML = "";
  resetEditor();
  renderPosts();
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
  $("#postVideoUrl").value = post.videoUrl || "";
  $("#postVideoPoster").value = post.videoPoster || "";
  $("#postVideoDuration").value = post.videoDuration || "";
  $("#postBody").value = post.body || "";
  $("#preview").innerHTML = renderPostPreview(post);
  setView("publish");
}

async function publishPost() {
  if (state.connecting || state.operationBusy) return;
  const title = $("#postTitle").value.trim();
  const body = $("#postBody").value.trim();
  if (!title) return toast("先填写标题");
  if (!body) return toast("先填写正文");
  const isEdit = !!state.editing;
  if (isEdit && state.connectionMode === "worker" && !state.editing.frontMatter) {
    return toast("请切换到直接 GitHub 后再修改这篇文章");
  }
  const payload = {
    title,
    subtitle: $("#postSubtitle").value.trim(),
    date: fromDate($("#postDate").value),
    author: $("#postAuthor").value.trim() || "kimi",
    image: $("#postImage").value.trim(),
    tags: $("#postTags").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
    videoUrl: $("#postVideoUrl").value.trim(),
    videoPoster: $("#postVideoPoster").value.trim(),
    videoDuration: $("#postVideoDuration").value.trim(),
    body,
  };
  try {
    validateVideoFields(payload);
  } catch (error) {
    return toast(error.message);
  }
  if (!isEdit) {
    const candidatePath = `_posts/${payload.date.slice(0, 10)}-${slug(payload.title)}.md`;
    if (state.posts.some((post) => post.path === candidatePath)) {
      return toast(`同名文章已存在：${candidatePath}`);
    }
  }
  if (state.editing) {
    payload.path = state.editing.path;
    payload.sha = state.editing.sha;
    payload.frontMatter = state.editing.frontMatter || "";
  }
  const entry = createProgress(isEdit ? `修改：${title}` : title);
  setOperationBusy(true);
  try {
    let result;
    try {
      updateProgress(entry.id, "整理文章", 25);
      updateProgress(entry.id, isEdit ? "保存修改到后端" : "提交到后端", 55, payload.path || "");
      result = await api("/posts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const message = connectionErrorMessage(error);
      updateProgress(entry.id, message, 100, "", "failed");
      toast(message);
      return;
    }
    updateProgress(entry.id, isEdit ? "修改完成，等待 GitHub Pages 刷新" : "发布完成，等待 GitHub Pages 刷新", 100, result.post?.path || "", "done");
    resetEditor();
    setView("progress");
    toast(isEdit ? "文章已修改" : "文章已发布");
    try {
      await loadPosts();
    } catch (error) {
      toast(`${isEdit ? "文章已修改" : "文章已发布"}，但列表刷新失败`);
    }
  } finally {
    setOperationBusy(false);
  }
}

async function deletePost() {
  if (state.connecting || state.operationBusy) return;
  if (!state.current) return toast("先选择文章");
  if (!confirm("确定删除这篇文章吗？")) return;
  const current = state.current;
  const entry = createProgress(`删除：${current.title}`);
  setOperationBusy(true);
  try {
    try {
      updateProgress(entry.id, "提交删除请求", 55, current.path);
      await api("/posts", {
        method: "DELETE",
        body: JSON.stringify({ path: current.path, sha: current.sha }),
      });
    } catch (error) {
      const message = connectionErrorMessage(error);
      updateProgress(entry.id, message, 100, "", "failed");
      toast(message);
      return;
    }
    updateProgress(entry.id, "删除完成", 100, current.path, "done");
    state.current = null;
    state.editing = null;
    state.posts = state.posts.filter((post) => post.path !== current.path);
    renderPosts();
    $("#postCount").textContent = state.posts.length;
    $("#readerTitle").textContent = "选择一篇文章";
    $("#readerMeta").textContent = "选择文章后可查看内容。";
    $("#readerBody").innerHTML = "";
    toast("文章已删除");
    try {
      await loadPosts();
    } catch (error) {
      toast("文章已删除，但列表刷新失败");
    }
  } finally {
    setOperationBusy(false);
  }
}

async function saveAbout() {
  if (state.connecting || state.operationBusy) return;
  // Keep the loaded version when only one language is edited. This prevents
  // an accidental blank textarea from blocking an otherwise valid About save.
  const zh = $("#aboutZh").value.trim() || String(state.about.zh || "").trim();
  const en = $("#aboutEn").value.trim() || String(state.about.en || "").trim();
  if (!zh && !en) return toast("至少填写中文或英文介绍");
  if (!state.about.zhSha || !state.about.enSha) return toast("请先载入自我介绍再保存");
  const entry = createProgress("修改自我介绍");
  setOperationBusy(true);
  try {
    updateProgress(entry.id, "提交到后端", 45);
    const result = await api("/about", {
      method: "POST",
      body: JSON.stringify({
        zh,
        en,
        zhSha: state.about.zhSha,
        enSha: state.about.enSha,
      }),
    });
    state.about = result.about;
    updateAboutPreview();
    updateProgress(entry.id, "保存完成，等待 GitHub Pages 刷新", 100, "About", "done");
    toast("自我介绍已保存");
    setView("progress");
  } catch (error) {
    const message = connectionErrorMessage(error);
    updateProgress(entry.id, message, 100, "", "failed");
    toast(message);
  } finally {
    setOperationBusy(false);
  }
}

function renderPosts() {
  const keyword = $("#searchInput")?.value.trim().toLowerCase() || "";
  const filtered = state.posts.filter((post) => `${post.title} ${post.date} ${(post.tags || []).join(" ")}`.toLowerCase().includes(keyword));
  const html = filtered.map((post) => `
    <button class="item ${state.current?.path === post.path ? "active" : ""}" data-path="${escapeHtml(post.path)}">
      <strong>${escapeHtml(post.title)}</strong>
      <span>${escapeHtml(post.date)} · ${escapeHtml((post.tags || []).join("、"))}${String(post.videoUrl || "").trim() ? " · ▶ 视频" : ""}</span>
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
  $("#readerBody").innerHTML = renderPostPreview(state.current);
  renderPosts();
  setView("posts");
}

function markdown(source) {
  return restoreSafeFontSpans(escapeHtml(source))
    // Font marks can wrap a whole paragraph or only part of a sentence. The
    // old line-anchored expressions left inline marks visible as raw text.
    .replace(/\[font\s+([^\]]+)\]([\s\S]*?)\[\/font\]/g, (match, attributes, text) => {
      const styles = [];
      String(attributes).replace(/(?:^|\s)(size|weight)=(\d+)/g, (part, name, value) => {
        if (name === "size" && Number(value) >= 10 && Number(value) <= 72) styles.push(`font-size:${value}px`);
        if (name === "weight" && Number(value) >= 100 && Number(value) <= 900) styles.push(`font-weight:${value}`);
        return part;
      });
      return styles.length ? `<span style="${styles.join(";")}">${text}</span>` : text;
    })
    .replace(/^---$/gm, "<hr>")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^\d+\. (.*)$/gm, "<p class=\"ordered-line\">$1</p>")
    .replace(/^- (.*)$/gm, "<p class=\"bullet-line\">$1</p>")
    // Keep emphasis working when the selection spans more than one line.
    // The old `.` based expressions silently left multiline formatting in the
    // preview as raw Markdown, making the toolbar look broken on mobile.
    .replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([\s\S]*?)\*/g, "<em>$1</em>")
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .split(/\n{2,}/)
    .map((block) => /^(<h|<img|<p style|<p class|<blockquote|<hr)/.test(block) ? block : `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function restoreSafeFontSpans(value) {
  return String(value || "").replace(/&lt;span\s+style=&quot;([^&]*)&quot;&gt;([\s\S]*?)&lt;\/span&gt;/gi, (match, rawStyle, text) => {
    const styles = String(rawStyle).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const size = part.match(/^font-size:(\d+)px$/i);
      if (size && Number(size[1]) >= 8 && Number(size[1]) <= 72) return `font-size:${Number(size[1])}px`;
      const weight = part.match(/^font-weight:(\d+)$/i);
      if (weight && Number(weight[1]) >= 100 && Number(weight[1]) <= 900) return `font-weight:${Number(weight[1])}`;
      return "";
    }).filter(Boolean);
    return styles.length ? `<span style="${styles.join(";")}">${text}</span>` : match;
  });
}

function renderVideo(videoUrl, videoPoster, videoDuration) {
  const url = String(videoUrl || "").trim();
  if (!url) return "";
  if (!isHttpUrl(url)) return "";
  const poster = String(videoPoster || "").trim();
  const safePoster = poster && isHttpUrl(poster) ? poster : "";
  const duration = String(videoDuration || "").trim();
  return `<figure class="post-video"><video controls preload="metadata" playsinline${safePoster ? ` poster="${escapeHtml(safePoster)}"` : ""}><source src="${escapeHtml(url)}"></video>${duration ? `<figcaption>视频 · ${escapeHtml(duration)}</figcaption>` : ""}</figure>`;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return Boolean(url.hostname) && (url.protocol === "http:" || url.protocol === "https:");
  } catch { return false; }
}

function renderPostPreview(post) {
  return `${renderVideo(post.videoUrl, post.videoPoster, post.videoDuration)}${markdown(post.body || "")}`;
}

let rememberedBodySelection = { start: 0, end: 0 };

function rememberBodySelection() {
  const textarea = $("#postBody");
  if (!textarea) return;
  rememberedBodySelection = {
    start: Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : 0,
    end: Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : 0,
  };
}

function selectedTextArea() {
  const textarea = $("#postBody");
  if (!textarea) return null;
  // Tapping a toolbar button blurs a textarea on touch browsers and can reset
  // its selection. Restore the last range before applying the requested mark.
  if (document.activeElement !== textarea && rememberedBodySelection) {
    const length = textarea.value.length;
    const start = Math.min(length, Math.max(0, rememberedBodySelection.start));
    const end = Math.min(length, Math.max(start, rememberedBodySelection.end));
    textarea.setSelectionRange(start, end);
  }
  return textarea;
}

function updatePreview() {
  $("#preview").innerHTML = renderPostPreview({
    body: $("#postBody").value,
    videoUrl: $("#postVideoUrl").value,
    videoPoster: $("#postVideoPoster").value,
    videoDuration: $("#postVideoDuration").value,
  });
}

function updateAboutPreview() {
  const zh = $("#aboutZh")?.value || "";
  const en = $("#aboutEn")?.value || "";
  $("#aboutPreview").innerHTML = `
    <h3>中文预览</h3>
    ${markdown(zh)}
    <hr>
    <h3>英文预览</h3>
    ${markdown(en)}
  `;
}

function replaceSelection(transform) {
  const textarea = selectedTextArea();
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const replacement = transform(selected);
  textarea.value = textarea.value.slice(0, start) + replacement + textarea.value.slice(end);
  textarea.focus();
  textarea.setSelectionRange(start, start + replacement.length);
  rememberedBodySelection = { start, end: start + replacement.length };
  updatePreview();
}

function applyFormat(format) {
  const lineWrap = (prefix) => replaceSelection((text) => {
    if (!text) return `${prefix}在这里输入`;
    return text.split(/\n/).map((line) => `${prefix}${line}`).join("\n");
  });
  const inlineWrap = (left, right = left) => replaceSelection((text) => `${left}${text || "在这里输入"}${right}`);
  if (format === "h2") return lineWrap("## ");
  if (format === "h3") return lineWrap("### ");
  if (format === "bold") return inlineWrap("**");
  if (format === "italic") return inlineWrap("*");
  if (format === "quote") return lineWrap("> ");
  if (format === "bullet") return lineWrap("- ");
  if (format === "number") {
    return replaceSelection((text) => text.split(/\n/).map((line, index) => `${index + 1}. ${line}`).join("\n"));
  }
  if (format === "link") return replaceSelection((text) => `[${text || "链接文字"}](https://)`);
  if (format === "image") return replaceSelection((text) => `![${text || "图片描述"}](https://)`);
  if (format === "divider") return replaceSelection(() => "\n\n---\n\n");
}

function applyFontStyle() {
  const size = $("#fontSizeSelect")?.value;
  const weight = $("#fontWeightSelect")?.value;
  if (!size && !weight) return;
  replaceSelection((text) => {
    const styles = [size ? `font-size:${Number(size)}px` : "", weight ? `font-weight:${Number(weight)}` : ""].filter(Boolean).join(";");
    return `<span style="${styles}">${text || "在这里输入"}</span>`;
  });
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

async function connectBackend() {
  if (state.connecting || state.operationBusy) return;
  if (state.connectionMode === "github") {
    state.githubToken = $("#githubTokenInput").value.trim() || state.githubToken;
    if (!state.githubToken) return toast("先填写 GitHub 访问令牌");
  } else {
    state.apiBase = normalizeApiBase($("#apiInput").value);
    state.password = $("#passwordInput").value || state.password;
    if (!state.apiBase) return toast("先填写后端地址");
    if (!state.password) return toast("先填写管理密码");
    localStorage.setItem("siteAdminApiBase", state.apiBase);
  }
  localStorage.setItem("siteAdminConnectionMode", state.connectionMode);
  renderConnectionState("正在连接");
  setConnectionBusy(true);
  try {
    await testBackend();
    await loadPosts();
    $(state.connectionMode === "github" ? "#githubTokenInput" : "#passwordInput").value = "";
    toast("连接成功");
  } catch (error) {
    toast(renderConnectionError(error));
  } finally {
    setConnectionBusy(false);
  }
}

function clearConnection() {
  if (state.connecting || state.operationBusy) return;
  state.apiBase = DEFAULT_WORKER_URL;
  state.password = "";
  state.githubToken = "";
  localStorage.removeItem("siteAdminApiBase");
  sessionStorage.removeItem("siteAdminPassword");
  sessionStorage.removeItem("siteAdminGithubToken");
  $("#githubTokenInput").value = "";
  $("#passwordInput").value = "";
  clearRepositoryState();
  renderConnectionState();
  $("#statusText").textContent = "等待连接 GitHub";
  toast("已清除当前会话连接信息");
}

function updateServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistration("/")
    .then((registration) => registration?.update())
    .catch(() => {});
}

function bind() {
  $$(".nav").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $$(".mode-button").forEach((button) => button.addEventListener("click", () => setConnectionMode(button.dataset.mode)));
  $("#newPostBtn").addEventListener("click", () => {
    resetEditor();
    setView("publish");
  });
  $("#saveTokenBtn")?.addEventListener("click", connectBackend);
  $("#forgetTokenBtn")?.addEventListener("click", clearConnection);
  $("#refreshBtn")?.addEventListener("click", () => loadPosts().catch((error) => toast(connectionErrorMessage(error))));
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
  $("#loadAboutBtn")?.addEventListener("click", () => loadAbout().catch((error) => toast(connectionErrorMessage(error))));
  $("#saveAboutBtn")?.addEventListener("click", saveAbout);
  $("#aboutZh")?.addEventListener("input", () => {
    state.aboutRevision += 1;
    updateAboutPreview();
  });
  $("#aboutEn")?.addEventListener("input", () => {
    state.aboutRevision += 1;
    updateAboutPreview();
  });
  $("#searchInput")?.addEventListener("input", renderPosts);
  $("#postBody")?.addEventListener("input", () => { rememberBodySelection(); updatePreview(); });
  $("#postBody")?.addEventListener("select", rememberBodySelection);
  $("#postBody")?.addEventListener("keyup", rememberBodySelection);
  $("#postBody")?.addEventListener("blur", rememberBodySelection);
  ["#postVideoUrl", "#postVideoPoster", "#postVideoDuration"].forEach((selector) => $(selector)?.addEventListener("input", updatePreview));
  $$(".tool-btn").forEach((button) => {
    // Preserve the textarea caret when a formatting button is tapped on a
    // phone. `mousedown` is cancelled so the button does not steal focus;
    // `selectedTextArea` also restores the saved range for touch browsers.
    button.type = "button";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => applyFormat(button.dataset.format));
  });
  $("#applyFontBtn")?.addEventListener("click", applyFontStyle);
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
updateServiceWorker();
