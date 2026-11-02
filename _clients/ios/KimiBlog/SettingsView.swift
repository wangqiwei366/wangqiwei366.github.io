import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: BlogStore
    @AppStorage("appearance") private var appearance = "system"
    @AppStorage("readerFontSize") private var fontSize = 17.0

    var body: some View {
        NavigationStack {
            Form {
                Section("阅读习惯") {
                    Picker("外观", selection: $appearance) {
                        Text("跟随系统").tag("system")
                        Text("浅色").tag("light")
                        Text("深色").tag("dark")
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        HStack { Text("正文字号"); Spacer(); Text("\(Int(fontSize))").foregroundStyle(.secondary) }
                        Slider(value: $fontSize, in: 15...30, step: 1).accessibilityLabel("正文字号")
                        Text("让文字以舒适的方式，陪伴每一次阅读。")
                            .font(.system(size: fontSize)).lineSpacing(7).padding(.vertical, 8)
                    }
                }
                Section {
                    LabeledContent("文章", value: "\(store.articles.count) 篇")
                    LabeledContent("离线收藏", value: "\(store.favorites.count) 篇")
                    if let date = store.lastRefresh {
                        LabeledContent("上次更新") { Text(date, style: .date) }
                    }
                    Button { Task { await store.refresh() } } label: {
                        HStack { Text("更新文章"); Spacer(); if store.isRefreshing { ProgressView() } }
                    }.disabled(store.isRefreshing)
                } header: {
                    Text("本机内容")
                } footer: {
                    Text("随应用附带的文章可直接离线阅读。打开的新文章会自动保存在本机；收藏时也会下载正文中的图片。取消收藏不会删除已下载正文。")
                }
                Section("应用") {
                    LabeledContent("名称", value: Site.title)
                    LabeledContent("版本", value: "2.1.2")
                    Text("原生 iPhone 与 iPad 阅读应用").foregroundStyle(.secondary)
                }
            }
            .scrollContentBackground(.hidden).background(Palette.paper)
            .navigationTitle("设置")
        }
    }
}

struct AboutView: View {
    @EnvironmentObject private var store: BlogStore
    @Environment(\.horizontalSizeClass) private var sizeClass
    @AppStorage("readerFontSize") private var fontSize = 17.0
    @State private var showSettings = false
    var body: some View {
        GeometryReader { geometry in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 0) {
                    WebsiteHeader(image: "about-bg", title: "关于", subtitle: "这里是 @王琦玮 的个人博客，与你一起发现更大的世界。")
                    VStack(alignment: .leading, spacing: 28) {
                        NativeDocumentView(html: store.aboutHtml.isEmpty ? "<p>这里是王琦玮的个人博客，记录文字、观察与生活。</p>" : store.aboutHtml, fontSize: fontSize)
                        Button { showSettings = true } label: { Label("阅读设置 · 刷新与外观", systemImage: "slider.horizontal.3") }.font(.system(size: 14))
                        Link("访问网站  ↗", destination: Site.url).font(.system(size: 14))
                        Text("KIMI Blog 2.1.2 · 界面修订版").font(.system(size: 12)).foregroundStyle(Palette.muted)
                    }.padding(sizeClass == .regular ? 66 : 28).modifier(WebsiteCard())
                        .frame(maxWidth: 760).padding(.horizontal, geometry.size.width < 768 ? geometry.size.width * 0.05 + 20 : 40).padding(.vertical, 72)
                }.padding(.bottom, 92).frame(width: geometry.size.width)
            }.background(Palette.paper)
        }.sheet(isPresented: $showSettings) { SettingsView() }
    }
}
