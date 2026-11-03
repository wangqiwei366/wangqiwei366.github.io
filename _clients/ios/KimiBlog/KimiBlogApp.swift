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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var dockSelection
    @State private var selected = 0
    @State private var path: [String] = []
    @State private var expandedArticleID: String?
    @State private var articleSourceFrame = CGRect.zero
    @State private var articleSourceFeatured = false
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
            .id(selected)
            .transition(reduceMotion ? .opacity : .asymmetric(insertion: .offset(x: 28).combined(with: .opacity), removal: .offset(x: -18).combined(with: .opacity)))
            .animation(reduceMotion ? nil : .spring(response: 0.58, dampingFraction: 0.9), value: selected)
            .navigationDestination(for: String.self) { ArticleReader(articleID: $0) }
            .toolbar(.hidden, for: .navigationBar)
        }
        .overlay {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--qa-comments"), let article = store.articles.first {
                ScrollView { CommentsView(articleURL: article.url).padding(20).padding(.top, 70) }
                    .background(Palette.paper)
            }
            #endif
        }
        .accessibilityHidden(expandedArticleID != nil)
        .environment(\.activeArticleCard, expandedArticleID)
        .environment(\.openArticleCard, { id, frame, featured in
            guard expandedArticleID == nil else { return }
            articleSourceFrame = frame; articleSourceFeatured = featured; expandedArticleID = id
        })
        .ignoresSafeArea(.container, edges: .top)
        .overlay {
            GeometryReader { viewport in
                if let id = expandedArticleID, let article = store.article(id) {
                    ArticleCardExpansion(article: article, source: articleSourceFrame,
                        featured: articleSourceFeatured, viewport: viewport.size) {
                            if expandedArticleID == id { expandedArticleID = nil }
                        }.id(id)
                }
            }
        }
        .coordinateSpace(name: "article-stage")
        .overlay(alignment: .bottom) { dock }
        .background(Palette.paper)
        .onAppear {
            #if DEBUG
            let arguments = ProcessInfo.processInfo.arguments
            if arguments.contains("--qa-archive") { selected = 1 }
            if arguments.contains("--qa-about") { selected = 3 }
            if arguments.contains("--qa-article"), let article = store.articles.first { path = [article.id] }
            #endif
        }
        .task { if scenePhase == .active { await store.refresh(silent: true) } }
        .onReceive(Timer.publish(every: 10, on: .main, in: .common).autoconnect()) { _ in
            if scenePhase == .active { Task { await store.refresh(silent: true) } }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active { Task { await store.refresh(silent: true) } }
        }
        .alert("提示", isPresented: Binding(get: { store.message != nil }, set: { if !$0 { store.message = nil } })) {
            Button("知道了", role: .cancel) { store.message = nil }
        } message: { Text(store.message ?? "") }
    }
    private var dock: some View {
        HStack(spacing: 0) {
            ForEach(Array(["首页", "归档", "收藏", "关于"].enumerated()), id: \.offset) { item in
                Button {
                    selectTab(item.offset)
                } label: {
                    Text(item.element).font(.system(size: 12, weight: .semibold))
                        .frame(maxWidth: .infinity).frame(height: 48)
                        .background {
                            if selected == item.offset {
                                Capsule().fill(Palette.cool).matchedGeometryEffect(id: "selected-tab", in: dockSelection)
                            }
                        }
                }.accessibilityLabel("底部导航：\(item.element)")
            }
            Button {
                selectTab(1); searchOpen = true
            } label: { Image(systemName: "magnifyingglass").font(.system(size: 17)).frame(width: 44, height: 48) }
                .accessibilityLabel("搜索文章")
        }
        .foregroundStyle(Palette.ink).buttonStyle(.plain).padding(.horizontal, 8).frame(height: 66)
        .modifier(WebsiteCard(radius: 40)).padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 9)
        .animation(reduceMotion ? nil : .spring(response: 0.58, dampingFraction: 0.9), value: selected)
        .gesture(DragGesture(minimumDistance: 35).onEnded { value in
            guard abs(value.translation.width) > 60, abs(value.translation.width) > abs(value.translation.height) * 2 else { return }
            selectTab(min(3, max(0, selected + (value.translation.width < 0 ? 1 : -1))))
        })
    }
    private func selectTab(_ next: Int) {
        withAnimation(reduceMotion ? nil : .spring(response: 0.58, dampingFraction: 0.9)) {
            expandedArticleID = nil; path.removeAll(); archiveTag = ""; searchOpen = false; selected = next
        }
    }
}

// The same source rectangle drives the lifted card and the reader's reveal mask.
private struct ArticleCardExpansion: View {
    @EnvironmentObject private var store: BlogStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let article: Article
    let source: CGRect
    let featured: Bool
    let viewport: CGSize
    let onClose: () -> Void
    @State private var expanded = false
    @State private var revealed = false
    @State private var closing = false
    @State private var ghostVisible = true
    private var origin: CGRect {
        source.width > 1 && source.height > 1 ? source : CGRect(x: 20, y: viewport.height * 0.4, width: max(1, viewport.width - 40), height: 180)
    }
    var body: some View {
        ZStack(alignment: .topLeading) {
            ZStack {
                Palette.paper
                ArticleReader(articleID: article.id, closeAction: close)
                    .opacity(revealed ? 1 : 0)
            }
            .frame(width: viewport.width, height: viewport.height)
            .mask(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: expanded ? 0 : 22, style: .continuous)
                    .frame(width: expanded ? viewport.width : origin.width, height: expanded ? viewport.height : origin.height)
                    .offset(x: expanded ? 0 : origin.minX, y: expanded ? 0 : origin.minY)
            }
            if !reduceMotion {
                WebsiteArticleRow(article: article, featured: featured, favorite: store.isFavorite(article))
                    .frame(width: origin.width)
                    .scaleEffect(expanded ? 1.035 : 1, anchor: .topLeading)
                    .offset(x: expanded ? 0 : origin.minX, y: expanded ? 0 : origin.minY)
                    .opacity(ghostVisible ? 1 : 0)
                    .allowsHitTesting(false).accessibilityHidden(true)
            }
        }
        .frame(width: viewport.width, height: viewport.height, alignment: .topLeading).clipped()
        .opacity(reduceMotion && closing ? 0 : 1)
        .allowsHitTesting(revealed && !closing)
        .simultaneousGesture(DragGesture(minimumDistance: 40).onEnded { value in
            if value.startLocation.x < 28 && value.translation.width > 85 && abs(value.translation.height) < 70 { close() }
        })
        .task {
            // Commit the source geometry before starting the native interpolation.
            try? await Task.sleep(nanoseconds: 20_000_000)
            guard !Task.isCancelled else { return }
            if reduceMotion {
                expanded = true
                withAnimation(.easeOut(duration: 0.18)) { revealed = true }
            } else {
                withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.72)) { expanded = true }
                withAnimation(.easeOut(duration: 0.24)) { ghostVisible = false }
                withAnimation(.easeOut(duration: 0.46).delay(0.14)) { revealed = true }
            }
        }
    }
    private func close() {
        guard !closing else { return }
        if reduceMotion {
            withAnimation(.easeOut(duration: 0.18)) { closing = true }
        } else {
            closing = true
            withAnimation(.timingCurve(0.3, 0, 0.2, 1, duration: 0.62)) { expanded = false }
            withAnimation(.easeOut(duration: 0.28)) { revealed = false }
            withAnimation(.easeOut(duration: 0.26).delay(0.22)) { ghostVisible = true }
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: reduceMotion ? 180_000_000 : 640_000_000)
            onClose()
        }
    }
}

private struct ActiveArticleCardKey: EnvironmentKey {
    static let defaultValue: String? = nil
}

private struct ArticleOpenKey: EnvironmentKey {
    static let defaultValue: ((String, CGRect, Bool) -> Void)? = nil
}
extension EnvironmentValues {
    var activeArticleCard: String? {
        get { self[ActiveArticleCardKey.self] }
        set { self[ActiveArticleCardKey.self] = newValue }
    }
    var openArticleCard: ((String, CGRect, Bool) -> Void)? {
        get { self[ArticleOpenKey.self] }
        set { self[ArticleOpenKey.self] = newValue }
    }
}
