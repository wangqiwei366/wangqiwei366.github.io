const OWNER = "wangqiwei366";
const REPO = "wangqiwei366.github.io";
const BRANCH = "master";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Admin-Password",
};

// Cloudflare's production runtime caps a single PBKDF2 call at 100,000.
const PASSWORD_ITERATIONS = 100000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_NICKNAME_LENGTH = 40;
const MAX_COMMENT_LENGTH = 2000;
const MAX_ARTICLE_LENGTH = 300;
const USER_ID_MIN = 100000;
const USER_ID_COUNT = 900000;
const USER_ID_ATTEMPTS = 12;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return json({ ok: true });
    try {
      const url = new URL(request.url);
      // Public comment and account endpoints must remain usable without the
      // private admin password. The existing content-management routes below
      // keep their original X-Admin-Password protection.
      if (isPublicRoute(request.method, url.pathname)) {
        return await handlePublicRoute(request, env, url);
      }

      if (!env.ADMIN_PASSWORD) throw new Error("Worker missing ADMIN_PASSWORD");
      const password = request.headers.get("X-Admin-Password") || "";
      if (password !== env.ADMIN_PASSWORD) return json({ ok: false, error: "管理密码不正确" }, 401);

      if (url.pathname.startsWith("/admin/")) return await handleModeration(request, env, url);
      if (!env.GITHUB_TOKEN) throw new Error("Worker missing GITHUB_TOKEN");

      if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, repo: `${OWNER}/${REPO}` });
      if (request.method === "GET" && url.pathname === "/posts") return json({ ok: true, posts: await listPosts(env) });
      if (request.method === "POST" && url.pathname === "/posts") return json({ ok: true, post: await savePost(env, await request.json()) });
      if (request.method === "DELETE" && url.pathname === "/posts") return json({ ok: true, result: await deletePost(env, await request.json()) });
      if (request.method === "GET" && url.pathname === "/about") return json({ ok: true, about: await getAbout(env) });
      if (request.method === "POST" && url.pathname === "/about") return json({ ok: true, about: await saveAbout(env, await request.json()) });
      if (request.method === "POST" && url.pathname === "/media") return json({ ok: true, media: await uploadMedia(request, env, url) }, 201);
      return json({ ok: false, error: "没有这个接口" }, 404);
    } catch (error) {
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
      return json({ ok: false, error: error.message || String(error), status }, status);
    }
  },
};

function isPublicRoute(method, pathname) {
  return (method === "DELETE" && pathname === "/comments")
    || (method === "GET" && (pathname === "/comments" || pathname === "/auth/me"))
    || (method === "POST" && (pathname === "/comments" || pathname === "/auth/register" || pathname === "/auth/login" || pathname === "/auth/logout"));
}

async function handlePublicRoute(request, env, url) {
  if (request.method === "DELETE" && url.pathname === "/comments") {
    const session = await requireAuthentication(request, env);
    const { id } = await parseJsonBody(request);
    const commentId = validRecordId(id);
    const db = requireDatabase(env);
    const comment = await db.prepare("SELECT user_id AS userId FROM comments WHERE id = ?").bind(commentId).first();
    if (comment && String(comment.userId) !== String(session.user.id)) throw httpError(403, "只能删除自己发表的评论");
    await db.prepare("DELETE FROM comments WHERE id = ? AND user_id = ?").bind(commentId, session.user.id).run();
    return json({ ok: true, deletedId: commentId });
  }
  if (request.method === "GET" && url.pathname === "/comments") {
    const article = normalizeArticleId(url.searchParams.get("article") || url.searchParams.get("post") || url.searchParams.get("path"));
    if (!article) throw httpError(400, "缺少文章标识");
    const db = requireDatabase(env);
    const result = await db.prepare("SELECT id, article_id AS articleId, user_id AS userId, nickname, body, created_at AS createdAt FROM comments WHERE article_id = ? ORDER BY created_at ASC").bind(article).all();
    const comments = Array.isArray(result.results) ? result.results : [];
    return json({ ok: true, comments });
  }

  if (request.method === "POST" && url.pathname === "/auth/register") {
    const payload = await parseJsonBody(request);
    return json({ ok: true, user: await registerUser(env, payload) }, 201);
  }

  if (request.method === "POST" && url.pathname === "/auth/login") {
    const payload = await parseJsonBody(request);
    const result = await loginUser(env, payload);
    return json({ ok: true, ...result });
  }

  if (request.method === "GET" && url.pathname === "/auth/me") {
    const session = await authenticate(request, env);
    return json({ ok: true, user: session ? publicUser(session.user) : null });
  }

  if (request.method === "POST" && url.pathname === "/auth/logout") {
    await logoutSession(request, env);
    return json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/comments") {
    const session = await requireAuthentication(request, env);
    const payload = await parseJsonBody(request);
    const comment = await createComment(env, session.user, payload);
    return json({ ok: true, comment }, 201);
  }

  return json({ ok: false, error: "没有这个接口" }, 404);
}

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

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validRecordId(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 128) throw httpError(400, "缺少有效 ID");
  return value.trim();
}

// All routes in this handler require the existing private administrator password.
async function handleModeration(request, env, url) {
  const db = requireDatabase(env);
  const offset = Math.max(0, Math.min(1000000, parseInt(url.searchParams.get("offset"), 10) || 0));
  const query = String(url.searchParams.get("q") || "").trim().slice(0, 200);
  const search = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  if (request.method === "GET" && url.pathname === "/admin/comments") {
    const rows = await db.prepare("SELECT id, article_id AS articleId, user_id AS userId, nickname, body, created_at AS createdAt FROM comments WHERE body LIKE ? ESCAPE '\\' OR nickname LIKE ? ESCAPE '\\' OR user_id LIKE ? ESCAPE '\\' OR article_id LIKE ? ESCAPE '\\' ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?")
      .bind(search, search, search, search, offset).all();
    const items = rows.results || [];
    return json({ ok: true, comments: items.slice(0, 50), hasMore: items.length > 50 });
  }
  if (request.method === "DELETE" && url.pathname === "/admin/comments") {
    const id = validRecordId((await parseJsonBody(request)).id);
    await db.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
    return json({ ok: true, deletedId: id });
  }
  if (request.method === "GET" && url.pathname === "/admin/users") {
    const rows = await db.prepare("SELECT u.id, u.nickname, u.created_at AS createdAt, COALESCE(m.disabled, 0) AS disabled, (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id) AS commentCount FROM users u LEFT JOIN user_moderation m ON m.user_id = u.id WHERE u.id LIKE ? ESCAPE '\\' OR u.nickname LIKE ? ESCAPE '\\' ORDER BY u.created_at DESC, u.id DESC LIMIT 51 OFFSET ?")
      .bind(search, search, offset).all();
    const items = rows.results || [];
    return json({ ok: true, users: items.slice(0, 50), hasMore: items.length > 50 });
  }
  if (request.method === "POST" && url.pathname === "/admin/users") {
    const payload = await parseJsonBody(request);
    const id = validRecordId(payload.id);
    if (!(await db.prepare("SELECT id FROM users WHERE id = ?").bind(id).first())) throw httpError(404, "用户不存在");
    const statements = [];
    if (Object.hasOwn(payload, "disabled")) {
      if (typeof payload.disabled !== "boolean") throw httpError(400, "账号状态无效");
      statements.push(db.prepare("INSERT INTO user_moderation (user_id, disabled, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET disabled = excluded.disabled, updated_at = excluded.updated_at")
        .bind(id, payload.disabled ? 1 : 0, new Date().toISOString()));
      if (payload.disabled) statements.push(db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id));
    }
    if (Object.hasOwn(payload, "nickname")) {
      const nickname = cleanNickname(payload.nickname);
      statements.push(db.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(nickname, id));
      statements.push(db.prepare("UPDATE comments SET nickname = ? WHERE user_id = ?").bind(nickname, id));
    }
    if (!statements.length) throw httpError(400, "请选择要修改的账号状态或昵称");
    await db.batch(statements);
    return json({ ok: true });
  }
  return json({ ok: false, error: "没有这个接口" }, 404);
}

async function parseJsonBody(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw httpError(400, "请求内容不是有效的 JSON");
  }
}

function normalizeArticleId(value) {
  const article = String(value || "").trim();
  if (!article || article.length > MAX_ARTICLE_LENGTH || /[\u0000-\u001f\u007f]/.test(article)) return "";
  return article;
}

function publicUser(user) {
  return {
    id: String(user.id),
    nickname: String(user.nickname),
    createdAt: String(user.createdAt || user.created_at || ""),
  };
}

function requireDatabase(env) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    throw httpError(503, "评论服务尚未配置 Cloudflare D1，请为 Worker 绑定名为 DB 的 D1 数据库并执行 schema.sql");
  }
  return env.DB;
}

function cleanNickname(value) {
  const nickname = String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!nickname) throw httpError(400, "请设置昵称");
  if (nickname.length > MAX_NICKNAME_LENGTH) throw httpError(400, `昵称不能超过 ${MAX_NICKNAME_LENGTH} 个字符`);
  return nickname;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 8) throw httpError(400, "密码至少需要 8 个字符");
  if (password.length > 128) throw httpError(400, "密码不能超过 128 个字符");
  return password;
}

function generateUserId() {
  // Rejection sampling keeps all six-digit IDs equally likely. The users
  // primary key below is the final uniqueness check, including concurrent signups.
  const random = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / USER_ID_COUNT) * USER_ID_COUNT;
  do {
    crypto.getRandomValues(random);
  } while (random[0] >= limit);
  return String(USER_ID_MIN + random[0] % USER_ID_COUNT);
}

async function registerUser(env, payload) {
  const nickname = cleanNickname(payload.nickname);
  const password = validatePassword(payload.password);
  const db = requireDatabase(env);
  const passwordSalt = new Uint8Array(16);
  crypto.getRandomValues(passwordSalt);
  const passwordHash = await derivePasswordHash(password, passwordSalt);
  const createdAt = new Date().toISOString();
  for (let attempt = 0; attempt < USER_ID_ATTEMPTS; attempt += 1) {
    const id = generateUserId();
    try {
      await db.prepare("INSERT INTO users (id, nickname, password_hash, password_salt, iterations, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, nickname, passwordHash, bytesToBase64Url(passwordSalt), PASSWORD_ITERATIONS, createdAt).run();
      return publicUser({ id, nickname, createdAt });
    } catch (error) {
      if (!/unique constraint failed:\s*users\.id/i.test(String(error?.message || ""))) throw error;
    }
  }
  throw httpError(503, "暂时无法分配用户 ID，请稍后重试");
}

async function loginUser(env, payload) {
  const id = String(payload.id || payload.userId || "").trim();
  const password = String(payload.password || "");
  if (!id || !password) throw httpError(400, "请输入用户 ID 和密码");
  if (!/^[1-9][0-9]{5}$/.test(id)) throw httpError(400, "请输入 6 位数字用户 ID");
  const db = requireDatabase(env);
  const user = await db.prepare("SELECT u.id, u.nickname, password_hash AS passwordHash, password_salt AS passwordSalt, iterations, created_at AS createdAt, COALESCE(m.disabled, 0) AS disabled FROM users u LEFT JOIN user_moderation m ON m.user_id = u.id WHERE u.id = ?").bind(id).first();
  if (!user || !(await verifyPassword(password, user))) throw httpError(401, "用户 ID 或密码不正确");
  if (user.disabled) throw httpError(403, "该账号已被停用，请联系管理员");
  const token = await createSessionToken(env, user);
  const tokenHash = await hashSessionToken(token);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const inserted = await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) SELECT ?, u.id, ?, ? FROM users u LEFT JOIN user_moderation m ON m.user_id = u.id WHERE u.id = ? AND COALESCE(m.disabled, 0) = 0")
    .bind(tokenHash, expiresAt, new Date().toISOString(), user.id).run();
  if (!inserted.meta?.changes) throw httpError(403, "该账号已被停用，请联系管理员");
  return { token, expiresAt: new Date(expiresAt * 1000).toISOString(), user: publicUser(user) };
}

async function createComment(env, user, payload) {
  const articleId = normalizeArticleId(payload.articleId || payload.article || payload.post || payload.path);
  const body = String(payload.body ?? payload.content ?? payload.text ?? "").trim();
  if (!articleId) throw httpError(400, "缺少文章标识");
  if (!body) throw httpError(400, "评论内容不能为空");
  if (body.length > MAX_COMMENT_LENGTH) throw httpError(400, `评论不能超过 ${MAX_COMMENT_LENGTH} 个字符`);
  const comment = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${generateUserId()}`,
    articleId,
    userId: String(user.id),
    nickname: String(user.nickname),
    body,
    createdAt: new Date().toISOString(),
  };
  const db = requireDatabase(env);
  const result = await db.prepare("INSERT INTO comments (id, article_id, user_id, nickname, body, created_at) SELECT ?, ?, u.id, u.nickname, ?, ? FROM users u LEFT JOIN user_moderation m ON m.user_id = u.id WHERE u.id = ? AND COALESCE(m.disabled, 0) = 0")
    .bind(comment.id, comment.articleId, comment.body, comment.createdAt, comment.userId).run();
  if (!result.meta?.changes) throw httpError(401, "账号不可用，请重新登录");
  return comment;
}

async function requireAuthentication(request, env) {
  const session = await authenticate(request, env);
  if (!session) throw httpError(401, "请先登录后再评论");
  return session;
}

async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const db = requireDatabase(env);
  try {
    const token = match[1].trim();
    if (!token || token.length > 512) return null;
    const tokenHash = await hashSessionToken(token);
    const now = Math.floor(Date.now() / 1000);
    const session = await db.prepare("SELECT u.id, u.nickname, u.created_at AS createdAt, s.expires_at AS expiresAt FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN user_moderation m ON m.user_id = u.id WHERE s.token_hash = ? AND COALESCE(m.disabled, 0) = 0").bind(tokenHash).first();
    if (!session || Number(session.expiresAt) <= now) {
      if (session) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
      return null;
    }
    return { user: session.user || session };
  } catch {
    return null;
  }
}

async function derivePasswordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

async function verifyPassword(password, user) {
  const salt = base64UrlToBytes(user.passwordSalt);
  const hash = await derivePasswordHash(password, salt, Number(user.iterations) || PASSWORD_ITERATIONS);
  return constantTimeEqual(base64UrlToBytes(hash), base64UrlToBytes(user.passwordHash));
}

async function createSessionToken(env, user) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hashSessionToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function logoutSession(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return;
  const token = match[1].trim();
  if (!token) return;
  const db = requireDatabase(env);
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashSessionToken(token)).run();
}

function constantTimeEqual(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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

// Accept a binary file, then stream base64 into the GitHub Contents request.
// Never hold a whole video plus a base64/JSON copy in Worker memory.
async function uploadMedia(request, env, url) {
  const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
  const name = url.searchParams.get('name') || '';
  const extension = name.split('.').pop().toLowerCase();
  const type = request.headers.get('Content-Type')?.split(';')[0];
  const id = url.searchParams.get('id') || '';
  const month = url.searchParams.get('month') || '';
  const size = Number(url.searchParams.get('size'));
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id) || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw httpError(400, '上传标识无效');
  if (!Object.hasOwn(types,extension) || types[extension] !== type) throw httpError(415, '不支持这种文件类型，请选择图片或 MP4、MOV、WebM 视频');
  const limit = (type.startsWith('video/') ? 50 : 20) * 1024 * 1024;
  if (!Number.isSafeInteger(size) || size <= 0 || size > limit) throw httpError(413, `文件大小需在 1 字节到 ${limit / 1024 / 1024} MB 之间`);
  if (!request.body) throw httpError(400, '没有收到文件');
  const path = `media/uploads/${month}/${id}.${extension}`;
  const reader = request.body.getReader();
  let first = new Uint8Array(0);
  while(first.length < Math.min(16,size)) {
    const chunk=await reader.read();if(chunk.done)break;
    const joined=new Uint8Array(first.length+chunk.value.length);joined.set(first);joined.set(chunk.value,first.length);first=joined;
  }
  const ascii = (a,b) => String.fromCharCode(...first.slice(a,b));
  const valid = type === 'image/jpeg' ? first[0]===255&&first[1]===216&&first[2]===255
    : type === 'image/png' ? first.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'
    : type === 'image/gif' ? /^GIF8[79]a$/.test(ascii(0,6))
    : type === 'image/webp' ? ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'
    : type === 'video/webm' ? first.slice(0,4).join(',')==='26,69,223,163'
    : type === 'image/avif' ? ascii(4,8)==='ftyp'&&/^(avif|avis)$/.test(ascii(8,12))
    : ascii(4,8)==='ftyp' && !/^(heic|heix|mif1|avif|avis)$/.test(ascii(8,12));
  if(!valid){await reader.cancel();throw httpError(415,'文件内容与扩展名不一致，请重新导出后上传');}
  if(first.length>size){await reader.cancel();throw httpError(400,'文件长度不一致');}
  const resultURL = commit => ({path,url:`https://${OWNER}.github.io/${path}`,previewUrl:`https://raw.githubusercontent.com/${OWNER}/${REPO}/${commit||BRANCH}/${path}`,size});
  if(url.searchParams.get('retry')==='1'){
    try {
      const existing=await github(env,`${contentsPath(path)}?ref=${BRANCH}`);
      if(existing.size===size){await reader.cancel();return resultURL();}
      await reader.cancel();throw httpError(409,'这个上传标识已存在，请移除任务后重新选择文件');
    } catch(error){if(error.status!==404)throw error;}
  }
  const prefix=JSON.stringify({message:`Upload media ${path}`,branch:BRANCH}).slice(0,-1)+',"content":"';
  const encoder=new TextEncoder();
  let bytes=first,total=first.length,phase=0;
  const stream=new ReadableStream({
    async pull(controller){
      try{
        if(phase===0){phase=1;controller.enqueue(encoder.encode(prefix));return;}
        while(bytes.length<3){
          const chunk=await reader.read();
          if(chunk.done){
            if(total!==size)throw new Error('文件上传不完整，请重试');
            controller.enqueue(encoder.encode((bytes.length?btoa(String.fromCharCode(...bytes)):'')+'"}'));controller.close();return;
          }
          total+=chunk.value.length;if(total>size||total>limit)throw new Error('文件大小超过限制');
          const joined=new Uint8Array(bytes.length+chunk.value.length);joined.set(bytes);joined.set(chunk.value,bytes.length);bytes=joined;
        }
        const part=bytes.subarray(0,Math.min(bytes.length-bytes.length%3,49152));
        controller.enqueue(encoder.encode(btoa(String.fromCharCode(...part))));bytes=bytes.slice(part.length);
      }catch(error){await reader.cancel().catch(()=>{});controller.error(error);}
    },
    cancel(reason){return reader.cancel(reason);},
  });
  const result=await github(env,contentsPath(path),{method:'PUT',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'});
  return resultURL(result.commit?.sha);
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
      videoUrl: parsed.data.videoUrl || "",
      videoPoster: parsed.data.videoPoster || "",
      videoDuration: parsed.data.videoDuration || "",
      body: parsed.body,
      frontMatter: parsed.frontMatter,
    });
  }
  return posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function validateVideoFields(payload) {
  const videoUrl = String(payload.videoUrl || "").trim();
  const videoPoster = String(payload.videoPoster || "").trim();
  const videoDuration = String(payload.videoDuration || "").trim();
  for (const [value, label] of [[videoUrl, "视频地址"], [videoPoster, "视频封面"]]) {
    if (!value) continue;
    let url;
    try { url = new URL(value); } catch { throw new Error(`${label}必须是 http(s) 地址`); }
    if (!(url.protocol === "http:" || url.protocol === "https:") || !url.hostname) throw new Error(`${label}必须是 http(s) 地址`);
  }
  if (videoPoster && !videoUrl) throw new Error("填写视频封面前请先填写视频地址");
  if (videoDuration.length > 32) throw new Error("视频时长不能超过 32 个字符");
}

async function savePost(env, payload) {
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
