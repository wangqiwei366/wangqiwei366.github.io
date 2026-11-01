import XCTest
import UIKit
@testable import KimiBlog

final class NativeReaderTests: XCTestCase {
    func testWebsiteSerifFontResolvesWithoutSansFallback() {
        XCTAssertNotNil(UIFont(name: "STSongti-SC-Regular", size: 17), "Website reader font must resolve to a real Songti face")
    }
    func testLongArticleIsNotTruncated() {
        let paragraph = String(repeating: "这是完整的正文。", count: 2000)
        let blocks = NativeHTML.blocks("<h2>标题</h2><p>\(paragraph)</p><p>最后一段。</p>")
        let text = blocks.map { String($0.text.characters) }.joined(separator: "\n")
        XCTAssertTrue(text.contains(paragraph))
        XCTAssertTrue(text.hasSuffix("最后一段。"))
        XCTAssertEqual(blocks.count, 3)
    }

    func testUnsafeLinksAreRejectedAndRelativeLinksResolve() {
        XCTAssertNil(Site.safeURL("javascript:alert(1)"))
        XCTAssertNil(Site.safeURL("file:///etc/passwd"))
        XCTAssertNil(Site.safeURL("data:text/html,hello"))
        XCTAssertNil(Site.safeURL(""))
        XCTAssertEqual(Site.safeURL("/about/")?.absoluteString, "https://wangqiwei366.github.io/about/")
        let blocks = NativeHTML.blocks("<p><a href='javascript:alert(1)'>不安全</a> <a href='/about/'>关于</a></p>")
        let links = blocks.flatMap { $0.text.runs.compactMap(\.link) }
        XCTAssertEqual(links, [URL(string: "https://wangqiwei366.github.io/about/")!])
    }

    func testNativeTextPreservesSpacesEntitiesBreaksAndCode() {
        let html = "<p>Hello <b>world</b> &amp; &#x4E2D;&#25991;<br>第二行</p><pre><code>let x = 1\n  x += 2</code></pre>"
        let blocks = NativeHTML.blocks(html)
        XCTAssertEqual(String(blocks[0].text.characters), "Hello world & 中文\n第二行")
        XCTAssertEqual(String(blocks[1].text.characters), "let x = 1\n  x += 2")
    }

    func testListsQuotesAndImagesRemainNative() {
        let html = "<ol><li><p>第一项</p></li><li>第二项</li></ol><blockquote><p>引文</p></blockquote><img src='/img/sample.png' alt='示例'>"
        let blocks = NativeHTML.blocks(html)
        XCTAssertEqual(String(blocks[0].text.characters), "1. 第一项")
        XCTAssertEqual(String(blocks[1].text.characters), "2. 第二项")
        if case .quote = blocks[2].kind {} else { XCTFail("引文应使用原生引用块") }
        if case .image(let url, let alt) = blocks[3].kind {
            XCTAssertEqual(url.absoluteString, "https://wangqiwei366.github.io/img/sample.png")
            XCTAssertEqual(alt, "示例")
        } else { XCTFail("图片应使用原生图片块") }
    }

    func testNestedPostContainerExcludesSidebar() {
        let page = "<html><div class='sidebar'>侧栏</div><div class='col post-container'><h2>正文</h2><div><p>完整内容</p></div><p>结尾</p></div><footer>页脚</footer></html>"
        XCTAssertEqual(NativeHTML.postContainer(in: page), "<h2>正文</h2><div><p>完整内容</p></div><p>结尾</p>")
        XCTAssertNil(NativeHTML.postContainer(in: "<p>没有正文容器</p>"))
    }

    func testAboutContainerSelectsChineseSection() {
        let page = "<div class='en post-container'>English</div><div class='zh post-container'><p>中文</p><div><p>完整介绍</p></div></div><footer>页脚</footer>"
        XCTAssertEqual(NativeHTML.aboutContainer(in: page), "<p>中文</p><div><p>完整介绍</p></div>")
        XCTAssertNil(NativeHTML.aboutContainer(in: "<div class='en post-container'>English</div>"))
    }

    func testScriptsAndStylesDoNotBecomeArticleText() {
        let blocks = NativeHTML.blocks("<script>alert('秘密')</script><style>body{display:none}</style><p>可阅读内容</p>")
        XCTAssertEqual(blocks.count, 1)
        XCTAssertEqual(String(blocks[0].text.characters), "可阅读内容")
    }

    func testVideoSourceAndPosterRemainNative() {
        let blocks = NativeHTML.blocks("<p>视频</p><video controls poster='/poster.jpg'><source src='/clip.mp4' type='video/mp4'></video>")
        XCTAssertEqual(String(blocks[0].text.characters), "视频")
        if case .video(let url, let poster) = blocks[1].kind {
            XCTAssertEqual(url.absoluteString, "https://wangqiwei366.github.io/clip.mp4")
            XCTAssertEqual(poster, "https://wangqiwei366.github.io/poster.jpg")
        } else { XCTFail("视频应使用原生视频块") }
    }

    func testEquivalentEncodedURLsUseSameIdentity() {
        XCTAssertEqual(Site.key("https://example.com/中文/"), Site.key("https://example.com/%E4%B8%AD%E6%96%87/"))
    }

    func testBundledSeedContainsFullOfflineArticles() throws {
        let bundle = Bundle(for: BlogStore.self)
        let url = try XCTUnwrap(bundle.url(forResource: "snapshot", withExtension: "json"))
        let snapshot = try JSONDecoder().decode(Snapshot.self, from: Data(contentsOf: url))
        // The checked-in public snapshot currently contains eight complete articles.
        // Keep the lower bound meaningful while allowing the seed to grow over time.
        XCTAssertGreaterThanOrEqual(snapshot.articles.count, 8)
        XCTAssertTrue(snapshot.articles.allSatisfy { !$0.title.isEmpty && !$0.contentHtml.isEmpty })
        XCTAssertEqual(Set(snapshot.articles.map(\.id)).count, snapshot.articles.count)
    }
}
