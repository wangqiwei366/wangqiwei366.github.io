import Foundation
import Combine
import CryptoKit
import UIKit

enum LocalFiles {
    static var directory: URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("KimiBlog", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }
    static func read<T: Decodable>(_ name: String, as type: T.Type) -> T? {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent(name)) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
    static func write<T: Encodable>(_ value: T, name: String) throws {
        try JSONEncoder().encode(value).write(to: directory.appendingPathComponent(name), options: [.atomic, .completeFileProtection])
    }
    static func remove(_ name: String) { try? FileManager.default.removeItem(at: directory.appendingPathComponent(name)) }
}

actor ImageCache {
    static let shared = ImageCache()
    private func location(_ url: URL) -> URL {
        let digest = SHA256.hash(data: Data(url.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
        let directory = LocalFiles.directory.appendingPathComponent("images", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent(digest)
    }
    func data(for url: URL) async throws -> Data {
        let file = location(url)
        if let bytes = try? Data(contentsOf: file), UIImage(data: bytes) != nil { return bytes }
        let bytes = try await PublicAPI.data(url)
        guard UIImage(data: bytes) != nil else { throw AppError.message("图片格式不受支持。") }
        try bytes.write(to: file, options: .atomic)
        return bytes
    }
}

@MainActor
final class BlogStore: ObservableObject {
    @Published private(set) var articles: [Article] = []
    @Published private(set) var favorites = Set<String>()
    @Published private(set) var aboutHtml = ""
    @Published private(set) var isRefreshing = false
    @Published private(set) var fetching = Set<String>()
    @Published var message: String?
    @Published private(set) var lastRefresh: Date?

    init() {
        let cached = LocalFiles.read("articles.json", as: Snapshot.self)
        let seed = Bundle.main.url(forResource: "snapshot", withExtension: "json")
            .flatMap { try? Data(contentsOf: $0) }
            .flatMap { try? JSONDecoder().decode(Snapshot.self, from: $0) }
        if let seed {
            // The bundled seed provides newly shipped articles, while a cache
            // created by a successful refresh keeps the latest website metadata.
            var merged = Dictionary(seed.articles.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            for incoming in cached?.articles ?? [] {
                var next = incoming
                if let fallback = merged[incoming.id] {
                    if next.contentHtml.isEmpty { next.contentHtml = fallback.contentHtml }
                    if next.videoUrl?.isEmpty != false { next.videoUrl = fallback.videoUrl }
                    if next.videoPoster?.isEmpty != false { next.videoPoster = fallback.videoPoster }
                    if next.videoDuration?.isEmpty != false { next.videoDuration = fallback.videoDuration }
                }
                merged[incoming.id] = next
            }
            articles = merged.values.sorted { $0.date > $1.date }
            if let cached, !cached.aboutHtml.isEmpty { aboutHtml = cached.aboutHtml } else { aboutHtml = seed.aboutHtml }
            try? LocalFiles.write(Snapshot(siteTitle: Site.title, siteUrl: Site.url.absoluteString,
                                           aboutHtml: aboutHtml, articles: articles), name: "articles.json")
        } else if let cached {
            articles = cached.articles.sorted { $0.date > $1.date }
            aboutHtml = cached.aboutHtml
        }
        favorites = Set((LocalFiles.read("favorites.json", as: [String].self) ?? []).map { Site.key($0) })
        articles = articles.map { article in var next = article; next.url = Site.safeURL(article.url)?.absoluteString ?? article.url; return next }
        lastRefresh = UserDefaults.standard.object(forKey: "lastRefresh") as? Date
    }

    var tags: [String] { Array(Set(articles.flatMap(\.tags))).sorted() }
    var years: [String] { Array(Set(articles.map(\.year))).sorted(by: >) }
    func article(_ id: String) -> Article? { articles.first { $0.id == id } }
    func isFavorite(_ article: Article) -> Bool { favorites.contains(article.id) }

    private func persist() throws {
        try LocalFiles.write(Snapshot(siteTitle: Site.title, siteUrl: Site.url.absoluteString,
                                      aboutHtml: aboutHtml, articles: articles), name: "articles.json")
    }

    /// Merges the lightweight search index with RSS metadata while retaining
    /// cached bodies. RSS mirrors can use a different canonical host, so only
    /// merge feed entries that already match an indexed article identity.
    static func mergedArticles(existing: [Article], index: [Article], feed: [Article]) -> [Article] {
        var merged = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let indexedIDs = Set(index.map(\.id))
        for entry in index {
            var next = entry
            if let old = merged[entry.id] {
                if next.contentHtml.isEmpty && !old.contentHtml.isEmpty { next.contentHtml = old.contentHtml }
                if next.videoUrl == nil || next.videoUrl?.isEmpty == true { next.videoUrl = old.videoUrl }
                if next.videoPoster == nil || next.videoPoster?.isEmpty == true { next.videoPoster = old.videoPoster }
                if next.videoDuration == nil || next.videoDuration?.isEmpty == true { next.videoDuration = old.videoDuration }
            }
            if !next.contentHtml.isEmpty { Self.fillVideoMetadata(&next) }
            merged[entry.id] = next
        }
        for entry in feed {
            // Feed URLs are occasionally served from a custom domain. They
            // are useful for metadata only when the index has the same id;
            // never create a second article row for a mirror URL.
            guard indexedIDs.contains(entry.id) else { continue }
            guard var previous = merged[entry.id] else { continue }
            if !entry.contentHtml.isEmpty && index.first(where: { $0.id == entry.id })?.contentHtml.isEmpty != false { previous.contentHtml = entry.contentHtml }
            if previous.tags.isEmpty { previous.tags = entry.tags }
            Self.fillVideoMetadata(&previous)
            merged[entry.id] = previous
        }
        return Array(merged.values).sorted { $0.date > $1.date }
    }

    private static func fillVideoMetadata(_ article: inout Article) {
        guard !article.contentHtml.isEmpty,
              let match = article.contentHtml.range(of: #"(?is)<video\b([^>]*)>(.*?)</video\s*>"#, options: .regularExpression)
                ?? article.contentHtml.range(of: #"(?is)<video\b([^>]*)/>"#, options: .regularExpression) else { return }
        let fragment = String(article.contentHtml[match])
        func attribute(_ name: String) -> String? {
            guard let value = fragment.range(of: "\\b\(name)\\s*=\\s*[\\\"']([^\\\"']+)[\\\"']", options: .regularExpression) else { return nil }
            let raw = String(fragment[value])
            return raw.split(separator: "=", maxSplits: 1).last?.trimmingCharacters(in: CharacterSet(charactersIn: " \\\"'"))
        }
        if article.videoUrl?.isEmpty != false, let source = attribute("src") { article.videoUrl = source }
        if article.videoPoster?.isEmpty != false, let poster = attribute("poster") { article.videoPoster = poster }
        if article.videoDuration?.isEmpty != false, let duration = attribute("data-duration") ?? attribute("duration") { article.videoDuration = duration }
    }

    private var refreshInFlight = false
    func refresh(silent: Bool = false) async {
        guard !refreshInFlight else { return }
        refreshInFlight = true
        if !silent { isRefreshing = true }
        defer { refreshInFlight = false; if !silent { isRefreshing = false } }
        do {
            async let indexRequest = PublicAPI.index()
            async let feedRequest = PublicAPI.feed()
            async let aboutRequest = PublicAPI.about()
            let index = try await indexRequest
            let feed: [Article]
            do {
                feed = try await feedRequest
            } catch {
                // The index is authoritative for titles and metadata. Keep it when
                // RSS is temporarily unavailable so refresh still shows new entries.
                feed = []
                if !silent { message = "目录已更新，但订阅正文暂时不可用；稍后可再次刷新。" }
            }
            guard !index.isEmpty else { throw AppError.message("网站目录为空，已保留离线文章。") }
            let next = Self.mergedArticles(existing: articles, index: index, feed: feed)
            // About is edited through the same management backend as posts;
            // update it in this refresh as well, while retaining the cached
            // copy if the About request is temporarily unavailable.
            let nextAbout = (try? await aboutRequest) ?? aboutHtml
            try LocalFiles.write(Snapshot(siteTitle: Site.title, siteUrl: Site.url.absoluteString,
                                          aboutHtml: nextAbout, articles: next), name: "articles.json")
            if articles != next { articles = next }
            if aboutHtml != nextAbout { aboutHtml = nextAbout }
            lastRefresh = Date()
            UserDefaults.standard.set(lastRefresh, forKey: "lastRefresh")
        } catch { if !silent { message = "更新未完成，本地文章仍可阅读。\n\(error.localizedDescription)" } }
    }

    @discardableResult
    func loadContent(_ id: String) async -> Bool {
        guard let current = article(id) else { return false }
        if !current.contentHtml.isEmpty { return true }
        guard !fetching.contains(id) else { return false }
        fetching.insert(id)
        defer { fetching.remove(id) }
        do {
            let html = try await PublicAPI.content(for: current)
            if let index = articles.firstIndex(where: { $0.id == id }) {
                articles[index].contentHtml = html
                Self.fillVideoMetadata(&articles[index])
            }
            try persist()
            return true
        } catch { message = "暂时无法下载正文。\n\(error.localizedDescription)"; return false }
    }

    func toggleFavorite(_ id: String) async {
        if favorites.contains(id) {
            favorites.remove(id)
        } else {
            guard await loadContent(id) else { return }
            favorites.insert(id)
        }
        do {
            try LocalFiles.write(Array(favorites), name: "favorites.json")
            try persist()
            if favorites.contains(id), let current = article(id) {
                let base = Site.safeURL(current.url) ?? Site.url
                var failedImages = 0
                for block in NativeHTML.blocks(current.contentHtml, baseURL: base) {
                    if case .image(let url, _) = block.kind {
                        do { _ = try await ImageCache.shared.data(for: url) } catch { failedImages += 1 }
                    }
                }
                if failedImages > 0 { message = "正文已离线保存，\(failedImages) 张图片暂时未能下载。" }
            }
        } catch { message = "保存到本机失败：\(error.localizedDescription)" }
    }
}
