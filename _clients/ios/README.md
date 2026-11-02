> 2.1.2 更新（2026-11-02）：请优先查看 ../RELEASE-2.1.2.md 的版本、构建和签名说明。下面保留原有工程说明。

# KIMI Blog iOS 阅读应用

这是一个原生 SwiftUI 阅读与评论工程。2.1.2 包含文章列表、搜索、归档、阅读、收藏、离线缓存、字号、主题、底部导航，以及与网站通用的评论注册、登录和发布。账号只用于评论，工程不包含管理台，也没有使用 `WKWebView`。

## 在 Mac 上打开和运行

1. 将 `native-apps/ios` 目录复制或拉取到 Mac，使用 Xcode 15 或更新版本打开 `KimiBlog.xcodeproj`。
2. 选择共享 scheme `KimiBlog`，选择 iPhone 或 iPad 模拟器后运行。部署目标是 iOS 16.0，target family 同时包含 iPhone 和 iPad。
3. 选择 `Product > Test`，或在 scheme 的 Test action 中运行 `KimiBlogTests`。

工程已把 `snapshot.json` 和 `Assets.xcassets` 加入 app bundle，首次启动无需网络即可显示随包文章。`home-bg`、`about-bg` 和 `avatar` 是从 `native-apps/shared` 复制的真实站点素材；重新抓取种子后请替换 `KimiBlog/snapshot.json` 并在 Xcode 中确认它仍属于 Resources build phase。

## 真机、签名和分发

在 Xcode 的 app target `Signing & Capabilities` 中选择你自己的 Apple Developer Team，并使用自己的 bundle identifier（默认是 `com.kimi.blog`）。工程没有填写 `DEVELOPMENT_TEAM`，不会占用或暴露任何团队信息。连接真机后选择该设备运行；TestFlight 或 App Store 分发使用 Xcode 的 Archive/Distribute 流程。

源码已通过 GitHub Actions 的 macOS Xcode 构建、iPhone/iPad 模拟器 XCTest，以及未签名设备 Release 构建。没有 Apple 分发证书，因此此下载包是源码，不是可直接安装的 IPA；真机签名和分发仍需自己的 Apple 开发者配置。

## 已完成的检查

Windows 上运行 `./Validate-Project.ps1` 可检查源码引用、XML、图片目录和离线文章。2026-11-01 的 2.0.0 源码已在 macOS CI 通过 iPhone/iPad 测试，覆盖离线种子、正文提取、关于页语言选择、收藏迁移与中文文章评论 ID；真实设备安装和签名未验证。

Mac 上可以运行：

```sh
xcodebuild -list -project KimiBlog.xcodeproj
xcodebuild -project KimiBlog.xcodeproj -scheme KimiBlog -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
xcodebuild -project KimiBlog.xcodeproj -scheme KimiBlog -destination 'platform=iOS Simulator,name=iPhone 16' test
```

测试命令里的设备名称应对应本机已安装的模拟器。

网站仓库的工作流为 `.github/workflows/clients-ios.yml`，独立工程附带 `.github/workflows/ios.yml`。它们在 macOS runner 上选择可用的 iPhone 和 iPad 模拟器，运行 Swift 单元测试，启动原生应用并上传浅色/深色截图及构建日志，并执行不签名的设备 Release 构建。工作流不需要 Apple Developer 密钥，也不会发布到商店。
