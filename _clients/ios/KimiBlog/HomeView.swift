import SwiftUI
import Foundation

struct HomeView: View {
    @EnvironmentObject private var store: BlogStore
    @State private var showArchive = false
    @State private var showAbout = false
    @State private var archiveTag = ""

    private var featured: Article? { store.articles.first }
    private var remaining: [Article] { Array(store.articles.dropFirst()) }
    private var topicCounts: [(String, Int)] {
        var counts: [String: Int] = [:]
        for article in store.articles {
            for tag in article.tags { counts[tag, default: 0] += 1 }
        }
        let rows: [(String, Int)] = counts.map { ($0.key, $0.value) }
        let sorted = rows.sorted { lhs, rhs in
            if lhs.1 == rhs.1 { return lhs.0 < rhs.0 }
            return lhs.1 > rhs.1
        }
        return Array(sorted.prefix(8))
    }

    var body: some View {
        NavigationStack {
          GeometryReader { viewport in
           ScrollViewReader { position in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 0) {
                    HomeHero(heroHeight: max(460, min(620, viewport.size.height * 0.72))) {
                        withAnimation { position.scrollTo("latest", anchor: .top) }
                    } onSearch: {
                        archiveTag = ""
                        showArchive = true
                    } onArchive: {
                        archiveTag = ""
                        showArchive = true
                    }

                    latestSection.id("latest")
                    topicsSection
                    aboutSection
                    footer
                }
            }
            .background(Palette.paper)
            .refreshable { await store.refresh() }
           }
          }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { articleID in
                ArticleReader(articleID: articleID)
            }
            .sheet(isPresented: $showArchive) {
                LibraryView(favoritesOnly: false, initialTag: archiveTag)
                    .environmentObject(store)
            }
            .sheet(isPresented: $showAbout) {
                AboutView().environmentObject(store)
            }
        }
    }

    private var latestSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .bottom, spacing: 18) {
                Text("最新文章")
                    .font(.system(size: 35, weight: .bold, design: .serif))
                    .foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Text("独立写作 · 社会观察 · 2026")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Palette.muted)
                    .multilineTextAlignment(.trailing)
            }
            .padding(.bottom, 17)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Palette.ink).frame(height: 2)
            }

            if let featured {
                NavigationLink(value: featured.id) {
                    FeaturedArticleRow(article: featured).padding(.horizontal, 20).background(Palette.paper)
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Palette.line.opacity(0.35), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            ForEach(remaining) { article in
                NavigationLink(value: article.id) {
                    HomeArticleRow(article: article, favorite: store.isFavorite(article)).padding(.horizontal, 20).background(Palette.paper)
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Palette.line.opacity(0.35), lineWidth: 1)).padding(.top, 12)
                }
                .buttonStyle(.plain)
            }

            if store.articles.isEmpty {
                VStack(alignment: .leading, spacing: 9) {
                    Text("文章正在准备中")
                        .font(.system(.title3, design: .serif))
                    Text("稍后刷新，或先检查网络连接。")
                        .font(.subheadline)
                        .foregroundStyle(Palette.muted)
                }
                .padding(.vertical, 44)
            }

            Button {
                archiveTag = ""
                showArchive = true
            } label: {
                HStack(spacing: 9) {
                    Text("查看全部归档")
                    Image(systemName: "arrow.right")
                }
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Palette.teal)
                .padding(.top, 27)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .padding(.top, 65)
        .padding(.bottom, 73)
    }

    private var topicsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 28) {
                VStack(alignment: .leading, spacing: 14) {
                    Text("写作主题")
                        .font(.system(size: 32, weight: .bold, design: .serif))
                        .foregroundStyle(.white)
                    Text("把事件放回它的时代语境，寻找权力、制度与个体经验之间的联系。")
                        .font(.system(size: 15))
                        .foregroundStyle(Color.white.opacity(0.65))
                        .lineSpacing(5)
                }
                Spacer(minLength: 0)
            }

            if topicCounts.isEmpty {
                Text("文章标签会在同步后显示。")
                    .font(.subheadline)
                    .foregroundStyle(Color.white.opacity(0.65))
                    .padding(.top, 34)
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 22), GridItem(.flexible(), spacing: 22)], spacing: 0) {
                    ForEach(topicCounts, id: \.0) { item in
                        let topic = item.0
                        let count = item.1
                        Button {
                            archiveTag = topic
                            showArchive = true
                        } label: {
                            HStack {
                                Text(topic)
                                    .font(.system(size: 18, weight: .medium, design: .serif))
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 8)
                                Text(String(format: "%02d", count))
                                    .font(.system(size: 12, design: .monospaced))
                                    .foregroundStyle(Color.white.opacity(0.52))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 67, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(Color.white.opacity(0.25)).frame(height: 1)
                        }
                    }
                }
                .padding(.top, 34)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 67)
        .background(Palette.charcoal)
    }

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack(alignment: .center, spacing: 20) {
                Image("avatar")
                    .resizable()
                    .scaledToFill()
                    .frame(width: 116, height: 116)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .accessibilityLabel("KIMI Blog 头像")

                VStack(alignment: .leading, spacing: 12) {
                    Text("关于王琦玮")
                        .font(.system(size: 30, weight: .bold, design: .serif))
                        .foregroundStyle(Palette.ink)
                    Text("记录公共议题、社会观察与那些值得被认真讨论的时刻。")
                        .font(.system(size: 15))
                        .foregroundStyle(Palette.muted)
                        .lineSpacing(5)
                }
            }

            Button { showAbout = true } label: {
                HStack(spacing: 9) {
                    Text("了解更多")
                    Image(systemName: "arrow.right")
                }
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Palette.teal)
                .padding(.bottom, 5)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Palette.teal).frame(height: 1)
                }
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 66)
        .background(Palette.cool)
    }

    private var footer: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 8) {
                Text("KIMI Blog")
                    .font(.system(size: 21, weight: .bold, design: .serif))
                Text("在文字里，发现更大的世界。")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.muted)
            }
            Spacer()
            Text("© 2026 王琦玮")
                .font(.system(size: 12))
                .foregroundStyle(Palette.muted)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 35)
        .background(Palette.paper)
    }
}

private struct HomeHero: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let heroHeight: CGFloat
    let onStartReading: () -> Void
    let onSearch: () -> Void
    let onArchive: () -> Void

    private var titleSize: CGFloat { horizontalSizeClass == .regular ? 82 : 57 }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .top) {
                Image("home-bg")
                    .resizable()
                    .scaledToFill()
                    .frame(width: proxy.size.width, height: heroHeight)
                    .clipped()
                LinearGradient(
                    colors: [Color.black.opacity(0.72), Color.black.opacity(0.25), Color.black.opacity(0.08)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(width: proxy.size.width, height: heroHeight)
                LinearGradient(
                    colors: [Color.clear, Color.black.opacity(0.5)],
                    startPoint: .center,
                    endPoint: .bottom
                )
                .frame(width: proxy.size.width, height: heroHeight)

                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 20) {
                        Text("阅读").font(.system(size: 16, weight: .medium)).foregroundStyle(Palette.ink)
                        Spacer(minLength: 8)
                        Button("归档", action: onArchive)
                            .font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink)
                        Button(action: onSearch) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 16, weight: .semibold))
                                .frame(width: 39, height: 39)
                                .overlay(Circle().stroke(Color.white.opacity(0.62), lineWidth: 1))
                        }
                        .foregroundStyle(.white)
                        .accessibilityLabel("搜索文章")
                    }
                    .padding(12).background(Palette.paper).clipShape(RoundedRectangle(cornerRadius: 16))
                    .padding(.bottom, 1)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(Color.white.opacity(0.35)).frame(height: 1)
                    }

                    Spacer()

                    VStack(alignment: .leading, spacing: 0) {
                        Text("KIMI Blog")
                            .font(.system(size: titleSize, weight: .bold, design: .serif))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Text("离开世界之前，一切都是过程。\n记录公共议题、社会观察与那些值得被认真讨论的时刻。")
                            .font(.system(size: horizontalSizeClass == .regular ? 20 : 18, design: .serif))
                            .foregroundStyle(Color.white.opacity(0.88))
                            .lineSpacing(7)
                            .padding(.top, 23)
                            .fixedSize(horizontal: false, vertical: true)
                        Button(action: onStartReading) {
                            HStack(spacing: 11) {
                                Text("开始阅读")
                                Image(systemName: "arrow.right")
                            }
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Palette.charcoal)
                            .padding(.horizontal, 18)
                            .frame(height: 48)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 30)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, proxy.safeAreaInsets.top + 15)
                .padding(.bottom, 32)
                .frame(width: proxy.size.width, height: heroHeight, alignment: .topLeading)
            }
            .frame(width: proxy.size.width, height: heroHeight)
        }
        .frame(height: heroHeight)
    }
}

private struct FeaturedArticleRow: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let article: Article

    var body: some View {
        Group {
            if horizontalSizeClass == .compact {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        editorialDateLabel
                        Spacer()
                        arrowLabel
                    }
                    articleBody
                }
            } else {
                HStack(alignment: .top, spacing: 18) {
                    editorialDateLabel
                    articleBody
                    Spacer(minLength: 0)
                    arrowLabel
                }
            }
        }
        .padding(.vertical, 38)
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.line).frame(height: 1) }
    }

    private var editorialDateLabel: some View {
        Text(editorialDate(article.date))
            .font(.system(size: 12, weight: .bold, design: .monospaced))
            .foregroundStyle(Palette.red)
            .frame(width: horizontalSizeClass == .compact ? nil : 76, alignment: .leading)
    }

    private var articleBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(article.title)
                .font(.system(size: horizontalSizeClass == .compact ? 30 : 32, weight: .bold, design: .serif))
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            if !article.subtitle.isEmpty {
                Text(article.subtitle)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Palette.teal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(articleExcerpt(article))
                .font(.system(size: 15, design: .serif))
                .foregroundStyle(Palette.muted)
                .lineSpacing(5)
                .lineLimit(5)
        }
    }

    private var arrowLabel: some View {
        Image(systemName: "arrow.right")
            .font(.system(size: 17, weight: .medium))
            .foregroundStyle(Palette.ink)
            .frame(width: 50, height: 50)
            .overlay(Circle().stroke(Palette.ink, lineWidth: 1))
            .padding(.top, 4)
    }
}

private struct HomeArticleRow: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let article: Article
    let favorite: Bool

    var body: some View {
        Group {
            if horizontalSizeClass == .compact {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        editorialDateLabel
                        Spacer()
                        arrowLabel
                    }
                    articleBody
                }
            } else {
                HStack(alignment: .top, spacing: 17) {
                    editorialDateLabel
                    articleBody
                    Spacer(minLength: 0)
                    arrowLabel
                }
            }
        }
        .padding(.vertical, 26)
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.line).frame(height: 1) }
    }

    private var editorialDateLabel: some View {
        Text(editorialDate(article.date))
            .font(.system(size: 12, weight: .bold, design: .monospaced))
            .foregroundStyle(Palette.red)
            .frame(width: horizontalSizeClass == .compact ? nil : 76, alignment: .leading)
    }

    private var articleBody: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top, spacing: 8) {
                Text(article.title)
                    .font(.system(size: 22, weight: .bold, design: .serif))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if favorite {
                    Image(systemName: "bookmark.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.red)
                        .padding(.top, 5)
                }
            }
            if !article.subtitle.isEmpty {
                Text(article.subtitle)
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.muted)
                    .lineLimit(2)
            }
        }
    }

    private var arrowLabel: some View {
        Image(systemName: "arrow.right")
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(Palette.ink)
            .padding(.top, 5)
    }
}

private func editorialDate(_ value: String) -> String {
    let date = String(value.prefix(10))
    return date.replacingOccurrences(of: "-", with: ".")
}

private func articleExcerpt(_ article: Article, limit: Int = 180) -> String {
    let source = article.contentHtml.isEmpty ? article.subtitle : NativeHTML.blocks(article.contentHtml).map { String($0.text.characters) }.joined(separator: " ")
    let clean = source.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
    guard clean.count > limit else { return clean }
    return String(clean.prefix(limit)) + "…"
}
