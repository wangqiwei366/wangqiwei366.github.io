# KIMI Blog 2.0.0 · 界面修订版 r2

发布日期：2026-11-01。本文适用于前台阅读客户端。

## r2 界面修订

本次以 2026-11-01 正在使用的网页截图与计算样式重新校准原生界面，而不是旧版 UI 说明。

- 首页采用同一张海报背景、居中阅读区域、白色开始阅读按钮；下方文章使用蓝灰色文字与圆角阴影卡片。
- 归档换成同一张星空背景、白色标题卡、标签胶囊和年份分组；保留搜索与收藏筛选。
- 文章和关于页拆分为背景上的白标题卡与独立正文卡，修正背景图、字体、阅读宽度和留白。
- Android、iPhone/iPad 和鸿蒙使用底部文字胶囊导航；Windows 使用顶部浮动胶囊导航。
- 网页修正滚动后底部导航无法点击和底部空间被旧 CSS 覆盖的问题。
- 移动端内置同一份开源中文衬线字体（Noto Serif CJK 的子集，保留 OFL 授权），避免系统缺字库时回退成黑体；常用中文字体离线可用。
- 下载文件名增加 `-r2`，避免与上一轮 2.0.0 包混淆。显示版本仍为 2.0.0，内部构建号提升。
- 已打开的旧 EXE 窗口不会自动变成新版；请关闭旧窗口后打开 `KIMI-Blog-Windows-2.0.0-r2.exe`。Android 可用相同签名覆盖安装。

## 本次更新

- 各端延续网站白色圆角卡片、统一的浅色按钮和阅读排版；保留深色阅读模式。
- 手机主导航位于底部；文章页也保留入口。手机顶部不再显示拥挤的 KIMI Blog 导航品牌字样。
- 原生评论界面支持注册、6 位数字 ID 登录、退出、发布和刷新。账号与网站通用。
- 文章来自 `https://wangqiwei366.github.io/search.json`、文章页面和 RSS；评论来自现有 Cloudflare Worker/D1。评论按网页的百分号编码文章路径关联，中文标题不会生成另一套评论。
- 评论每 30 秒自动刷新，并可手动刷新；文章启动/回到前台或定时刷新，离线仍保留缓存。离线时无法发布评论，联网后需要手动重试，避免重复发送。
- 保留旧收藏与正文缓存，兼容旧 GitHub Pages 地址和自定义域名地址。离线快照包含构建时的全部 9 篇文章。

## 产物与安装边界

- Android：2.0.0（versionCode 20001），`com.kimi.blog`，沿用原发布证书，Android 8.0+。
- Windows：2.0.0.1，原生 WPF EXE，Windows 10/11 + .NET Framework 4.8；没有商业代码签名。
- iOS：2.0.0（build 20001）SwiftUI Xcode 源码；iPhone/iPad 共用。没有 Apple 分发证书，因此下载项是源码，不是可直接安装的 IPA。
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
