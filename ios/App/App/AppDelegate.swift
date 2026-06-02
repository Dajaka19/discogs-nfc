import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // If the app was cold-launched from a vinylnfc:// link, handle it once ready.
        if let url = launchOptions?[.url] as? URL {
            handleDeepLink(url)
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // vinylnfc://release/<id> → navigate the web view to the ?release= URL,
        // which the web app already knows how to load. This does not depend on the
        // JS bridge (which isn't reliably injected when loading a remote server.url).
        handleDeepLink(url)
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Deep link handling

    private func handleDeepLink(_ url: URL) {
        guard let id = AppDelegate.releaseId(from: url) else { return }
        let target = "https://discogs-nfc.vercel.app/?release=\(id)"
        loadInWebView(target, attempt: 0)
    }

    private static func releaseId(from url: URL) -> String? {
        let s = url.absoluteString
        guard let range = s.range(of: "release[/=][0-9]+", options: .regularExpression) else { return nil }
        let digits = String(s[range]).drop(while: { !$0.isNumber })
        return digits.isEmpty ? nil : String(digits)
    }

    private func loadInWebView(_ urlString: String, attempt: Int) {
        guard let url = URL(string: urlString) else { return }
        if let vc = window?.rootViewController as? CAPBridgeViewController, let webView = vc.bridge?.webView {
            webView.load(URLRequest(url: url))
        } else if attempt < 40 {
            // Cold start: the bridge/web view may not exist yet — retry briefly.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                self?.loadInWebView(urlString, attempt: attempt + 1)
            }
        }
    }
}
