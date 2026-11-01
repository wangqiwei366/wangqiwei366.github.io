import Foundation

enum Site {
    static let title = "KIMI Blog"
    static let url = URL(string: "https://wangqiwei366.github.io")!

    static func safeURL(_ value: String, relativeTo base: URL = url) -> URL? {
        guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let result = URL(string: value, relativeTo: base)?.absoluteURL,
              ["https", "http"].contains(result.scheme?.lowercased() ?? ""),
              result.host != nil else { return nil }
        if result.host == "kimi-wang.space", var parts = URLComponents(url: result, resolvingAgainstBaseURL: true) {
            parts.scheme = "https"; parts.host = url.host; return parts.url
        }
        return result
    }

    static func key(_ value: String) -> String {
        if let resolved = safeURL(value), resolved.host == url.host {
            return resolved.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        return (value.removingPercentEncoding ?? value).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
}

struct Article: Codable, Identifiable, Hashable {
    var title: String
    var subtitle: String
    var url: String
    var date: String
    var tags: [String]
    var contentHtml: String
    var videoUrl: String? = nil
    var videoPoster: String? = nil
    var videoDuration: String? = nil
    var id: String { Site.key(url) }
    var year: String { String(date.prefix(4)) }
}

struct Snapshot: Codable {
    var siteTitle: String
    var siteUrl: String
    var aboutHtml: String
    var articles: [Article]
}

struct SearchEntry: Decodable {
    var title: String
    var subtitle: String?
    var date: String
    var tags: String?
    var url: String
    var videoUrl: String?
    var videoPoster: String?
    var videoDuration: String?

    private struct NestedVideo: Decodable {
        var url: String?
        var poster: String?
        var duration: String?
    }

    private enum CodingKeys: String, CodingKey {
        case title, subtitle, date, tags, url
        case videoUrl, videoPoster, videoDuration
        case videoURLAlias = "video_url"
        case videoPosterAlias = "video_poster"
        case videoDurationAlias = "video_duration"
        case poster, duration, video
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try container.decode(String.self, forKey: .title)
        subtitle = try container.decodeIfPresent(String.self, forKey: .subtitle)
        date = try container.decode(String.self, forKey: .date)
        tags = try container.decodeIfPresent(String.self, forKey: .tags)
        url = try container.decode(String.self, forKey: .url)
        let nested = try container.decodeIfPresent(NestedVideo.self, forKey: .video)
        let primaryURL = try container.decodeIfPresent(String.self, forKey: .videoUrl)
        let aliasURL = try container.decodeIfPresent(String.self, forKey: .videoURLAlias)
        videoUrl = primaryURL ?? aliasURL ?? nested?.url
        let primaryPoster = try container.decodeIfPresent(String.self, forKey: .videoPoster)
        let aliasPoster = try container.decodeIfPresent(String.self, forKey: .videoPosterAlias)
        let poster = try container.decodeIfPresent(String.self, forKey: .poster)
        videoPoster = primaryPoster ?? aliasPoster ?? poster ?? nested?.poster
        let primaryDuration = try container.decodeIfPresent(String.self, forKey: .videoDuration)
        let aliasDuration = try container.decodeIfPresent(String.self, forKey: .videoDurationAlias)
        let duration = try container.decodeIfPresent(String.self, forKey: .duration)
        videoDuration = primaryDuration ?? aliasDuration ?? duration ?? nested?.duration
    }

    var article: Article? {
        guard let resolved = Site.safeURL(url) else { return nil }
        return Article(title: title, subtitle: subtitle ?? "", url: resolved.absoluteString,
                       date: String(date.prefix(10)),
                       tags: (tags ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty },
                       contentHtml: "", videoUrl: videoUrl, videoPoster: videoPoster, videoDuration: videoDuration)
    }
}

enum AppError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let message): return message }
    }
}
