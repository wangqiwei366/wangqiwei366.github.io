import Foundation

enum PublicAPI {
    private static func fresh(_ url: URL) -> URL {
        url.appending(queryItems: [URLQueryItem(name: "t", value: String(Int(Date().timeIntervalSince1970)))])
    }

    static func data(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw AppError.message("网站暂时无法访问，请稍后重试。")
        }
        return data
    }

    static func index() async throws -> [Article] {
        let bytes = try await data(fresh(Site.url.appendingPathComponent("search.json")))
        return try JSONDecoder().decode([SearchEntry].self, from: bytes).compactMap(\.article)
    }

    static func feed() async throws -> [Article] {
        let bytes = try await data(fresh(Site.url.appendingPathComponent("feed.xml")))
        let delegate = RSSReader()
        let parser = XMLParser(data: bytes)
        parser.delegate = delegate
        parser.shouldResolveExternalEntities = false
        guard parser.parse() else { throw AppError.message("文章订阅数据无法解析。") }
        return delegate.articles
    }

    /// Loads the rendered Chinese About section from the public site. The
    /// management app writes the Markdown source in GitHub; this endpoint
    /// gives native clients the same rendered HTML that the website shows.
    static func about() async throws -> String {
        let bytes = try await data(fresh(Site.url.appendingPathComponent("about/")))
        guard let html = String(data: bytes, encoding: .utf8),
              let content = NativeHTML.aboutContainer(in: html), !content.isEmpty else {
            throw AppError.message("关于页面暂时无法读取。")
        }
        return content
    }

    static func content(for article: Article) async throws -> String {
        guard let url = Site.safeURL(article.url), url.host == Site.url.host else {
            throw AppError.message("文章地址无效。")
        }
        let bytes = try await data(fresh(url))
        guard let html = String(data: bytes, encoding: .utf8),
              let content = NativeHTML.postContainer(in: html), !content.isEmpty else {
            throw AppError.message("没有找到文章正文，已保留本地内容。")
        }
        return content
    }
}

private final class RSSReader: NSObject, XMLParserDelegate {
    var articles: [Article] = []
    private var item: [String: String] = [:]
    private var categories: [String] = []
    private var element = ""
    private var text = ""
    private var inItem = false

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String]) {
        if elementName == "item" { item = [:]; categories = []; inItem = true }
        if inItem { element = elementName; text = "" }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) { if inItem { text += string } }
    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        if inItem { text += String(data: CDATABlock, encoding: .utf8) ?? "" }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        guard inItem else { return }
        if elementName == "item" {
            if let link = Site.safeURL(item["link"] ?? ""), let title = item["title"] {
                let input = DateFormatter()
                input.locale = Locale(identifier: "en_US_POSIX")
                input.dateFormat = "EEE, dd MMM yyyy HH:mm:ss Z"
                let output = DateFormatter()
                output.locale = Locale(identifier: "en_US_POSIX")
                output.timeZone = TimeZone(secondsFromGMT: 0)
                output.dateFormat = "yyyy-MM-dd"
                let date = input.date(from: item["pubDate"] ?? "").map { output.string(from: $0) } ?? ""
                articles.append(Article(title: title, subtitle: "", url: link.absoluteString, date: date,
                                        tags: categories, contentHtml: item["description"] ?? ""))
            }
            inItem = false
        } else if elementName == "category" {
            categories.append(text.trimmingCharacters(in: .whitespacesAndNewlines))
        } else if elementName == element {
            item[elementName] = text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }
}
