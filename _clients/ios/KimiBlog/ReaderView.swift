import SwiftUI
import AVKit

struct ArticleReader: View {
    @EnvironmentObject private var store: BlogStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    @AppStorage("readerFontSize") private var fontSize = 17.0
    @State private var saving = false
    let articleID: String
    var body: some View {
        Group {
            if let article = store.article(articleID) {
                GeometryReader { geometry in
                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(spacing: 0) {
                            WebsiteHeader(image: "home-bg", title: article.title, subtitle: article.subtitle, metadata: "作者：kimi · \(article.date)")
                            VStack(alignment: .leading, spacing: 26) {
                                if article.contentHtml.isEmpty {
                                    if store.fetching.contains(articleID) { ProgressView("正在下载正文…") }
                                    else { Button("下载并阅读") { Task { await store.loadContent(articleID) } } }
                                } else {
                                    NativeDocumentView(html: article.contentHtml, baseURL: Site.safeURL(article.url) ?? Site.url, fontSize: fontSize,
                                        extraVideoURL: article.videoUrl.flatMap { Site.safeURL($0, relativeTo: Site.safeURL(article.url) ?? Site.url) })
                                }
                                HStack(spacing: 24) {
                                    Spacer(minLength: 0)
                                    Menu {
                                        Button("放大字号") { fontSize = min(30, fontSize + 1) }
                                        Button("缩小字号") { fontSize = max(15, fontSize - 1) }
                                        Button("默认字号") { fontSize = 17 }
                                    } label: { Image(systemName: "textformat.size") }.accessibilityLabel("阅读字号")
                                    Button {
                                        saving = true; Task { await store.toggleFavorite(articleID); saving = false }
                                    } label: { Image(systemName: store.isFavorite(article) ? "bookmark.fill" : "bookmark") }
                                        .disabled(saving || store.fetching.contains(articleID)).accessibilityLabel(store.isFavorite(article) ? "取消收藏" : "收藏并离线保存")
                                    if let url = Site.safeURL(article.url) { ShareLink(item: url) }
                                }.font(.system(size: 14)).padding(.top, 24)
                            }
                            .padding(.horizontal, sizeClass == .regular ? 66 : 23).padding(.vertical, sizeClass == .regular ? 54 : 28)
                            .modifier(WebsiteCard(radius: sizeClass == .regular ? 26 : 22))
                            .frame(maxWidth: 760).padding(.horizontal, geometry.size.width < 768 ? geometry.size.width * 0.05 + 20 : 40).padding(.top, 72)
                            CommentsView(articleURL: article.url).padding(24).frame(maxWidth: 760).padding(.horizontal, 20).padding(.vertical, 42)
                        }.padding(.bottom, 92).frame(width: geometry.size.width)
                    }.background(Palette.paper)
                }
                .toolbar(.hidden, for: .navigationBar).navigationBarBackButtonHidden(true)
                .overlay(alignment: .topLeading) {
                    Button { dismiss() } label: { Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold)).frame(width: 42, height: 42).background(Palette.paper.opacity(0.95)).clipShape(Circle()) }
                        .accessibilityLabel("返回").padding(.leading, 20).padding(.top, 60)
                }
                .task(id: articleID) { await store.loadContent(articleID) }
            }
        }
    }
}

struct NativeDocumentView: View {
    let html: String
    var baseURL: URL = Site.url
    var fontSize: Double = 17
    var extraVideoURL: URL? = nil

    var body: some View {
        let parsed = NativeHTML.blocks(html, baseURL: baseURL)
        let blocks: [ReaderBlock] = {
            guard let extraVideoURL, !parsed.contains(where: { block in
                if case .video(let url, _) = block.kind { return url == extraVideoURL }
                return false
            }) else { return parsed }
            return parsed + [ReaderBlock(id: parsed.count, kind: .video(extraVideoURL, nil), text: AttributedString())]
        }()
        LazyVStack(alignment: .leading, spacing: 19) {
            ForEach(blocks) { block in
                switch block.kind {
                case .paragraph:
                    Text(block.text).font(Palette.serif(fontSize)).lineSpacing(fontSize * 0.65)
                        .fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                case .heading(let level):
                    Text(block.text).font(.system(size: fontSize + Double(max(2, 14 - level * 2)), weight: .bold, design: .serif))
                        .padding(.top, 16).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                        .accessibilityAddTraits(.isHeader)
                case .quote:
                    HStack(alignment: .top, spacing: 15) {
                        Rectangle().fill(Palette.teal).frame(width: 3)
                        Text(block.text).font(Palette.serif(fontSize)).lineSpacing(7)
                            .foregroundStyle(.secondary).textSelection(.enabled)
                    }.fixedSize(horizontal: false, vertical: true).padding(.vertical, 6)
                case .code:
                    ScrollView(.horizontal) {
                        Text(block.text).font(.system(size: max(14, fontSize - 3), design: .monospaced))
                            .textSelection(.enabled).padding(16)
                    }.background(Palette.teal.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 6))
                case .image(let url, let caption):
                    CachedReaderImage(url: url, caption: caption)
                case .video(let url, let poster):
                    ReaderVideo(url: url, posterURL: poster.flatMap { Site.safeURL($0, relativeTo: baseURL) })
                case .rule:
                    Divider().padding(.vertical, 10)
                }
            }
        }.foregroundStyle(Palette.body).frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ReaderVideo: View {
    let url: URL
    let posterURL: URL?
    @State private var player: AVPlayer?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let player {
                VideoPlayer(player: player)
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .accessibilityLabel("文章视频")
            } else {
                ProgressView("正在加载视频…")
                    .frame(maxWidth: .infinity).frame(minHeight: 160)
                    .background(Palette.teal.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            if posterURL != nil { Text("视频").font(.caption).foregroundStyle(.secondary) }
        }
        .task(id: url) { player = AVPlayer(url: url) }
        .onDisappear { player?.pause() }
    }
}

private struct CachedReaderImage: View {
    let url: URL
    let caption: String
    @State private var image: UIImage?
    @State private var failed = false
    @State private var attempt = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let image {
                Image(uiImage: image).resizable().scaledToFit().accessibilityLabel(caption)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                VStack(spacing: 10) {
                    if failed {
                        Image(systemName: "photo").font(.title2)
                        Text("图片暂时不可用").font(.caption)
                        Button("重试") { failed = false; attempt += 1 }.font(.caption)
                    } else { ProgressView("正在加载图片…") }
                }.frame(maxWidth: .infinity).frame(minHeight: 120)
                    .background(Palette.teal.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 10))
            }
            if !caption.isEmpty && caption != "文章配图" { Text(caption).font(.caption).foregroundStyle(.secondary) }
        }
        .id(url.absoluteString)
        .task(id: "\(url.absoluteString)-\(attempt)") {
            do { image = UIImage(data: try await ImageCache.shared.data(for: url)) }
            catch { if !Task.isCancelled { failed = true } }
        }
    }
}
