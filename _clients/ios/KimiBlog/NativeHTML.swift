import Foundation
import SwiftUI

struct ReaderBlock: Identifiable {
    enum Kind { case paragraph, heading(Int), quote, code, image(URL, String), video(URL, String?), rule }
    var id: Int
    var kind: Kind
    var text: AttributedString
}

/// Small HTML-to-native-text parser. It never executes HTML or creates a web view.
enum NativeHTML {
    private static func matches(_ pattern: String, in value: String) -> [NSTextCheckingResult] {
        guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        return expression.matches(in: value, range: NSRange(value.startIndex..., in: value))
    }

    private static func string(_ range: NSRange, in value: String) -> String {
        guard let swiftRange = Range(range, in: value) else { return "" }
        return String(value[swiftRange])
    }

    static func decodeEntities(_ input: String) -> String {
        let named = ["amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ",
                     "mdash": "—", "ndash": "–", "hellip": "…", "ldquo": "“", "rdquo": "”",
                     "lsquo": "‘", "rsquo": "’", "copy": "©", "bull": "•", "middot": "·"]
        var result = input
        for match in matches("&(#x[0-9a-f]+|#[0-9]+|[a-z]+);", in: input).reversed() {
            let key = string(match.range(at: 1), in: input)
            var decoded = named[key]
            if key.lowercased().hasPrefix("#x"), let code = UInt32(key.dropFirst(2), radix: 16), let scalar = UnicodeScalar(code) {
                decoded = String(scalar)
            } else if key.hasPrefix("#"), let code = UInt32(key.dropFirst()), let scalar = UnicodeScalar(code) {
                decoded = String(scalar)
            }
            if let decoded, let range = Range(match.range, in: result) { result.replaceSubrange(range, with: decoded) }
        }
        return result
    }

    private static func attributes(_ tag: String) -> [String: String] {
        var result: [String: String] = [:]
        let pattern = #"([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#
        for match in matches(pattern, in: tag) {
            let name = string(match.range(at: 1), in: tag).lowercased()
            for index in 2...4 where match.range(at: index).location != NSNotFound {
                result[name] = decodeEntities(string(match.range(at: index), in: tag))
            }
        }
        return result
    }

    static func postContainer(in html: String) -> String? {
        let tags = matches("<[^>]+>", in: html)
        for (index, match) in tags.enumerated() {
            let tag = string(match.range, in: html)
            guard !tag.hasPrefix("</"), attributes(tag)["class"]?.split(whereSeparator: \.isWhitespace).contains("post-container") == true else { continue }
            let opening = tag.dropFirst().prefix { $0.isLetter || $0.isNumber }.lowercased()
            var depth = 1
            for next in tags.dropFirst(index + 1) {
                let token = string(next.range, in: html).lowercased()
                let closing = token.hasPrefix("</")
                let name = token.dropFirst(closing ? 2 : 1).prefix { $0.isLetter || $0.isNumber }
                guard name == opening else { continue }
                if closing { depth -= 1 } else if !token.hasSuffix("/>") { depth += 1 }
                if depth == 0 {
                    let start = match.range.location + match.range.length
                    let content = string(NSRange(location: start, length: next.range.location - start), in: html)
                    if let boundary = content.range(of: #"(?is)<ul\b[^>]*class=["'][^"']*\bpager\b|<section\b[^>]*data-comments-root"#, options: .regularExpression) {
                        return String(content[..<boundary.lowerBound])
                    }
                    return content
                }
            }
        }
        return nil
    }

    static func aboutContainer(in html: String) -> String? {
        let tags = matches("<[^>]+>", in: html)
        for (index, match) in tags.enumerated() {
            let tag = string(match.range, in: html)
            guard !tag.hasPrefix("</"),
                  attributes(tag)["class"]?.split(whereSeparator: \.isWhitespace).contains("en") != true,
                  attributes(tag)["class"]?.split(whereSeparator: \.isWhitespace).contains("post-container") == true else { continue }
            let opening = tag.dropFirst().prefix { $0.isLetter || $0.isNumber }.lowercased()
            var depth = 1
            for next in tags.dropFirst(index + 1) {
                let token = string(next.range, in: html).lowercased()
                let closing = token.hasPrefix("</")
                let name = token.dropFirst(closing ? 2 : 1).prefix { $0.isLetter || $0.isNumber }
                guard name == opening else { continue }
                if closing { depth -= 1 } else if !token.hasSuffix("/>") { depth += 1 }
                if depth == 0 {
                    let start = match.range.location + match.range.length
                    let content = string(NSRange(location: start, length: next.range.location - start), in: html)
                    if let boundary = content.range(of: #"(?is)<ul\b[^>]*class=["'][^"']*\bpager\b|<section\b[^>]*data-comments-root"#, options: .regularExpression) {
                        return String(content[..<boundary.lowerBound])
                    }
                    return content
                }
            }
        }
        return nil
    }

    static func blocks(_ html: String, baseURL: URL = Site.url) -> [ReaderBlock] {
        var result: [ReaderBlock] = []
        var buffer = AttributedString()
        var kind: ReaderBlock.Kind = .paragraph
        var bold = 0
        var italic = 0
        var inlineCode = 0
        var preformatted = false
        var quoteDepth = 0
        var suppressed = 0
        var link: URL?
        var listCounters: [Int?] = []
        var pendingVideo: (url: URL?, poster: String?)?
        var insideVideo = false

        func flush() {
            if !String(buffer.characters).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                result.append(ReaderBlock(id: result.count, kind: kind, text: buffer))
            }
            buffer = AttributedString()
        }

        func append(_ raw: String) {
            var text = decodeEntities(raw)
            if !preformatted {
                text = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
                if buffer.characters.isEmpty { text = String(text.drop(while: \.isWhitespace)) }
            }
            var fragment = AttributedString(text)
            var intent: InlinePresentationIntent = []
            if bold > 0 { intent.insert(.stronglyEmphasized) }
            if italic > 0 { intent.insert(.emphasized) }
            if inlineCode > 0 { intent.insert(.code) }
            if !intent.isEmpty { fragment.inlinePresentationIntent = intent }
            if let link { fragment.link = link }
            buffer.append(fragment)
        }

        for match in matches("(?s)<!--.*?-->|<![^>]*>|<[^>]+>|[^<]+", in: html) {
            let token = string(match.range, in: html)
            if !token.hasPrefix("<") {
                if suppressed == 0 && !insideVideo { append(token) }
                continue
            }
            if token.hasPrefix("<!") || token.hasPrefix("<?") { continue }
            let closing = token.hasPrefix("</")
            let name = token.dropFirst(closing ? 2 : 1).prefix { $0.isLetter || $0.isNumber }.lowercased()
            if name == "video" {
                if closing {
                    if let pendingVideo, let url = pendingVideo.url {
                        flush(); result.append(ReaderBlock(id: result.count, kind: .video(url, pendingVideo.poster), text: AttributedString()))
                    }
                    pendingVideo = nil; insideVideo = false
                } else {
                    let attrs = attributes(token)
                    let url = attrs["src"].flatMap { Site.safeURL($0, relativeTo: baseURL) }
                    let poster = attrs["poster"].flatMap { Site.safeURL($0, relativeTo: baseURL) }?.absoluteString
                    if token.hasSuffix("/>") {
                        if let url { flush(); result.append(ReaderBlock(id: result.count, kind: .video(url, poster), text: AttributedString())) }
                    } else {
                        pendingVideo = (url, poster)
                        insideVideo = true
                    }
                }
                continue
            }
            if name == "source" && !closing && insideVideo, var currentVideo = pendingVideo {
                if currentVideo.url == nil, let source = attributes(token)["src"], let url = Site.safeURL(source, relativeTo: baseURL) { currentVideo.url = url }
                pendingVideo = currentVideo
                continue
            }
            if ["script", "style", "iframe", "noscript"].contains(name) {
                suppressed = max(0, suppressed + (closing ? -1 : 1)); continue
            }
            if suppressed > 0 { continue }
            switch name {
            case "h1", "h2", "h3", "h4", "h5", "h6":
                flush(); kind = closing ? .paragraph : .heading(Int(name.dropFirst()) ?? 2)
            case "p", "div", "section", "article", "figure", "figcaption":
                let current = String(buffer.characters)
                let isListPrefix = current.range(of: #"^(?:• |[0-9]+\. )$"#, options: .regularExpression) != nil
                if closing || !isListPrefix { flush() }
                if !preformatted { kind = quoteDepth > 0 ? .quote : .paragraph }
            case "blockquote":
                flush(); quoteDepth = max(0, quoteDepth + (closing ? -1 : 1))
                kind = quoteDepth > 0 ? .quote : .paragraph
            case "pre":
                flush(); preformatted = !closing; kind = closing ? .paragraph : .code
            case "br": buffer.append(AttributedString("\n"))
            case "hr":
                flush(); result.append(ReaderBlock(id: result.count, kind: .rule, text: AttributedString()))
            case "strong", "b": bold = max(0, bold + (closing ? -1 : 1))
            case "em", "i": italic = max(0, italic + (closing ? -1 : 1))
            case "code": inlineCode = max(0, inlineCode + (closing ? -1 : 1))
            case "a": link = closing ? nil : Site.safeURL(attributes(token)["href"] ?? "", relativeTo: baseURL)
            case "img":
                if !closing {
                    flush()
                    let attrs = attributes(token)
                    if let source = attrs["src"], let url = Site.safeURL(source, relativeTo: baseURL) {
                        result.append(ReaderBlock(id: result.count, kind: .image(url, attrs["alt"] ?? "文章配图"), text: AttributedString()))
                    }
                }
            case "ul", "ol":
                flush()
                if closing { if !listCounters.isEmpty { listCounters.removeLast() } }
                else { listCounters.append(name == "ol" ? 0 : nil) }
            case "li":
                flush(); kind = .paragraph
                if !closing {
                    if !listCounters.isEmpty, let count = listCounters[listCounters.count - 1] {
                        listCounters[listCounters.count - 1] = count + 1; append("\(count + 1). ")
                    } else { append("• ") }
                }
            case "tr": flush()
            case "td", "th": if closing { append("  |  ") }
            default: break
            }
        }
        flush()
        return result
    }
}
