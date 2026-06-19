import Foundation
import WebKit
import Capacitor

@objc(IITCViewController)
class IITCViewController: CAPBridgeViewController, WKUIDelegate {
    private let scriptInjector = ScriptInjector()
    private var nativeInterface: IITCNativeInterface?
    private weak var capacitorUIDelegate: WKUIDelegate?
    private weak var capacitorNavigationDelegate: WKNavigationDelegate?
    private weak var popupViewController: UIViewController?
    private weak var popupWebView: WKWebView?
    private let safariUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1"

    override func viewDidLoad() {
        super.viewDidLoad()
        scriptInjector.loadUserScript()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        publishSystemInsets()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        publishSystemInsets()
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // Capacitor installs its own WKUIDelegate after webView(with:) returns.
        // Replace it here so window.open creates an in-app popup instead of Safari.
        if let webView = webView {
            capacitorUIDelegate = webView.uiDelegate
            capacitorNavigationDelegate = webView.navigationDelegate
            webView.uiDelegate = self
            webView.navigationDelegate = self
            publishSystemInsets(to: webView)
        }
    }

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.allowsInlineMediaPlayback = true
        configuration.websiteDataStore = .default()
        configuration.applicationNameForUserAgent = "Version/17.4.1 Mobile/15E148 Safari/604.1"

        let webView = super.webView(with: frame, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true

        let interceptorScript = WKUserScript(source: """
            (function() {
                if (window.IITC_POPUP_INTERCEPTOR_INJECTED) return;
                window.IITC_POPUP_INTERCEPTOR_INJECTED = true;

                var originalOpen = window.open;
                window.open = function(url, target, features) {
                    console.log("window.open called for: " + url + " target: " + target);
                    var result = originalOpen.apply(this, arguments);

                    if (result === null && (url === '' || url === 'about:blank' || (url && url.indexOf('google.com') !== -1))) {
                        console.log("window.open returned null for Google-related URL, possible block.");
                    }
                    return result;
                };

                window.open.toString = function() { return "function open() { [native code] }"; };
            })();
        """, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        webView.configuration.userContentController.addUserScript(interceptorScript)

        let native = IITCNativeInterface(webView: webView)
        self.nativeInterface = native
        webView.configuration.userContentController.add(native, name: "IITC_Native")

        // Keep auth pages on the mobile Safari code path instead of the embedded-webview code path.
        webView.customUserAgent = safariUserAgent
        UserDefaults.standard.register(defaults: ["UserAgent": safariUserAgent])
        setNianticCookie(in: webView.configuration.websiteDataStore)

        return webView
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        if capacitorUIDelegate !== self,
           let handledDelegate = capacitorUIDelegate,
           handledDelegate.responds(to: #selector(webView(_:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:))) {
            handledDelegate.webView?(webView, runJavaScriptAlertPanelWithMessage: message, initiatedByFrame: frame, completionHandler: completionHandler)
            return
        }

        let alertController = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alertController.addAction(UIAlertAction(title: "Ok", style: .default) { _ in
            completionHandler()
        })
        topViewController().present(alertController, animated: true, completion: nil)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        if capacitorUIDelegate !== self,
           let handledDelegate = capacitorUIDelegate,
           handledDelegate.responds(to: #selector(webView(_:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:))) {
            handledDelegate.webView?(webView, runJavaScriptConfirmPanelWithMessage: message, initiatedByFrame: frame, completionHandler: completionHandler)
            return
        }

        let alertController = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alertController.addAction(UIAlertAction(title: "Cancel", style: .default) { _ in
            completionHandler(false)
        })
        alertController.addAction(UIAlertAction(title: "Ok", style: .default) { _ in
            completionHandler(true)
        })
        topViewController().present(alertController, animated: true, completion: nil)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        if capacitorUIDelegate !== self,
           let handledDelegate = capacitorUIDelegate,
           handledDelegate.responds(to: #selector(webView(_:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:))) {
            handledDelegate.webView?(webView, runJavaScriptTextInputPanelWithPrompt: prompt, defaultText: defaultText, initiatedByFrame: frame, completionHandler: completionHandler)
            return
        }

        let alertController = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alertController.addTextField { textField in
            textField.text = defaultText
        }
        alertController.addAction(UIAlertAction(title: "Cancel", style: .default) { _ in
            completionHandler(nil)
        })
        alertController.addAction(UIAlertAction(title: "Ok", style: .default) { _ in
            completionHandler(alertController.textFields?.first?.text ?? defaultText)
        })
        topViewController().present(alertController, animated: true, completion: nil)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            print("Creating popup webview for URL: \(url.absoluteString)")
        } else {
            print("Creating popup webview with no initial URL (about:blank)")
        }

        closePopup(animated: false)

        configuration.websiteDataStore = webView.configuration.websiteDataStore
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        if #available(iOS 14.0, *) {
            configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        }
        if #available(iOS 14.5, *) {
            configuration.preferences.isTextInteractionEnabled = true
        }
        configuration.allowsInlineMediaPlayback = true
        configuration.applicationNameForUserAgent = webView.configuration.applicationNameForUserAgent
        setNianticCookie(in: configuration.websiteDataStore)

        let popupWebView = WKWebView(frame: .zero, configuration: configuration)
        popupWebView.uiDelegate = self
        popupWebView.navigationDelegate = self
        popupWebView.customUserAgent = webView.customUserAgent ?? safariUserAgent
        popupWebView.allowsBackForwardNavigationGestures = true
        self.popupWebView = popupWebView

        let vc = UIViewController()
        vc.view.backgroundColor = .white
        vc.modalPresentationStyle = .fullScreen

        vc.view.addSubview(popupWebView)
        popupWebView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            popupWebView.topAnchor.constraint(equalTo: vc.view.safeAreaLayoutGuide.topAnchor),
            popupWebView.bottomAnchor.constraint(equalTo: vc.view.bottomAnchor),
            popupWebView.leadingAnchor.constraint(equalTo: vc.view.leadingAnchor),
            popupWebView.trailingAnchor.constraint(equalTo: vc.view.trailingAnchor)
        ])

        let closeButton = UIButton(type: .system)
        closeButton.setTitle("Done", for: .normal)
        closeButton.addTarget(self, action: #selector(closePopupFromButton), for: .touchUpInside)
        vc.view.addSubview(closeButton)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: vc.view.safeAreaLayoutGuide.topAnchor, constant: 10),
            closeButton.trailingAnchor.constraint(equalTo: vc.view.trailingAnchor, constant: -16)
        ])

        popupViewController = vc

        DispatchQueue.main.async {
            self.topViewController().present(vc, animated: true, completion: nil)
        }

        return popupWebView
    }

    @objc private func closePopupFromButton() {
        closePopup(animated: true)
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView == popupWebView {
            closePopup(animated: true)
        }
    }

    private func closePopup(animated: Bool) {
        if let popupViewController = popupViewController {
            popupViewController.dismiss(animated: animated, completion: nil)
        } else {
            popupWebView?.removeFromSuperview()
        }
        popupWebView = nil
        popupViewController = nil
    }

    private func topViewController() -> UIViewController {
        var topController: UIViewController = self
        while let presented = topController.presentedViewController {
            topController = presented
        }
        return topController
    }

    private func setNianticCookie(in dataStore: WKWebsiteDataStore) {
        let cookieProperties: [HTTPCookiePropertyKey: Any] = [
            .domain: ".nianticspatial.com",
            .path: "/",
            .name: "_ncc",
            .value: "0",
            .secure: "TRUE",
            .expires: Date(timeIntervalSinceNow: 31536000)
        ]

        if let cookie = HTTPCookie(properties: cookieProperties) {
            dataStore.httpCookieStore.setCookie(cookie, completionHandler: nil)
        }

        var nianticLabsProperties = cookieProperties
        nianticLabsProperties[.domain] = ".nianticlabs.com"
        if let cookie = HTTPCookie(properties: nianticLabsProperties) {
            dataStore.httpCookieStore.setCookie(cookie, completionHandler: nil)
        }
    }

    private func isWebUrl(_ url: URL) -> Bool {
        let scheme = (url.scheme ?? "").lowercased()
        return scheme == "http" || scheme == "https" || scheme == "about" || scheme == "data"
    }

    private func isInternalAuthUrl(_ url: URL) -> Bool {
        let host = (url.host ?? "").lowercased()
        return host == "google.com"
            || host.hasSuffix(".google.com")
            || host == "google.co"
            || host.hasSuffix(".google.co")
            || host == "googleusercontent.com"
            || host.hasSuffix(".googleusercontent.com")
            || host == "gstatic.com"
            || host.hasSuffix(".gstatic.com")
            || host == "googleapis.com"
            || host.hasSuffix(".googleapis.com")
            || host == "nianticspatial.com"
            || host.hasSuffix(".nianticspatial.com")
            || host == "nianticlabs.com"
            || host.hasSuffix(".nianticlabs.com")
            || host == "ingress.com"
            || host.hasSuffix(".ingress.com")
    }

    private func publishSystemInsets() {
        if let webView = webView {
            publishSystemInsets(to: webView)
        }
        if let popupWebView = popupWebView {
            publishSystemInsets(to: popupWebView, from: popupViewController?.view)
        }
    }

    private func publishSystemInsets(to targetWebView: WKWebView, from sourceView: UIView? = nil) {
        let insets = (sourceView ?? view).safeAreaInsets
        let script = """
            document.documentElement.style.setProperty('--iitc-system-top-inset', '\(Int(round(insets.top)))px');
            document.documentElement.style.setProperty('--iitc-system-right-inset', '\(Int(round(insets.right)))px');
            document.documentElement.style.setProperty('--iitc-system-bottom-inset', '\(Int(round(insets.bottom)))px');
            document.documentElement.style.setProperty('--iitc-system-left-inset', '\(Int(round(insets.left)))px');
        """
        DispatchQueue.main.async {
            targetWebView.evaluateJavaScript(script, completionHandler: nil)
        }
    }
}

extension IITCViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if capacitorNavigationDelegate !== self,
           let handledDelegate = capacitorNavigationDelegate,
           handledDelegate.responds(to: #selector(webView(_:didFinish:))) {
            handledDelegate.webView?(webView, didFinish: navigation)
        }

        publishSystemInsets(to: webView, from: webView == popupWebView ? popupViewController?.view : nil)

        guard let url = webView.url?.absoluteString else { return }

        if url.contains("intel.ingress.com") && !url.contains("/login") && !url.contains("/signinhandler") {
            webView.evaluateJavaScript(scriptInjector.getInjectionJs(), completionHandler: nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                self.publishSystemInsets(to: webView, from: webView == self.popupWebView ? self.popupViewController?.view : nil)
                webView.evaluateJavaScript(self.scriptInjector.getInjectionJs(), completionHandler: nil)
            }
        }

        if webView == popupWebView && url.contains("intel.ingress.com") && !url.contains("auth"), let finalUrl = webView.url {
            self.webView?.load(URLRequest(url: finalUrl))
            closePopup(animated: true)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url {
            let scheme = (url.scheme ?? "").lowercased()
            print("Deciding policy for URL: \(url.absoluteString)")

            if webView == popupWebView && isWebUrl(url) {
                if navigationAction.targetFrame == nil {
                    webView.load(navigationAction.request)
                    decisionHandler(.cancel)
                    return
                }

                decisionHandler(.allow)
                return
            }

            if navigationAction.targetFrame == nil && isInternalAuthUrl(url) {
                webView.load(navigationAction.request)
                decisionHandler(.cancel)
                return
            }

            if !isWebUrl(url) {
                if UIApplication.shared.canOpenURL(url) {
                    print("Opening external app for scheme: \(scheme)")
                    UIApplication.shared.open(url)
                    decisionHandler(.cancel)
                    return
                }
            }

            if isInternalAuthUrl(url) {
                decisionHandler(.allow)
                return
            }

            if webView != self.webView && url.host != nil && !isWebUrl(url) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }
}
