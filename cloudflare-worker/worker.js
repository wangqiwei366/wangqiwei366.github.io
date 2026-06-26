const OWNER = "wangqiwei366";
const REPO = "wangqiwei366.github.io";
const BRANCH = "master";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Admin-Password",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return json({ ok: true });
    try {
      if (!env.GITHUB_TOKEN) throw new Error("Worker missing GITHUB_TOKEN");
      if (!env.ADMIN_PASSWORD) throw new Error("Worker missing ADMIN_PASSWORD");
      const password = request.headers.get("X-Admin-Password") || "";
      if (password !== env.ADMIN_PASSWORD) return json({ ok: false, error: "管理密码不正确" }, 401);

      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, repo: `${OWNER}/${REPO}` });
      if (request.method === "GET" && url.pathname === "/posts") return json({ ok: true, posts: await listPosts(env) });
      if (request.method === "POST" && url.pathname === "/posts") return json({ ok: true, post: await savePost(env, await request.json()) });
      if (request.method === "DELETE" && url.pathname === "/posts") return json({ ok: true, result: await deletePost(env, await request.json()) });
      if (request.method === "GET" && url.pathname === "/about") return json({ ok: true, about: await getAbout(env) });
      if (request.method === "POST" && url.pathname === "/about") return json({ ok: true, about: await saveAbout(env, await request.json()) });
      return json({ ok: false, error: "没有这个接口" }, 404);
    } catch (error) {
      return json({ ok: false, error: error.message || String(error) }, 500);
    }
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function github(env, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "wangqiwei366-site-admin-worker",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.message || "GitHub 请求失败");
  return data;
}

function contentsPath(path) {
  return `/repos/${OWNER}/${REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function listPosts(env) {
  const files = await github(env, `${contentsPath("_posts")}?ref=${BRANCH}`);
  const posts = [];
  for (const file of files.filter((item) => /\.(md|markdown)$/i.test(item.name))) {
    const detail = await github(env, `${contentsPath(file.path)}?ref=${BRANCH}`);
    const raw = decodeBase64(detail.content || "");
    const parsed = parseFrontMatter(raw);
    posts.push({
      path: file.path,
      sha: detail.sha,
      title: parsed.data.title || file.name,
      subtitle: parsed.data.subtitle || "",
      date: parsed.data.date || file.name.slice(0, 10),
      author: parsed.data.author || "",
      image: parsed.data["header-img"] || "",
      tags: parsed.data.tags || [],
      body: parsed.body,
    });
  }
  return posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function savePost(env, payload) {
  const title = String(payload.title || "").trim();
  const body = String(payload.body || "").trim();
  if (!title) throw new Error("先填写标题");
  if (!body) throw new Error("先填写正文");
  const date = String(payload.date || new Date().toISOString().slice(0, 10) + " 12:00:00");
  const existingPath = String(payload.path || "").replace(/^\/+/, "");
  const path = existingPath.startsWith("_posts/") ? existingPath : `_posts/${date.slice(0, 10)}-${slug(title)}.md`;
  const content = renderPost({
    title,
    subtitle: payload.subtitle || "",
    date,
    author: payload.author || "kimi",
    image: payload.image || "",
    tags: Array.isArray(payload.tags) ? payload.tags : [],
  }, body);
  const existingSha = payload.sha || await getSha(env, path);
  const requestBody = {
    message: existingSha ? `Update ${path}` : `Publish ${path}`,
    content: encodeBase64(content),
    branch: BRANCH,
  };
  if (existingSha) requestBody.sha = existingSha;
  const result = await github(env, contentsPath(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  return { path, sha: result.content?.sha || "" };
}

async function deletePost(env, payload) {
  const path = String(payload.path || "").replace(/^\/+/, "");
  if (!path.startsWith("_posts/")) throw new Error("只能删除文章文件");
  const sha = payload.sha || await getSha(env, path);
  if (!sha) return { path, deleted: false };
  await github(env, contentsPath(path), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Delete ${path}`,
      sha,
      branch: BRANCH,
    }),
  });
  return { path, deleted: true };
}

async function getAbout(env) {
  const zh = await readTextFile(env, "_includes/about/zh.md");
  const en = await readTextFile(env, "_includes/about/en.md");
  return {
    zh: zh.content,
    en: en.content,
    zhSha: zh.sha,
    enSha: en.sha,
  };
}

async function saveAbout(env, payload) {
  const zh = String(payload.zh || "").trim();
  const en = String(payload.en || "").trim();
  if (!zh) throw new Error("中文自我介绍不能为空");
  if (!en) throw new Error("英文自我介绍不能为空");
  const zhResult = await saveTextFile(env, "_includes/about/zh.md", `${zh}\n`, payload.zhSha, "Update Chinese about text");
  const enResult = await saveTextFile(env, "_includes/about/en.md", `${en}\n`, payload.enSha, "Update English about text");
  return {
    zh,
    en,
    zhSha: zhResult.sha,
    enSha: enResult.sha,
  };
}

async function readTextFile(env, path) {
  const data = await github(env, `${contentsPath(path)}?ref=${BRANCH}`);
  return { content: decodeBase64(data.content || ""), sha: data.sha || "" };
}

async function saveTextFile(env, path, content, sha, message) {
  const existingSha = sha || await getSha(env, path);
  const requestBody = {
    message,
    content: encodeBase64(content),
    branch: BRANCH,
  };
  if (existingSha) requestBody.sha = existingSha;
  const result = await github(env, contentsPath(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  return { path, sha: result.content?.sha || "" };
}

async function getSha(env, path) {
  try {
    const data = await github(env, `${contentsPath(path)}?ref=${BRANCH}`);
    return data.sha || "";
  } catch (error) {
    if (String(error.message || "").includes("Not Found")) return "";
    throw error;
  }
}

function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: raw };
  const data = {};
  let key = "";
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) {
      key = pair[1];
      let value = pair[2].trim().replace(/^["']|["']$/g, "");
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

function renderPost(data, body) {
  const lines = [
    "---",
    'layout: "post"',
    `title: "${yaml(data.title)}"`,
    `subtitle: "${yaml(data.subtitle)}"`,
    `date: "${yaml(data.date)}"`,
    `author: "${yaml(data.author)}"`,
  ];
  if (data.image) lines.push(`header-img: "${yaml(data.image)}"`);
  lines.push("published: true", "hidden: false", "managed: true", "tags:");
  data.tags.filter(Boolean).forEach((tag) => lines.push(`  - ${tag}`));
  lines.push("---", "");
  return `${lines.join("\n")}${body.trim()}\n`;
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
  const clean = String(value || "").replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}
