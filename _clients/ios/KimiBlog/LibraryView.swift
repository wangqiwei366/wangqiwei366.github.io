import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var store: BlogStore
    let favoritesOnly: Bool
    let initialTag: String
    @State private var selection: String?
    @State private var query = ""
    @State private var selectedTag = ""
    @State private var selectedYear = ""

    init(favoritesOnly: Bool, initialTag: String = "") {
        self.favoritesOnly = favoritesOnly
        self.initialTag = initialTag
        _selectedTag = State(initialValue: initialTag)
    }

    private var filtered: [Article] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return store.articles.filter { article in
            (!favoritesOnly || store.isFavorite(article)) &&
            (selectedTag.isEmpty || article.tags.contains(selectedTag)) &&
            (selectedYear.isEmpty || article.year == selectedYear) &&
            (needle.isEmpty || ([article.title, article.subtitle] + article.tags).joined(separator: " ").localizedCaseInsensitiveContains(needle))
        }
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $selection) {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 1).fill(Palette.red).frame(width: 24, height: 3)
                            Text(favoritesOnly ? "YOUR READING SHELF" : "A PERSONAL JOURNAL")
                                .font(.system(size: 10, weight: .bold, design: .monospaced)).tracking(1.5)
                        }.foregroundStyle(Palette.red)
                        Text(favoritesOnly ? "我的收藏" : "文章归档")
                            .font(.system(size: 29, weight: .bold, design: .serif)).lineSpacing(5)
                        Text(favoritesOnly ? "收藏的正文保存在本机，随时离线阅读。" : "王琦玮的文字、观察与生活。")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }.padding(.vertical, 12)
                }.listRowBackground(Color.clear).listRowSeparator(.hidden)

                Section {
                    HStack {
                        Menu {
                            Button("全部标签") { selectedTag = "" }
                            ForEach(store.tags, id: \.self) { tag in Button(tag) { selectedTag = tag } }
                        } label: {
                            Label(selectedTag.isEmpty ? "标签" : selectedTag, systemImage: "number")
                                .lineLimit(1)
                        }
                        Spacer()
                        Menu {
                            Button("全部年份") { selectedYear = "" }
                            ForEach(store.years, id: \.self) { year in Button(year) { selectedYear = year } }
                        } label: { Label(selectedYear.isEmpty ? "归档" : selectedYear, systemImage: "calendar") }
                        if !selectedTag.isEmpty || !selectedYear.isEmpty {
                            Button { selectedTag = ""; selectedYear = "" } label: { Image(systemName: "xmark.circle.fill") }
                                .accessibilityLabel("清除筛选")
                        }
                    }.font(.subheadline).foregroundStyle(Palette.teal)
                }.listRowBackground(Color.clear)

                Section {
                    if filtered.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Image(systemName: favoritesOnly ? "bookmark" : "magnifyingglass").font(.title2)
                            Text(favoritesOnly && query.isEmpty ? "还没有收藏" : "没有找到文章").font(.headline)
                        }.padding(.vertical, 20)
                    }
                    ForEach(filtered) { article in
                        NavigationLink(value: article.id) {
                            ArticleRow(article: article, favorite: store.isFavorite(article))
                        }
                    }.listRowBackground(Color.clear)
                } header: {
                    HStack {
                        Text(favoritesOnly ? "我的收藏" : "全部文章")
                        Spacer()
                        Text("\(filtered.count) 篇").monospacedDigit()
                    }.font(.caption)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Palette.paper)
            .navigationTitle(favoritesOnly ? "离线书架" : Site.title)
            .navigationBarTitleDisplayMode(.inline)
            .navigationSplitViewColumnWidth(min: 300, ideal: 370, max: 460)
            .searchable(text: $query, prompt: "搜索标题、摘要或标签")
            .refreshable { await store.refresh() }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    if store.isRefreshing { ProgressView() }
                    else {
                        Button { Task { await store.refresh() } } label: { Image(systemName: "arrow.clockwise") }
                            .accessibilityLabel("刷新文章")
                    }
                }
            }
        } detail: {
            if let selection, store.article(selection) != nil {
                ArticleReader(articleID: selection)
            } else {
                VStack(spacing: 20) {
                    Image(systemName: "book.closed").font(.system(size: 48, weight: .ultraLight)).foregroundStyle(Palette.red)
                    Text("给阅读留一点时间").font(.system(.title2, design: .serif)).fontWeight(.semibold)
                    Text("从左侧选一篇文章，开始阅读。")
                        .font(.subheadline).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, maxHeight: .infinity).background(Palette.paper)
            }
        }
    }
}

private struct ArticleRow: View {
    let article: Article
    let favorite: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text(article.date).font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
                Spacer()
                if favorite { Image(systemName: "bookmark.fill").font(.caption).foregroundStyle(Palette.red) }
            }
            Text(article.title).font(.system(size: 21, weight: .semibold, design: .serif)).fixedSize(horizontal: false, vertical: true)
            if !article.subtitle.isEmpty {
                Text(article.subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
            }
            if !article.tags.isEmpty {
                Text(article.tags.map { "#" + $0 }.joined(separator: "  "))
                    .font(.caption).foregroundStyle(Palette.teal).lineLimit(2)
            }
        }.padding(.vertical, 13)
    }
}
