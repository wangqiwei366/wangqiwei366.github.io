# KIMI Blog 2.1.1

发布日期：2026-11-02。适用于前台阅读客户端。

## 本次更新

- 手机网页的底部导航两侧各增加 10 px 内部留白，最左侧文章选中胶囊不再贴住外框，左右保持对称。
- Android、Windows、iOS 和 HarmonyOS 的评论登录、注册、发布、刷新及退出按钮使用完整胶囊圆角，与导航样式协调。
- Android 评论按钮之间增加 8 dp 间距，同排按钮保持等宽、等高；iOS 评论按钮也统一为等宽胶囊。
- 保留现有阅读界面、底部导航、收藏、字号和文章工具栏。文章与评论仍使用同一网站服务，收藏和阅读设置保存在设备本地。
- 网页下载入口、实际文件、更新说明和 SHA-256 校验清单同步更新为 2.1.1。

## 下载与安装

- Android：2.1.1，versionCode 21001，包名 `com.kimi.blog`，沿用原发布签名，可覆盖安装旧版本。支持 Android 8.0+。
- Windows：产品版本 2.1.1，文件版本 2.1.1.0，原生 WPF EXE。适用于 Windows 10/11 + .NET Framework 4.8。请保存草稿后关闭旧窗口，再打开 `KIMI-Blog-Windows-2.1.1.exe`。
- iPhone/iPad：2.1.1，build 21001，SwiftUI Xcode 源码包。需要 Mac/Xcode 及相应 Apple 签名配置，不是可直接安装的 IPA。
- HarmonyOS NEXT：2.1.1，versionCode 21001，ArkTS 源码包。需要 DevEco Studio、对应 SDK 和设备签名；尚未完成 NEXT 真机验证。
- OpenHarmony API 12：2.1.1 未签名 Stage 开发 HAP，需要设备签名和运行验证，不是正式分发包。

旧版本文件保留，新版统一使用带 `2.1.1` 的文件名。安装包和源码不包含管理密码、账号会话、令牌或签名私钥。后台管理工具不属于本次前台客户端发布。

## 构建与校验

- Windows：`powershell -File windows/Build.ps1 -Test`。
- Android：`powershell -File android/build.ps1`。
- iOS：打开 `ios/KimiBlog.xcodeproj`；自动构建和截图脚本位于 `ios/ci/`。
- OpenHarmony：运行 `harmony/Build-OpenHarmony.ps1`，提供 API 12 SDK、Hvigor CLI、JDK 和 Node 路径。

下载文件大小、构建号和 SHA-256 记录于 `releases.json`；完整校验清单位于 `SHA256SUMS-2.1.1.txt`。
