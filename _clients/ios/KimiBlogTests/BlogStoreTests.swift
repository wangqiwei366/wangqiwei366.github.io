import XCTest
@testable import KimiBlog

@MainActor
final class BlogStoreTests: XCTestCase {
    private func article(_ title: String, url: String, date: String, body: String = "") -> Article {
        Article(title: title, subtitle: "", url: url, date: date, tags: [], contentHtml: body)
    }

    func testMergedArticlesRetainsCachedBodyAndSorts() {
        let cached = article("旧标题", url: "https://wangqiwei366.github.io/a/", date: "2025-01-01", body: "<p>离线正文</p>")
        let incoming = article("新标题", url: "https://wangqiwei366.github.io/a/", date: "2026-02-01")
        let newer = article("更新文章", url: "https://wangqiwei366.github.io/b/", date: "2026-03-01")
        let merged = BlogStore.mergedArticles(existing: [cached], index: [incoming, newer], feed: [])
        XCTAssertEqual(merged.map(\.title), ["更新文章", "新标题"])
        XCTAssertEqual(merged.last?.contentHtml, "<p>离线正文</p>")
    }

    func testFeedMirrorDoesNotCreateDuplicateRows() {
        let indexed = article("文章", url: "https://wangqiwei366.github.io/a/", date: "2026-02-01")
        let mirror = article("文章", url: "https://kimi-wang.space/a/", date: "2026-02-01", body: "<p>RSS</p>")
        let merged = BlogStore.mergedArticles(existing: [], index: [indexed], feed: [mirror])
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged[0].contentHtml, "<p>RSS</p>")
    }

    func testFeedBodyFillsMissingIndexedBodyWhenIdentityMatches() {
        let indexed = article("文章", url: "https://wangqiwei366.github.io/a/", date: "2026-02-01")
        let feed = article("文章", url: "https://wangqiwei366.github.io/a/", date: "2026-02-01", body: "<p>正文</p>")
        let merged = BlogStore.mergedArticles(existing: [], index: [indexed], feed: [feed])
        XCTAssertEqual(merged[0].contentHtml, "<p>正文</p>")
    }

    func testMergedArticlesRetainsVideoMetadata() {
        let cached = Article(title: "旧", subtitle: "", url: "https://wangqiwei366.github.io/a/", date: "2025-01-01", tags: [], contentHtml: "", videoUrl: "https://cdn.example.com/clip.mp4", videoPoster: "https://cdn.example.com/poster.jpg", videoDuration: "03:45")
        let incoming = Article(title: "新", subtitle: "", url: "https://wangqiwei366.github.io/a/", date: "2026-02-01", tags: [], contentHtml: "")
        let merged = BlogStore.mergedArticles(existing: [cached], index: [incoming], feed: [])
        XCTAssertEqual(merged[0].videoUrl, cached.videoUrl)
        XCTAssertEqual(merged[0].videoPoster, cached.videoPoster)
        XCTAssertEqual(merged[0].videoDuration, cached.videoDuration)
    }

    func testCommentsUseEncodedWebPathAndMigrateBookmarks() {
        XCTAssertEqual(CommentsAPI.articleID("https://kimi-wang.space/2026/中文/"), "/2026/%E4%B8%AD%E6%96%87/")
        XCTAssertEqual(Site.key("https://kimi-wang.space/2026/中文/"), Site.key("https://wangqiwei366.github.io/2026/%E4%B8%AD%E6%96%87/"))
        XCTAssertEqual(NativeHTML.postContainer(in: "<div class=\"post-container glass-card\"><p>Body</p><section data-comments-root>Web form</section></div>"), "<p>Body</p>")
    }
}

