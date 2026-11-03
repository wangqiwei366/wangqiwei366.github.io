import SwiftUI
import Foundation
import UIKit

struct HomeView: View {
    @EnvironmentObject private var store: BlogStore
    @Environment(\.horizontalSizeClass) private var sizeClass
    var onArchive: (String) -> Void
    var onAbout: () -> Void
    var onArticle: (String, CGRect, Bool) -> Void
    private var topics: [(String, Int)] {
        let counts = store.articles.flatMap(\.tags).reduce(into: [String: Int]()) { $0[$1, default: 0] += 1 }
        return Array(counts.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }.prefix(8)).map { ($0.key, $0.value) }
    }
    var body: some View {
        GeometryReader { viewport in
            ScrollViewReader { position in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 0) {
                        HomeHero(width: viewport.size.width, height: viewport.size.width >= 780 ? min(760, max(620, (viewport.size.height + 83) * 0.76)) : max(620, (viewport.size.height + 83) * 0.82)) {
                            withAnimation { position.scrollTo("latest", anchor: .top) }
                        }
                        VStack(alignment: .leading, spacing: 20) {
                            Text("最新文章").font(Palette.serif(sizeClass == .regular ? 38 : 31)).fontWeight(.semibold)
                            Text("独立写作 · 社会观察 · 2026").font(.system(size: 13)).foregroundStyle(Palette.muted)
                            Rectangle().fill(Palette.line).frame(height: 1).padding(.bottom, 12)
                            ForEach(Array(store.articles.enumerated()), id: \.element.id) { entry in
                                ArticleCardButton(article: entry.element, featured: entry.offset == 0, onOpen: onArticle)
                            }
                            Button("查看全部归档  →") { onArchive("") }.font(.system(size: 14)).padding(.top, 20)
                        }
                        .foregroundStyle(Palette.ink).padding(.top, sizeClass == .regular ? 164 : 130)
                        .padding(.bottom, 90).frame(maxWidth: 1120).padding(.horizontal, viewport.size.width * 0.05).id("latest")
                        VStack(alignment: .leading, spacing: 28) {
                            Text("写作主题").font(Palette.serif(34)).fontWeight(.semibold)
                            Text("把事件放回它的时代语境，寻找权力、制度与个体经验之间的联系。")
                                .font(Palette.serif(16)).foregroundStyle(Palette.muted).lineSpacing(8)
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                                ForEach(topics, id: \.0) { item in
                                    Button { onArchive(item.0) } label: {
                                        HStack { Text(item.0).font(Palette.serif(18)); Spacer(); Text(String(format: "%02d", item.1)).font(.system(size: 12)).foregroundStyle(Palette.muted) }
                                            .padding(.vertical, 18).overlay(alignment: .bottom) { Rectangle().fill(Palette.line).frame(height: 1) }
                                    }
                                }
                            }.buttonStyle(.plain)
                        }.foregroundStyle(Palette.ink).frame(maxWidth: 1120).padding(.horizontal, viewport.size.width * 0.05).padding(.vertical, 66)
                        VStack(alignment: .leading, spacing: 22) {
                            Image("avatar").resizable().scaledToFill().frame(width: 116, height: 116).clipShape(RoundedRectangle(cornerRadius: 6))
                            Text("关于王琦玮").font(Palette.serif(32)).foregroundStyle(Palette.ink)
                            Text("这里是 @王琦玮 的个人博客，与你一起发现更大的世界。")
                                .font(Palette.serif(16)).foregroundStyle(Palette.muted).lineSpacing(8)
                            Button("了解更多  →", action: onAbout).font(.system(size: 14)).foregroundStyle(Palette.teal)
                        }.frame(maxWidth: 1120, alignment: .leading).padding(.horizontal, viewport.size.width * 0.05).padding(.vertical, 66)
                        Text("KIMI Blog · © 2026 王琦玮").font(.system(size: 12)).foregroundStyle(Palette.muted).padding(35)
                    }.padding(.bottom, 92).frame(width: viewport.size.width)
                }.background(Palette.paper).refreshable { await store.refresh() }
                    .onAppear {
                        #if DEBUG
                        if ProcessInfo.processInfo.arguments.contains("--qa-motion") {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { position.scrollTo("latest", anchor: .top) }
                        }
                        #endif
                    }
            }
        }
    }
}

private struct HomeHero: View {
    let width: CGFloat
    let height: CGFloat
    let onStart: () -> Void
    var body: some View {
        ZStack {
            Image("home-bg").resizable().scaledToFill().frame(width: width, height: height).clipped()
            LinearGradient(colors: [.black.opacity(0.74), .black.opacity(0.22), .black.opacity(0.08)], startPoint: .leading, endPoint: .trailing)
            VStack(alignment: .leading, spacing: 0) {
                Text("KIMI Blog").font(.custom("Georgia-Bold", size: width >= 768 ? 84 : 56)).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text("离开世界之前，一切都是过程。记录公共议题、社会观察与那些值得被认真讨论的时刻。")
                    .font(Palette.serif(width >= 768 ? 20 : 18)).foregroundStyle(.white.opacity(0.9))
                    .lineSpacing(10).fixedSize(horizontal: false, vertical: true).padding(.top, 28)
                Button(action: onStart) {
                    HStack(spacing: 12) { Text("开始阅读"); Image(systemName: "arrow.right") }
                        .font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.charcoal)
                        .frame(width: 123, height: 48).background(.white).clipShape(RoundedRectangle(cornerRadius: 4))
                }.buttonStyle(.plain).padding(.top, 34)
            }.frame(maxWidth: 780, alignment: .leading).padding(.horizontal, width * 0.05).padding(.top, 64)
        }.frame(width: width, height: height).clipped()
    }
}

struct WebsiteArticleRow: View {
    let article: Article
    var featured = false
    var favorite = false
    @Environment(\.horizontalSizeClass) private var sizeClass
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(article.date.replacingOccurrences(of: "-", with: ".")).font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.red)
            HStack(alignment: .center, spacing: 16) {
                Text(article.title).font(Palette.serif(featured ? (sizeClass == .regular ? 45 : 34) : (sizeClass == .regular ? 26 : 23)))
                    .fontWeight(.semibold).lineSpacing(4).fixedSize(horizontal: false, vertical: true)
                if !featured { Spacer(minLength: 0); Image(systemName: favorite ? "bookmark.fill" : "arrow.right").font(.system(size: 18)) }
            }.foregroundStyle(Palette.ink)
            if !article.subtitle.isEmpty {
                Text(article.subtitle).font(Palette.serif(featured ? 16 : 15)).foregroundStyle(Palette.muted).lineSpacing(6)
            }
            if featured {
                Text(articleExcerpt(article)).font(Palette.serif(16)).foregroundStyle(Palette.body)
                    .lineSpacing(13).fixedSize(horizontal: false, vertical: true)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, sizeClass == .regular ? 36 : 24).padding(.vertical, featured ? (sizeClass == .regular ? 46 : 28) : 26)
            .modifier(WebsiteCard(radius: sizeClass == .regular ? 26 : 22))
    }
}

private func articleExcerpt(_ article: Article) -> String {
    let source = article.contentHtml.isEmpty ? article.subtitle : NativeHTML.blocks(article.contentHtml).map { String($0.text.characters) }.joined(separator: " ")
    let clean = source.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    return clean.count > 180 ? String(clean.prefix(180)) + "…" : clean
}

struct ArticleCardButton: View {
    @EnvironmentObject private var store: BlogStore
    @Environment(\.activeArticleCard) private var activeArticle
    @State private var qaOpened = false
    let article: Article
    var featured = false
    let onOpen: (String, CGRect, Bool) -> Void
    var body: some View {
        WebsiteArticleRow(article: article, featured: featured, favorite: store.isFavorite(article))
            .accessibilityHidden(true)
            .overlay {
                GeometryReader { proxy in
                    cardAction(frame: proxy.frame(in: .named("article-stage")))
                }
            }
            .opacity(activeArticle == article.id ? 0 : 1)
            .allowsHitTesting(activeArticle != article.id)
    }

    private func cardAction(frame: CGRect) -> some View {
        Button { onOpen(article.id, frame, featured) } label: {
            Color.clear.contentShape(Rectangle())
        }
            .buttonStyle(.plain)
            .accessibilityLabel("阅读文章：\(article.title)")
            .task(id: frame) {
                #if DEBUG
                guard featured && !qaOpened && ProcessInfo.processInfo.arguments.contains("--qa-motion"),
                      frame.width > 1, frame.height > 1, frame.maxY > 0,
                      frame.minY < UIScreen.main.bounds.height else { return }
                do { try await Task.sleep(nanoseconds: 3_000_000_000) } catch { return }
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard !qaOpened else { return }
                    qaOpened = true; onOpen(article.id, frame, featured)
                }
                #endif
            }
    }
}
