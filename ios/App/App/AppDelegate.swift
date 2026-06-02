import UIKit
import Capacitor
import WebKit
import CoreNFC

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var nfcWriter: NFCWriter?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if let url = launchOptions?[.url] as? URL {
            handleURL(url)
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        handleURL(url)
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - URL routing
    //   vinylnfc://release/<id> → open that release (navigate the web view)
    //   vinylnfc://write/<id>   → write a tag holding vinylnfc://release/<id> (Core NFC)

    private func handleURL(_ url: URL) {
        guard let id = AppDelegate.idFromURL(url) else { return }
        if url.host == "write" {
            startNFCWrite(releaseId: id)
        } else {
            let target = "https://discogs-nfc.vercel.app/?release=\(id)"
            loadInWebView(target, attempt: 0)
        }
    }

    private static func idFromURL(_ url: URL) -> String? {
        let s = url.absoluteString
        guard let range = s.range(of: "(release|write)[/=][0-9]+", options: .regularExpression) else { return nil }
        let digits = String(s[range]).drop(while: { !$0.isNumber })
        return digits.isEmpty ? nil : String(digits)
    }

    private func loadInWebView(_ urlString: String, attempt: Int) {
        guard let url = URL(string: urlString) else { return }
        if let vc = window?.rootViewController as? CAPBridgeViewController, let webView = vc.bridge?.webView {
            webView.load(URLRequest(url: url))
        } else if attempt < 40 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                self?.loadInWebView(urlString, attempt: attempt + 1)
            }
        }
    }

    // MARK: - Native NFC writing (requires the NFC entitlement → paid Apple account).
    //   Without the entitlement, the session ends with a sandbox restriction error.
    //   The code is ready; to enable, add `com.apple.developer.nfc.readersession.formats`
    //   to an .entitlements file and sign with a paid team.

    private func startNFCWrite(releaseId: String) {
        let payload = "vinylnfc://release/\(releaseId)"
        nfcWriter = NFCWriter()
        nfcWriter?.write(payload)
    }
}

// MARK: - NFCWriter

final class NFCWriter: NSObject, NFCNDEFReaderSessionDelegate {
    private var session: NFCNDEFReaderSession?
    private var payload: String = ""

    func write(_ urlString: String) {
        guard NFCNDEFReaderSession.readingAvailable else { return }
        payload = urlString
        session = NFCNDEFReaderSession(delegate: self, queue: nil, invalidateAfterFirstRead: false)
        session?.alertMessage = "Acerca el iPhone al tag para grabar"
        session?.begin()
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        // Not used for writing.
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [NFCNDEFTag]) {
        guard let tag = tags.first else { return }
        session.connect(to: tag) { [payload] error in
            if error != nil {
                session.invalidate(errorMessage: "Error de conexión")
                return
            }
            guard let record = NFCNDEFPayload.wellKnownTypeURIPayload(string: payload) else {
                session.invalidate(errorMessage: "URL inválida")
                return
            }
            let message = NFCNDEFMessage(records: [record])
            tag.queryNDEFStatus { status, _, _ in
                switch status {
                case .readWrite:
                    tag.writeNDEF(message) { writeError in
                        if writeError != nil {
                            session.invalidate(errorMessage: "No se pudo grabar")
                        } else {
                            session.alertMessage = "¡Tag grabado!"
                            session.invalidate()
                        }
                    }
                case .readOnly:
                    session.invalidate(errorMessage: "El tag es de solo lectura")
                default:
                    session.invalidate(errorMessage: "Tag no compatible")
                }
            }
        }
    }

    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        self.session = nil
    }
}
