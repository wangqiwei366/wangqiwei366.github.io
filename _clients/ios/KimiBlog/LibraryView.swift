import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var store: BlogStore
    let favoritesOnly: Bool
    let searchInitially: Bool
    @State private var query = ""
    @State private var selectedTag: String
    @State private var selectedYear = ""
    @FocusState private var searchFocused: Bool
    init(favoritesOnly: Bool, initialTag: String = "", searchInitially: Bool = false) {
        self.favoritesOnly = favoritesOnly; self.searchInitially = searchInitially
        _selectedTag = State(initialValue: initialTag)
    }
    private var filtered: [Article] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return store.articles.filter { article in
            (!favoritesOnly || store.isFavorite(article)) && (selectedTag.isEmpty || article.tags.contains(selectedTag)) &&
            (selectedYear.isEmpty || article.year == selectedYear) &&
            (needle.isEmpty || ([article.title, article.subtitle, article.contentHtml] + article.tags).joined(separator: " ").localizedCaseInsensitiveContains(needle))
        }
    }
    var body: some View {
        GeometryReader { geometry in
            ScrollViewReader { position in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 0) {
                        WebsiteHeader(image: "archive-bg", title: favoritesOnly ? "收藏" : "归档", subtitle: favoritesOnly ? "收藏喜欢的文字，随时继续阅读" : "按年份与主题浏览全部文章")
                        VStack(alignment: .leading, spacing: 24) {
                            FlowTags(tags: [""] + store.tags, selected: $selectedTag, articles: store.articles)
                            HStack(spacing: 12) {
                                Image(systemName: "magnifyingglass")
                                TextField("搜索标题、正文或标签", text: $query).focused($searchFocused).submitLabel(.search)
                            }.font(.system(size: 15)).padding(16).background(Palette.cool).clipShape(RoundedRectangle(cornerRadius: 14)).id("search")
                            HStack {
                                Menu(selectedYear.isEmpty ? "全部年份" : selectedYear) {
                                    Button("全部年份") { selectedYear = "" }
                                    ForEach(store.years, id: \.self) { year in Button(year) { selectedYear = year } }
                                }
                                Spacer()
                                Text("\(filtered.count) 篇文章").foregroundStyle(Palette.muted)
                                Button { Task { await store.refresh() } } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("刷新文章")
                            }.font(.system(size: 13))
                            if filtered.isEmpty { Text(favoritesOnly ? "暂无收藏" : "没有找到文章").foregroundStyle(Palette.muted).padding(.vertical, 40) }
                            ForEach(store.years, id: \.self) { year in
                                let articles = filtered.filter { $0.year == year }
                                if !articles.isEmpty {
                                    Text(year).font(Palette.serif(30)).padding(.top, 24)
                                    ForEach(articles) { article in
                                        ArticleCardButton(article: article)
                                    }
                                }
                            }
                        }.foregroundStyle(Palette.ink).frame(maxWidth: 1120).padding(.horizontal, geometry.size.width * 0.05).padding(.top, 72).padding(.bottom, 70)
                    }.padding(.bottom, 92).frame(width: geometry.size.width)
                }.background(Palette.paper).refreshable { await store.refresh() }
                    .onAppear { if searchInitially { position.scrollTo("search", anchor: .top); searchFocused = true } }
            }
        }
    }
}

private struct FlowTags: View {
    let tags: [String]
    @Binding var selected: String
    let articles: [Article]
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 85), spacing: 12)], alignment: .leading, spacing: 14) {
            ForEach(tags, id: \.self) { tag in
                Button { selected = tag } label: {
                    HStack(spacing: 4) {
                        Text(tag.isEmpty ? "全部文章" : tag)
                        Text("\(tag.isEmpty ? articles.count : articles.filter { $0.tags.contains(tag) }.count)").font(.system(size: 10)).baselineOffset(5)
                    }.font(.system(size: 12)).frame(maxWidth: .infinity).padding(.vertical, 15)
                        .background(selected == tag ? Palette.cool : Palette.paper)
                        .clipShape(Capsule()).overlay(Capsule().stroke(Palette.line, lineWidth: 1))
                }.buttonStyle(.plain)
            }
        }
    }
}
