import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: BlogStore
    @AppStorage("appearance") private var appearance = "system"
    @AppStorage("readerFontSize") private var fontSize = 19.0

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
                    LabeledContent("版本", value: "2.0.0")
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
    @AppStorage("readerFontSize") private var fontSize = 19.0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack(spacing: 18) {
                        Image("avatar")
                            .resizable()
                            .scaledToFill()
                            .frame(width: 80, height: 80)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .accessibilityLabel("KIMI Blog 头像")
                        VStack(alignment: .leading, spacing: 6) {
                            Text(Site.title).font(.system(.title, design: .serif)).fontWeight(.bold)
                            Text("王琦玮 · 个人博客").foregroundStyle(.secondary)
                        }
                    }.padding(.vertical, 15)
                    Text("在文字里，发现更大的世界。")
                        .font(.system(.title2, design: .serif)).foregroundStyle(Palette.teal)
                    Divider()
                    if store.aboutHtml.isEmpty {
                        Text("这里是王琦玮的个人博客，记录文字、观察与生活。")
                    } else {
                        NativeDocumentView(html: store.aboutHtml, fontSize: fontSize)
                    }
                    Link(destination: Site.url) { Label("访问网站", systemImage: "arrow.up.right.square") }
                        .font(.subheadline).padding(.vertical, 20)
                }
                .padding(24).frame(maxWidth: 760, alignment: .leading).frame(maxWidth: .infinity)
            }.background(Palette.paper).navigationTitle("关于").navigationBarTitleDisplayMode(.inline)
        }
    }
}
