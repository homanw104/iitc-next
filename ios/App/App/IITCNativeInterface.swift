import Foundation
import WebKit
import CoreLocation
import Capacitor

@objc(IITCNativeInterface)
class IITCNativeInterface: NSObject, WKScriptMessageHandler, CLLocationManagerDelegate {
    private weak var webView: WKWebView?
    private let locationManager = CLLocationManager()

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        self.locationManager.delegate = self
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let command = body["command"] as? String else { return }

        switch command {
        case "log":
            if let msg = body["msg"] as? String {
                print("IITC-Next JS Log: \(msg)")
            }
        case "getCurrentPosition":
            getCurrentPosition()
        case "saveFile":
            if let content = body["content"] as? String,
               let filename = body["filename"] as? String,
               let mimeType = body["mimeType"] as? String {
                saveFile(content: content, filename: filename, mimeType: mimeType)
            }
        default:
            break
        }
    }

    private func getCurrentPosition() {
        let status = CLLocationManager.authorizationStatus()
        if status == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        } else if status == .authorizedWhenInUse || status == .authorizedAlways {
            locationManager.startUpdatingLocation()
        } else {
            print("IITC-Next: Location permission denied")
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        locationManager.stopUpdatingLocation()

        let js = "if (window.onIOSLocation) window.onIOSLocation(\(location.coordinate.latitude), \(location.coordinate.longitude), \(location.horizontalAccuracy))"
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("IITC-Next: Location error: \(error)")
    }

    private func saveFile(content: String, filename: String, mimeType: String) {
        DispatchQueue.main.async {
            guard let webView = self.webView else { return }
            let tempDir = FileManager.default.temporaryDirectory
            let fileURL = tempDir.appendingPathComponent(filename)

            do {
                try content.write(to: fileURL, atomically: true, encoding: .utf8)

                let activityViewController = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)

                if let popoverController = activityViewController.popoverPresentationController {
                    popoverController.sourceView = webView
                    popoverController.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 0, height: 0)
                    popoverController.permittedArrowDirections = []
                }

                if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                   let rootVC = windowScene.windows.first?.rootViewController {
                    rootVC.present(activityViewController, animated: true, completion: nil)
                }
            } catch {
                print("IITC-Next: Error saving file: \(error)")
            }
        }
    }
}
