import SwiftUI
import UIKit

enum Palette {
    private static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
        })
    }
    static let ink = adaptive(0x163047, 0xEBF1F5)
    static let body = adaptive(0x284459, 0xD6E0E8)
    static let muted = adaptive(0x647889, 0xAABBC7)
    static let line = adaptive(0xE1E6E9, 0x394853)
    static let cool = adaptive(0xF4F7F8, 0x24313C)
    static let red = adaptive(0x267A96, 0x91C9DE)
    static let teal = adaptive(0x1F657D, 0x91C9DE)
    static let paper = adaptive(0xFFFFFF, 0x17212B)
    static let charcoal = Color(red: 23 / 255, green: 33 / 255, blue: 43 / 255)
    static func serif(_ size: CGFloat) -> Font { .custom("KimiReadingSerif-Regular", size: size) }
}

struct WebsiteCard: ViewModifier {
    var radius: CGFloat = 22
    func body(content: Content) -> some View {
        content.background(Palette.paper)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(Palette.line, lineWidth: 1))
            .shadow(color: Color(red: 20 / 255, green: 32 / 255, blue: 44 / 255).opacity(0.08), radius: 15, x: 0, y: 10)
    }
}

struct WebsiteHeader: View {
    let image: String
    let title: String
    let subtitle: String
    var metadata = ""
    @Environment(\.horizontalSizeClass) private var sizeClass
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottom) {
                Image(image).resizable().scaledToFill()
                    .frame(width: geometry.size.width, height: 500).clipped()
                Color.black.opacity(0.38)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).font(Palette.serif(sizeClass == .regular ? 58 : 38))
                        .foregroundStyle(Palette.body).lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                    if !subtitle.isEmpty {
                        Text(subtitle).font(Palette.serif(18)).foregroundStyle(Palette.body)
                            .lineSpacing(6).padding(.top, 22).fixedSize(horizontal: false, vertical: true)
                    }
                    if !metadata.isEmpty {
                        Text(metadata).font(Palette.serif(13)).foregroundStyle(Palette.muted).padding(.top, 28)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: metadata.isEmpty ? 145 : nil, alignment: .leading)
                .padding(sizeClass == .regular ? 46 : 30)
                .modifier(WebsiteCard(radius: sizeClass == .regular ? 26 : 22))
                .frame(maxWidth: 840).padding(.horizontal, geometry.size.width * 0.05).padding(.bottom, 55)
            }
        }.frame(height: 500)
    }
}

@main
struct KimiBlogApp: App {
    @StateObject private var store = BlogStore()
    @StateObject private var commentAccount = CommentAccount()
    @AppStorage("appearance") private var appearance = "system"
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store).environmentObject(commentAccount)
                .tint(Palette.ink)
                .preferredColorScheme(appearance == "light" ? .light : appearance == "dark" ? .dark : nil)
        }
    }
}

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var store: BlogStore
    @State private var selected = 0
    @State private var path: [String] = []
    @State private var archiveTag = ""
    @State private var searchOpen = false
    var body: some View {
        NavigationStack(path: $path) {
            Group {
                switch selected {
                case 1: LibraryView(favoritesOnly: false, initialTag: archiveTag, searchInitially: searchOpen).id("\(archiveTag)-\(searchOpen)")
                case 2: LibraryView(favoritesOnly: true)
                case 3: AboutView()
                default: HomeView(onArchive: { tag in archiveTag = tag; searchOpen = false; selected = 1 }, onAbout: { selected = 3 })
                }
            }
            .navigationDestination(for: String.self) { ArticleReader(articleID: $0) }
            .toolbar(.hidden, for: .navigationBar)
        }
        .ignoresSafeArea(.container, edges: .top)
        .safeAreaInset(edge: .bottom, spacing: 0) { dock }
        .background(Palette.paper)
        .onAppear {
            #if DEBUG
            let arguments = ProcessInfo.processInfo.arguments
            if arguments.contains("--qa-archive") { selected = 1 }
            if arguments.contains("--qa-about") { selected = 3 }
            if arguments.contains("--qa-article"), let article = store.articles.first { path = [article.id] }
            #endif
        }
        .task {
            while !Task.isCancelled {
                if scenePhase == .active { await store.refresh() }
                do { try await Task.sleep(nanoseconds: 300_000_000_000) } catch { break }
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active, Date().timeIntervalSince(store.lastRefresh ?? .distantPast) > 60 { Task { await store.refresh() } }
        }
        .alert("提示", isPresented: Binding(get: { store.message != nil }, set: { if !$0 { store.message = nil } })) {
            Button("知道了", role: .cancel) { store.message = nil }
        } message: { Text(store.message ?? "") }
    }
    private var dock: some View {
        HStack(spacing: 0) {
            ForEach(Array(["首页", "归档", "收藏", "关于"].enumerated()), id: \.offset) { item in
                Button {
                    path.removeAll(); archiveTag = ""; searchOpen = false; selected = item.offset
                } label: {
                    Text(item.element).font(.system(size: 12, weight: .semibold))
                        .frame(maxWidth: .infinity).frame(height: 48)
                        .background(selected == item.offset ? Palette.cool : Color.clear)
                        .clipShape(Capsule())
                }.accessibilityLabel("底部导航：\(item.element)")
            }
            Button {
                path.removeAll(); archiveTag = ""; searchOpen = true; selected = 1
            } label: { Image(systemName: "magnifyingglass").font(.system(size: 17)).frame(width: 44, height: 48) }
                .accessibilityLabel("搜索文章")
        }
        .foregroundStyle(Palette.ink).buttonStyle(.plain).padding(.horizontal, 8).frame(height: 66)
        .modifier(WebsiteCard(radius: 40)).padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 9)
        .background(Palette.paper)
    }
}
