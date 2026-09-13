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
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
      return json({ ok: false, error: error.message || String(error), status }, status);
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
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error(`GitHub 返回异常（HTTP ${response.status}）`);
      error.status = response.status || 502;
      error.requestPath = path;
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error(`GitHub ${response.status}：${data.message || `请求失败（HTTP ${response.status}）`}`);
    error.status = response.status;
    error.requestPath = path;
    throw error;
  }
  return data;
}

function contentsPath(path) {
  return `/repos/${OWNER}/${REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function listPosts(env) {
  const files = await github(env, `${contentsPath("_posts")}?ref=${encodeURIComponent(BRANCH)}`);
  if (!Array.isArray(files)) throw new Error("GitHub 返回的文章目录格式异常");
  const posts = [];
  for (const file of files.filter((item) => /\.(md|markdown)$/i.test(item.name))) {
    const detail = await github(env, `${contentsPath(file.path)}?ref=${encodeURIComponent(BRANCH)}`);
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
      frontMatter: parsed.frontMatter,
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
  }, body, payload.frontMatter || "");
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
  // Commit both language files in one Git commit. This avoids leaving About
  // half-updated when the second Contents API request fails.
  const ref = await github(env, `/repos/${OWNER}/${REPO}/git/ref/heads/${encodeURIComponent(BRANCH)}`);
  const headSha = ref.object?.sha;
  if (!headSha) throw new Error("无法读取 GitHub 分支状态");
  const [parent, currentZh, currentEn] = await Promise.all([
    github(env, `/repos/${OWNER}/${REPO}/git/commits/${headSha}`),
    readTextFile(env, "_includes/about/zh.md", headSha),
    readTextFile(env, "_includes/about/en.md", headSha),
  ]);
  const zh = String(payload.zh ?? currentZh.content).trim();
  const en = String(payload.en ?? currentEn.content).trim();
  if (!zh && !en) throw new Error("至少填写中文或英文自我介绍");
  if (payload.zhSha && payload.zhSha !== currentZh.sha || payload.enSha && payload.enSha !== currentEn.sha) {
    const error = new Error("自我介绍已发生变化，请重新载入后再保存");
    error.status = 409;
    throw error;
  }
  const blobPath = `/repos/${OWNER}/${REPO}/git/blobs`;
  const [zhBlob, enBlob] = await Promise.all([
    github(env, blobPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: encodeBase64(`${zh}\n`), encoding: "base64" }),
    }),
    github(env, blobPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: encodeBase64(`${en}\n`), encoding: "base64" }),
    }),
  ]);
  const baseTreeSha = parent.tree?.sha;
  if (!baseTreeSha) throw new Error("无法读取 GitHub 文件树");
  const tree = await github(env, `/repos/${OWNER}/${REPO}/git/trees`, {
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
  const commit = await github(env, `/repos/${OWNER}/${REPO}/git/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Update About text", tree: tree.sha, parents: [headSha] }),
  });
  await github(env, `/repos/${OWNER}/${REPO}/git/refs/heads/${encodeURIComponent(BRANCH)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return {
    zh,
    en,
    zhSha: zhBlob.sha,
    enSha: enBlob.sha,
  };
}

async function readTextFile(env, path, ref = BRANCH) {
  const data = await github(env, `${contentsPath(path)}?ref=${encodeURIComponent(ref)}`);
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
    const data = await github(env, `${contentsPath(path)}?ref=${encodeURIComponent(BRANCH)}`);
    return data.sha || "";
  } catch (error) {
    if (error?.status === 404 || String(error.message || "").includes("Not Found")) return "";
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
      const rawValue = pair[2].trim();
      if (!rawValue) {
        data[key] = [];
      } else if (/^\[.*\]$/.test(rawValue)) {
        data[key] = rawValue.slice(1, -1).split(",").map((item) => item.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      } else {
        data[key] = rawValue.replace(/^["']|["']$/g, "");
      }
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
  const lines = [
    "---",
  ];
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
  lines.push("tags:");
  data.tags.filter(Boolean).forEach((tag) => lines.push(`  - ${tag}`));
  lines.push("---", "");
  return `${lines.join("\n")}${body.trim()}\n`;
}

function preserveFrontMatter(frontMatter) {
  const controlled = new Set(["title", "subtitle", "date", "author", "header-img", "tags"]);
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
