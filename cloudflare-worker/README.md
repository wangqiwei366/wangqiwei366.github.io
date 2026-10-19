# 评论 Worker 配置

评论注册、登录和评论数据使用 Cloudflare D1 保存。密码只以 PBKDF2-SHA-256 哈希和随机 salt 的形式保存，GitHub 仓库不会写入用户数据。

## 配置 D1

1. 在 Cloudflare Workers & Pages 中创建一个 D1 数据库。
2. 在 Worker 的 Bindings 中添加 D1 Database，变量名必须是 `DB`。
3. 在 D1 Console 执行 [`schema.sql`](./schema.sql) 中的全部语句。
4. 保留现有的 `GITHUB_TOKEN`、`ADMIN_PASSWORD` 私密变量，用于后台文章管理。

没有绑定 `DB` 时，公开评论接口会返回 HTTP 503，并提示完成上述配置；管理员文章接口仍按原有方式工作。

## 公开接口

- `POST /auth/register`：`{ "nickname": "昵称", "password": "至少 8 位密码" }`。返回自动生成的唯一用户 ID。
- `POST /auth/login`：`{ "id": "用户 ID", "password": "密码" }`。返回短期 Bearer token 和用户信息。
- `GET /auth/me`：带 `Authorization: Bearer <token>` 查询当前登录用户。
- `POST /auth/logout`：带 Bearer token 删除当前会话。
- `GET /comments?article=<page.url>`：读取文章评论。
- `POST /comments`：带 Bearer token，提交 `{ "articleId": "<page.url>", "body": "评论内容" }`。

评论正文最多 2000 个字符，昵称最多 40 个字符。会话默认 30 天有效，Worker 会在 D1 中保存 token 的 SHA-256 摘要而不是明文 token。
