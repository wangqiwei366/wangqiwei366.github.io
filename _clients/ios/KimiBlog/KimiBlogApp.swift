import SwiftUI
import UIKit

enum Palette {
    static let ink = Color.primary
    static let muted = Color.secondary
    static let line = Color(uiColor: .separator)
    static let cool = Color(uiColor: .secondarySystemBackground)
    static let red = Color(red: 198 / 255, green: 71 / 255, blue: 57 / 255)
    static let teal = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.54, green: 0.78, blue: 0.75, alpha: 1)
            : UIColor(red: 53 / 255, green: 109 / 255, blue: 105 / 255, alpha: 1)
    })
    static let paper = Color(uiColor: .systemBackground)
    static let charcoal = Color(red: 23 / 255, green: 24 / 255, blue: 24 / 255)
}

@main
struct KimiBlogApp: App {
    @StateObject private var store = BlogStore()
    @StateObject private var commentAccount = CommentAccount()
    @AppStorage("appearance") private var appearance = "system"

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(commentAccount)
                .tint(Palette.ink)
                .preferredColorScheme(appearance == "light" ? .light : appearance == "dark" ? .dark : nil)
        }
    }
}

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var store: BlogStore

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("首页", systemImage: "house") }
            LibraryView(favoritesOnly: false)
                .tabItem { Label("归档", systemImage: "tray.full") }
            LibraryView(favoritesOnly: true)
                .tabItem { Label("收藏", systemImage: "bookmark") }
            AboutView()
                .tabItem { Label("关于", systemImage: "person.crop.circle") }
            SettingsView()
                .tabItem { Label("设置", systemImage: "slider.horizontal.3") }
        }
        // Load the cached snapshot immediately, then pull the latest public
        // article index and About page when the app opens.
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
        } message: {
            Text(store.message ?? "")
        }
    }
}
