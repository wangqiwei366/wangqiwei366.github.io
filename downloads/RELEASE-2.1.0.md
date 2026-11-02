# KIMI Blog 2.1.0

发布日期：2026-11-02。适用于前台阅读客户端。

## 本次更新

- Android、Windows、iOS、HarmonyOS NEXT 和 OpenHarmony 开发包的版本统一为 2.1.0。
- 保留当前网页风格、手机底部导航和完整胶囊选中效果。
- 手机文章工具栏保留收藏、字号及原有分享入口，不再显示收藏旁边多余的返回按钮。
- 文章与评论继续共用现有网站服务；收藏、字号、主题和离线缓存仍保存在设备本地。
- 网页下载页的版本文字、下载文件、更新说明和 SHA-256 校验清单同步更新为 2.1.0。

## 下载与安装

- Android：2.1.0，versionCode 21000，包名 `com.kimi.blog`，沿用原发布签名。支持 Android 8.0+，可覆盖安装已有版本。
- Windows：产品版本 2.1.0，文件版本 2.1.0.0，原生 WPF EXE。适用于 Windows 10/11 + .NET Framework 4.8；请保存草稿后关闭旧窗口，再打开 `KIMI-Blog-Windows-2.1.0.exe`。
- iPhone/iPad：2.1.0，build 21000，SwiftUI Xcode 源码包。需要 Mac/Xcode 及相应 Apple 签名配置，不是可直接安装的 IPA。
- HarmonyOS NEXT：2.1.0，versionCode 21000，ArkTS 源码包。需要 DevEco Studio、对应 SDK 和设备签名；未完成 NEXT 真机安装验证。
- OpenHarmony API 12：从相同版本源码编译的未签名 Stage 开发 HAP，需要设备签名及运行验证，不是正式分发包。

旧版下载文件保留，新版统一使用带 `2.1.0` 的文件名。安装包和源码不包含管理密码、账号会话、令牌或签名私钥。后台管理工具不属于本次前台客户端发布。

## 构建

- Windows：`powershell -File windows/Build.ps1 -Test`。
- Android：`powershell -File android/build.ps1`。
- iOS：打开 `ios/KimiBlog.xcodeproj`；自动验证脚本位于 `ios/ci/`。
- OpenHarmony：运行 `harmony/Build-OpenHarmony.ps1`，提供 API 12 SDK、Hvigor CLI、JDK 和 Node 路径。

实际下载文件大小、构建号和 SHA-256 记录于 `releases.json`，完整校验清单位于 `SHA256SUMS-2.1.0.txt`。
