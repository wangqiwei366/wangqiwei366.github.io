# 评论 Worker 配置

评论注册、登录和评论数据使用 Cloudflare D1 保存。密码只以 PBKDF2-SHA-256 哈希和随机 salt 的形式保存，GitHub 仓库不会写入用户数据。

## 配置 D1

1. 在 Cloudflare Workers & Pages 中创建一个 D1 数据库。
2. 在 Worker 的 Bindings 中添加 D1 Database，变量名必须是 `DB`。
3. 在 D1 Console 执行 [`schema.sql`](./schema.sql) 中的全部语句。
4. 保留现有的 `GITHUB_TOKEN`、`ADMIN_PASSWORD` 私密变量，用于后台文章管理。

没有绑定 `DB` 时，公开评论接口会返回 HTTP 503，并提示完成上述配置；管理员文章接口仍按原有方式工作。

## 公开接口

- `POST /auth/register`：`{ "nickname": "昵称", "password": "至少 8 位密码" }`。返回随机生成的唯一 6 位数字用户 ID（100000–999999）。数据库主键防止重复，发生冲突时自动重新生成。
- `POST /auth/login`：`{ "id": "用户 ID", "password": "密码" }`。返回短期 Bearer token 和用户信息。
- `GET /auth/me`：带 `Authorization: Bearer <token>` 查询当前登录用户。
- `POST /auth/logout`：带 Bearer token 删除当前会话。
- `GET /comments?article=<page.url>`：读取文章评论。
- `POST /comments`：带 Bearer token，提交 `{ "articleId": "<page.url>", "body": "评论内容" }`。
- `DELETE /comments`：带 Bearer token，提交 `{ "id": "评论 ID" }`。服务器只允许本人删除；他人评论返回 403，已删除的评论重复删除返回成功。

评论正文最多 2000 个字符，昵称最多 40 个字符。会话默认 30 天有效，Worker 会在 D1 中保存 token 的 SHA-256 摘要而不是明文 token。

## 2.2.1 评论与用户管理

升级已有数据库时，先执行 `migrations/0002_moderation.sql`，再部署 Worker。迁移只新增账号状态表和索引，不清空用户、会话或评论。新数据库执行完整 `schema.sql` 即可。

网页运营台 `/admin/` 的“评论”面板中包含“评论管理”和“用户管理”。两者均使用现有私密后端管理密码；GitHub 令牌不能作为评论管理凭证。

以下接口均要求 `X-Admin-Password`：

- `GET /admin/comments?q=<关键词>&offset=0`：搜索评论正文、昵称、用户 ID 和文章路径。每页 50 条，返回 `hasMore`。
- `DELETE /admin/comments`：`{ "id": "评论 ID" }`，管理员删除评论。
- `GET /admin/users?q=<关键词>&offset=0`：搜索昵称或用户 ID，返回账号状态、注册时间和评论数，不返回密码哈希、salt 或会话。
- `POST /admin/users`：`{ "id": "用户 ID", "disabled": true }` 停用账号并撤销全部会话；`false` 恢复账号，用户需重新登录。
- `POST /admin/users`：`{ "id": "用户 ID", "nickname": "新昵称" }` 修改昵称并同步已有评论署名。

网页和客户端在各自显示层按“本人优先、组内最新在前”排列评论。删除后各端在下次进入或最多约 10 秒的前台刷新周期内同步；网络离线时在恢复后同步。客户端保留编辑草稿，并丢弃删除前发出的过期读取响应。
