import SwiftUI
import AVKit

struct ArticleReader: View {
    @EnvironmentObject private var store: BlogStore
    @AppStorage("readerFontSize") private var fontSize = 19.0
    @State private var saving = false
    let articleID: String

    var body: some View {
        Group {
            if let article = store.article(articleID) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        ArticleHeaderImage(article: article)
                        VStack(alignment: .leading, spacing: 16) {
                            Text(article.tags.map { "#" + $0 }.joined(separator: "  "))
                                .font(.subheadline).foregroundStyle(Palette.teal)
                            Text(article.title)
                                .font(.system(size: 34, weight: .bold, design: .serif))
                                .fixedSize(horizontal: false, vertical: true)
                            if !article.subtitle.isEmpty {
                                Text(article.subtitle).font(.title3).foregroundStyle(.secondary)
                            }
                            HStack {
                                Text("王琦玮 · \(article.date)")
                                Spacer()
                                if store.isFavorite(article) { Label("已收藏", systemImage: "checkmark.circle") }
                            }.font(.caption).foregroundStyle(.secondary)
                            Rectangle().fill(Palette.red).frame(width: 48, height: 3).padding(.top, 5)
                        }
                        if article.contentHtml.isEmpty {
                            VStack(alignment: .leading, spacing: 16) {
                                if store.fetching.contains(articleID) { ProgressView("正在下载正文…") }
                                else {
                                    Text("这篇文章的正文还没有下载。")
                                    Button("下载并阅读") { Task { await store.loadContent(articleID) } }
                                        .buttonStyle(.borderedProminent)
                                }
                            }.padding(.vertical, 24)
                        } else {
                            NativeDocumentView(html: article.contentHtml, baseURL: Site.safeURL(article.url) ?? Site.url, fontSize: fontSize,
                                               extraVideoURL: article.videoUrl.flatMap { Site.safeURL($0, relativeTo: Site.safeURL(article.url) ?? Site.url) })
                            HStack {
                                Rectangle().fill(Palette.teal.opacity(0.3)).frame(height: 1)
                                Text("读到这里，谢谢你。").font(.caption).foregroundStyle(.secondary).fixedSize()
                                Rectangle().fill(Palette.teal.opacity(0.3)).frame(height: 1)
                            }.padding(.top, 28)
                        }
                        CommentsView(articleURL: article.url)
                    }
                    .padding(.horizontal, 24).padding(.vertical, 28)
                    .frame(maxWidth: 760, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                .background(Palette.paper)
                .navigationTitle("阅读")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar(.visible, for: .navigationBar)
                .toolbar {
                    ToolbarItemGroup(placement: .navigationBarTrailing) {
                        Menu {
                            Button { fontSize = min(30, fontSize + 1) } label: { Label("放大字体", systemImage: "textformat.size.larger") }
                            Button { fontSize = max(15, fontSize - 1) } label: { Label("缩小字体", systemImage: "textformat.size.smaller") }
                            Button("默认字号") { fontSize = 19 }
                        } label: { Image(systemName: "textformat.size") }
                            .accessibilityLabel("阅读字号")
                        Button {
                            saving = true
                            Task { await store.toggleFavorite(articleID); saving = false }
                        } label: {
                            if saving { ProgressView() }
                            else { Image(systemName: store.isFavorite(article) ? "bookmark.fill" : "bookmark") }
                        }.disabled(saving || store.fetching.contains(articleID))
                            .accessibilityLabel(store.isFavorite(article) ? "取消收藏" : "收藏并离线保存")
                        if let url = Site.safeURL(article.url) { ShareLink(item: url) }
                    }
                }
                .task(id: articleID) { await store.loadContent(articleID) }
            }
        }
    }
}

private struct ArticleHeaderImage: View {
    let article: Article

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Image("about-bg")
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity)
                .frame(height: 175)
                .clipped()
            LinearGradient(
                colors: [Color.black.opacity(0.06), Color.black.opacity(0.62)],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 175)
            Text(article.year)
                .font(.system(size: 13, weight: .bold, design: .monospaced))
                .foregroundStyle(.white.opacity(0.88))
                .padding(.horizontal, 18)
                .padding(.bottom, 17)
        }
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .accessibilityHidden(true)
    }
}

struct NativeDocumentView: View {
    let html: String
    var baseURL: URL = Site.url
    var fontSize: Double = 19
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
                    Text(block.text).font(.system(size: fontSize)).lineSpacing(fontSize * 0.42)
                        .fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                case .heading(let level):
                    Text(block.text).font(.system(size: fontSize + Double(max(2, 14 - level * 2)), weight: .bold, design: .serif))
                        .padding(.top, 16).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                        .accessibilityAddTraits(.isHeader)
                case .quote:
                    HStack(alignment: .top, spacing: 15) {
                        Rectangle().fill(Palette.teal).frame(width: 3)
                        Text(block.text).font(.system(size: fontSize)).lineSpacing(7)
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
        }.frame(maxWidth: .infinity, alignment: .leading)
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
