# KIMI Blog 2.0.0

发布日期：2026-11-01。本文适用于前台阅读客户端。

## 本次更新

- 各端延续网站白色圆角卡片、统一的浅色按钮和阅读排版；保留深色阅读模式。
- 手机主导航位于底部；文章页也保留入口。手机顶部不再显示拥挤的 KIMI Blog 导航品牌字样。
- 原生评论界面支持注册、6 位数字 ID 登录、退出、发布和刷新。账号与网站通用。
- 文章来自 `https://wangqiwei366.github.io/search.json`、文章页面和 RSS；评论来自现有 Cloudflare Worker/D1。评论按网页的百分号编码文章路径关联，中文标题不会生成另一套评论。
- 评论每 30 秒自动刷新，并可手动刷新；文章启动/回到前台或定时刷新，离线仍保留缓存。离线时无法发布评论，联网后需要手动重试，避免重复发送。
- 保留旧收藏与正文缓存，兼容旧 GitHub Pages 地址和自定义域名地址。离线快照包含构建时的全部 9 篇文章。

## 产物与安装边界

- Android：2.0.0（versionCode 20000），`com.kimi.blog`，沿用原发布证书，Android 8.0+。
- Windows：2.0.0.0，原生 WPF EXE，Windows 10/11 + .NET Framework 4.8；没有商业代码签名。
- iOS：2.0.0（build 20000）SwiftUI Xcode 源码；iPhone/iPad 共用。没有 Apple 分发证书，因此下载项是源码，不是可直接安装的 IPA。
- HarmonyOS NEXT：2.0.0 ArkTS Stage 工程，`com.kimi.blog.harmony`。使用 DevEco Studio 与对应的 HarmonyOS SDK，并配置自己的设备签名后构建。未完成华为生产签名或 NEXT 真机安装验证。
- OpenHarmony API 12：从同一 ArkTS 源码真实编译的未签名 Stage 开发包，设备类型 `default`。它用于开发验证，不应当当作已验证的 HarmonyOS NEXT 正式安装包。

## 数据与账号

文章、账号和评论共用现有网站服务；收藏、字号、主题及离线缓存是设备本地设置，不做云端收藏同步。Android 会话用 Android Keystore 加密，Windows 用当前用户 DPAPI，iOS 用 Keychain；鸿蒙会话只保留在内存，完全退出后需要重新登录。安装包不包含管理密码、账号密码、令牌或签名私钥。

## 构建

- `tools/sync_snapshot.py`：抓取完整目录及每篇正文，不受 RSS 最近 10 篇限制；失败时不覆盖快照。
- Windows：`powershell -File windows/Build.ps1 -Test`。
- Android：`powershell -File android/build.ps1`；发布密钥在用户本机的独立签名目录，未随源码分发。
- iOS：打开 `ios/KimiBlog.xcodeproj`，或运行 `ios/ci/build-and-test.sh`、`ios/ci/build-release.sh`。
- OpenHarmony：安装完整 API 12 SDK、JDK、Node 及官方仓库中的 `@ohos/hvigor@5.2.2`、`@ohos/hvigor-ohos-plugin@5.2.2`，运行 `harmony/Build-OpenHarmony.ps1` 并提供 SDK、Hvigor CLI 与 Java 路径。该脚本在独立目录里编译，不修改 NEXT 工程配置。
