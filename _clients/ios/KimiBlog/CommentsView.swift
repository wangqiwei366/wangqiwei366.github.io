import SwiftUI
import Security

struct CommentUser: Codable { let id: String; let nickname: String }
struct BlogComment: Codable, Identifiable, Equatable {
    let id: String
    var userId: String? = nil
    let nickname: String
    let body: String
    let createdAt: String
    static func ordered(_ comments: [BlogComment], userID: String?) -> [BlogComment] {
        comments.sorted { a, b in
            let aOwn = userID != nil && a.userId == userID
            let bOwn = userID != nil && b.userId == userID
            if aOwn != bOwn { return aOwn }
            return a.createdAt == b.createdAt ? a.id > b.id : a.createdAt > b.createdAt
        }
    }
}
struct CommentEnvelope: Codable {
    let ok: Bool?
    let error: String?
    let token: String?
    let user: CommentUser?
    let comments: [BlogComment]?
    let comment: BlogComment?
}
struct CommentFailure: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}
enum CommentsAPI {
    static let base = "https://wangqiwei366-site-admin.wangqiwei366.workers.dev"
    static func articleID(_ value: String) -> String {
        let path = Site.safeURL(value).flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: true)?.percentEncodedPath } ?? "/"
        return path.replacingOccurrences(of: "index.html", with: "").hasSuffix("/") ? path.replacingOccurrences(of: "index.html", with: "") : path + "/"
    }
    static func request(_ path: String, body: [String: String]? = nil, token: String? = nil, article: String? = nil, method: String? = nil) async throws -> CommentEnvelope {
        var parts = URLComponents(string: base + path)!
        if let article { parts.queryItems = [URLQueryItem(name: "article", value: article)] }
        var request = URLRequest(url: parts.url!, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 25)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpMethod = "POST"
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        if let method { request.httpMethod = method }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let result = try JSONDecoder().decode(CommentEnvelope.self, from: data)
        guard (200...299).contains(status), result.ok == true else {
            throw CommentFailure(status: status, message: result.error ?? "评论服务暂时不可用，请稍后重试。")
        }
        return result
    }
}

@MainActor
final class CommentAccount: ObservableObject {
    @Published private(set) var session: CommentEnvelope?
    private let key: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.kimi.blog.comments", kSecAttrAccount as String: "session-v2"]
    init() {
        var query = key; query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var found: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary, &found) == errSecSuccess, let data = found as? Data {
            session = try? JSONDecoder().decode(CommentEnvelope.self, from: data)
        }
    }
    func login(id: String, password: String) async throws {
        let result = try await CommentsAPI.request("/auth/login", body: ["id": id, "password": password])
        var item = key; item[kSecValueData as String] = try JSONEncoder().encode(result)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        SecItemDelete(key as CFDictionary)
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw AppError.message("无法安全保存登录状态，请重试。") }
        session = result
    }
    func clear() { session = nil; SecItemDelete(key as CFDictionary) }
    func logout() async {
        let token = session?.token; clear()
        if let token { _ = try? await CommentsAPI.request("/auth/logout", body: [:], token: token) }
    }
    func validate() async {
        guard let token = session?.token else { return }
        do { let result = try await CommentsAPI.request("/auth/me", token: token); if session?.token == token && result.user == nil { clear() } }
        catch let error as CommentFailure { if session?.token == token && error.status == 401 { clear() } }
        catch { } // A temporary network failure must not log the user out.
    }
}

private struct CommentPillStyle: ButtonStyle {
    var fillsWidth = false
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 15))
            .padding(.horizontal, 14)
            .frame(maxWidth: fillsWidth ? .infinity : nil, minHeight: 44)
            .foregroundStyle(Palette.ink).background(Palette.cool)
            .clipShape(Capsule())
            .opacity(!isEnabled ? 0.45 : configuration.isPressed ? 0.7 : 1)
    }
}

struct CommentsView: View {
    @EnvironmentObject private var account: CommentAccount
    @Environment(\.scenePhase) private var scenePhase
    let articleURL: String
    @State private var comments: [BlogComment] = []
    @State private var draft = ""
    @State private var status = ""
    @State private var loading = false
    @State private var refreshInFlight = false
    @State private var sending = false
    @State private var showingAuth = false
    @State private var register = false
    @State private var pendingDelete: BlogComment?
    @State private var deletePrompt = false
    @State private var deleting = false
    @State private var mutation = 0
    private func isOwn(_ comment: BlogComment) -> Bool {
        guard let id = account.session?.user?.id else { return false }
        return comment.userId == id
    }
    private func askDelete(_ comment: BlogComment) {
        if isOwn(comment) && !deleting { pendingDelete = comment; deletePrompt = true }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("评论").font(.title2.bold())
            Text("与网站和其他客户端同步 · 账号通用").font(.caption).foregroundStyle(.secondary)
            if let user = account.session?.user {
                HStack(spacing: 8) {
                    Text("\(user.nickname) · ID \(user.id)").font(.subheadline)
                    Spacer()
                    Button("退出") { Task { await account.logout() } }.buttonStyle(CommentPillStyle())
                }
            } else {
                HStack(spacing: 8) {
                    Button("登录") { register = false; showingAuth = true }
                    Button("注册账号") { register = true; showingAuth = true }
                }.buttonStyle(CommentPillStyle(fillsWidth: true))
            }
            Text("写下你的想法（最多 2000 字）").font(.subheadline)
            TextEditor(text: $draft).frame(minHeight: 100).padding(8)
                .scrollContentBackground(.hidden).background(Palette.cool)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel("评论内容")
                .onChange(of: draft) { value in if value.count > 2000 { draft = String(value.prefix(2000)) } }
            HStack(spacing: 8) {
                Button(sending ? "正在发布…" : "发布评论") { Task { await submit() } }.disabled(sending)
                Button(loading ? "正在同步…" : "刷新评论") { Task { await reload(silent: false) } }.disabled(loading)
            }.buttonStyle(CommentPillStyle(fillsWidth: true))
            Text(status).font(.caption).foregroundStyle(.secondary).accessibilityLabel(status)
            if comments.isEmpty { Text("还没有评论，欢迎留下第一条。").font(.subheadline).foregroundStyle(.secondary) }
            ForEach(BlogComment.ordered(comments, userID: account.session?.user?.id)) { comment in
                VStack(alignment: .leading, spacing: 8) {
                    Text(comment.nickname + (isOwn(comment) ? " · 我" : "")).font(.subheadline.bold())
                    Text(comment.createdAt.replacingOccurrences(of: "T", with: " ").replacingOccurrences(of: "Z", with: " UTC")).font(.caption).foregroundStyle(.secondary)
                    Text(comment.body).font(.body).fixedSize(horizontal: false, vertical: true)
                    if isOwn(comment) {
                        Button("删除") { askDelete(comment) }.font(.caption).buttonStyle(CommentPillStyle())
                    }
                    Divider()
                }
                .contentShape(Rectangle())
                .onLongPressGesture(minimumDuration: 0.6, maximumDistance: 12) { askDelete(comment) }
            }
        }
        .padding(20).background(Palette.paper)
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Palette.line.opacity(0.35), lineWidth: 1))
        .tint(Palette.ink)
        .alert("删除这条评论？", isPresented: $deletePrompt) {
            Button("取消", role: .cancel) { pendingDelete = nil }
            Button("删除评论", role: .destructive) {
                if let comment = pendingDelete { Task { await remove(comment) } }
            }
        } message: { Text("删除后会同步到网站和所有客户端，无法撤销。") }
        .sheet(isPresented: $showingAuth) { CommentLoginView(register: register).environmentObject(account) }
        .task(id: articleURL) {
            await account.validate()
            if scenePhase == .active { await reload() }
        }
        .onReceive(Timer.publish(every: 10, on: .main, in: .common).autoconnect()) { _ in
            if scenePhase == .active { Task { await reload(); await account.validate() } }
        }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await reload(); await account.validate() } } }
    }
    @MainActor private func reload(silent: Bool = true) async {
        guard !refreshInFlight && !sending && !deleting else { return }; refreshInFlight = true
        let revision = mutation
        if !silent { loading = true }
        defer { refreshInFlight = false; if !silent { loading = false } }
        do {
            let result = try await CommentsAPI.request("/comments", article: CommentsAPI.articleID(articleURL))
            guard !Task.isCancelled && revision == mutation else { return }
            let next = result.comments ?? []; if comments != next { comments = next }
            if !silent { status = "\(comments.count) 条评论" }
        } catch { if !silent && !Task.isCancelled { status = "同步失败，保留已有评论：" + error.localizedDescription } }
    }
    @MainActor private func submit() async {
        guard !sending else { return }
        guard let token = account.session?.token else { register = false; showingAuth = true; return }
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { status = "请先填写评论内容"; return }
        sending = true; mutation += 1; defer { sending = false; mutation += 1 }
        do {
            _ = try await CommentsAPI.request("/comments", body: ["articleId": CommentsAPI.articleID(articleURL), "body": body], token: token)
            draft = ""; status = "评论已发布"; sending = false; await reload()
        } catch {
            if let failure = error as? CommentFailure, failure.status == 401 { account.clear() }
            status = error.localizedDescription
        }
    }
    @MainActor private func remove(_ comment: BlogComment) async {
        guard !deleting, isOwn(comment), let token = account.session?.token else { return }
        deleting = true; mutation += 1
        defer { deleting = false; pendingDelete = nil; mutation += 1 }
        do {
            _ = try await CommentsAPI.request("/comments", body: ["id": comment.id], token: token, method: "DELETE")
            comments.removeAll { $0.id == comment.id }; status = "评论已删除"
        } catch {
            if let failure = error as? CommentFailure, failure.status == 401, account.session?.token == token { account.clear() }
            status = error.localizedDescription
        }
    }
}

private struct CommentLoginView: View {
    @EnvironmentObject private var account: CommentAccount
    @Environment(\.dismiss) private var dismiss
    @State var register: Bool
    @State private var name = ""
    @State private var password = ""
    @State private var status = ""
    @State private var busy = false
    var body: some View {
        NavigationStack {
            Form {
                TextField(register ? "昵称" : "6 位数字 ID", text: $name)
                    .keyboardType(register ? .default : .numberPad).textInputAutocapitalization(.never)
                    .autocorrectionDisabled().onChange(of: name) { value in name = String(value.prefix(register ? 40 : 6)) }
                SecureField("密码（8–128 位）", text: $password).textContentType(register ? .newPassword : .password)
                if !status.isEmpty { Text(status).textSelection(.enabled) }
                Button(busy ? "请稍候…" : register ? "注册" : "登录") { Task { await authenticate() } }.disabled(busy).buttonStyle(CommentPillStyle(fillsWidth: true))
            }
            .navigationTitle(register ? "注册评论账号" : "登录")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } } }
        }
    }
    @MainActor private func authenticate() async {
        let value = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (8...128).contains(password.count), register ? !value.isEmpty : value.range(of: "^[1-9][0-9]{5}$", options: .regularExpression) != nil else { status = "请填写有效账号和 8–128 位密码"; return }
        busy = true; defer { busy = false }
        do {
            if register {
                let result = try await CommentsAPI.request("/auth/register", body: ["nickname": value, "password": password])
                guard let id = result.user?.id else { throw AppError.message("服务器未返回账号 ID") }
                register = false; name = id; password = ""; status = "注册成功！账号 ID：\(id)。请保存并使用它登录。"
            } else { try await account.login(id: value, password: password); password = ""; dismiss() }
        } catch { status = error.localizedDescription }
    }
}
