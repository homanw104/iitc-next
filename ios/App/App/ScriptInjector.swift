import Foundation
import Capacitor

class ScriptInjector {
    private var cesiumJs = "https://cdn.jsdelivr.net/npm/cesium@1.142.0/Build/Cesium/Cesium.js"
    private var cesiumCss = "https://cdn.jsdelivr.net/npm/cesium@latest/Build/Cesium/Widgets/widgets.css"
    private var systemJs = "https://cdn.jsdelivr.net/npm/systemjs@6.15.1/dist/system.min.js"
    private var systemNamedRegister = "https://cdn.jsdelivr.net/npm/systemjs@6.15.1/dist/extras/named-register.min.js"
    private var scriptVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    private var scriptName = "iitc-next"

    private var userScript: String?

    func loadUserScript() {
        if let path = Bundle.main.path(forResource: "public/iitc-next.user", ofType: "js") {
            do {
                userScript = try String(contentsOfFile: path, encoding: .utf8)
                if let script = userScript {
                    parseMetadata(script: script)
                }
            } catch {
                print("IITC-Next: Error loading userscript: \(error)")
            }
        } else {
             // Fallback for Capacitor's public folder structure
             let bundlePath = Bundle.main.bundlePath
             let alternatePath = "\(bundlePath)/public/iitc-next.user.js"
             do {
                 userScript = try String(contentsOfFile: alternatePath, encoding: .utf8)
                 if let script = userScript {
                     parseMetadata(script: script)
                 }
             } catch {
                 print("IITC-Next: Error loading userscript from alternate path: \(error)")
             }
        }
    }

    private func parseMetadata(script: String) {
        let blockPattern = try? NSRegularExpression(pattern: "// ==UserScript==[\\s\\S]*?// ==/UserScript==", options: [])
        if let match = blockPattern?.firstMatch(in: script, options: [], range: NSRange(location: 0, length: script.utf16.count)) {
            let metadata = (script as NSString).substring(with: match.range)

            if let name = findTagValue(metadata: metadata, tag: "@name") {
                scriptName = name
            }
            if let version = findTagValue(metadata: metadata, tag: "@version") {
                scriptVersion = version
            }

            if let cesiumJsMatch = findRequireMatch(metadata: metadata, regex: "cesium@.*?/Cesium\\.js") {
                cesiumJs = cesiumJsMatch
            }
            if let systemJsMatch = findRequireMatch(metadata: metadata, regex: "systemjs@.*?/system\\.min\\.js") {
                systemJs = systemJsMatch
            }
            if let namedRegisterMatch = findRequireMatch(metadata: metadata, regex: "systemjs@.*?/named-register\\.min\\.js") {
                systemNamedRegister = namedRegisterMatch
            }
            if let cesiumCssMatch = findResourceMatch(metadata: metadata) {
                cesiumCss = cesiumCssMatch
            }
        }
    }

    private func findTagValue(metadata: String, tag: String) -> String? {
        let pattern = "//\\s+" + tag + "\\s+(.*)"
        let regex = try? NSRegularExpression(pattern: pattern, options: [])
        if let match = regex?.firstMatch(in: metadata, options: [], range: NSRange(location: 0, length: metadata.utf16.count)) {
            return (metadata as NSString).substring(with: match.range(at: 1)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }

    private func findRequireMatch(metadata: String, regex: String) -> String? {
        let pattern = "//\\s+@require\\s+(.*?" + regex + ")"
        let regexObj = try? NSRegularExpression(pattern: pattern, options: [])
        if let match = regexObj?.firstMatch(in: metadata, options: [], range: NSRange(location: 0, length: metadata.utf16.count)) {
            return (metadata as NSString).substring(with: match.range(at: 1)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }

    private func findResourceMatch(metadata: String) -> String? {
        let pattern = "//\\s+@resource\\s+\\S+\\s+(.*?" + "widgets\\.css" + ")"
        let regexObj = try? NSRegularExpression(pattern: pattern, options: [])
        if let match = regexObj?.firstMatch(in: metadata, options: [], range: NSRange(location: 0, length: metadata.utf16.count)) {
            return (metadata as NSString).substring(with: match.range(at: 1)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }

    private func jsStringLiteral(_ value: String) -> String {
        if let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
           let literal = String(data: data, encoding: .utf8) {
            return literal
        }

        return "\"\""
    }

    func getInjectionJs() -> String {
        guard let script = userScript else { return "" }

        let cesiumBaseUrl = cesiumJs.replacingOccurrences(of: "[^/]*$", with: "", options: .regularExpression)
        let cesiumJsLiteral = jsStringLiteral(cesiumJs)
        let cesiumCssLiteral = jsStringLiteral(cesiumCss)
        let systemJsLiteral = jsStringLiteral(systemJs)
        let systemNamedRegisterLiteral = jsStringLiteral(systemNamedRegister)
        let cesiumBaseUrlLiteral = jsStringLiteral(cesiumBaseUrl)
        let scriptNameLiteral = jsStringLiteral(scriptName)
        let scriptVersionLiteral = jsStringLiteral(scriptVersion)
        let scriptLiteral = jsStringLiteral(script)

        return """
        (function() {
          try {
            if (window.IITC_NEXT_INJECTED) return;
            if (window.IITC_NEXT_INJECTING) return;
            window.IITC_NEXT_INJECTING = true;
            window.unsafeWindow = window;

            window.IITC_Native = window.IITC_Native || {};
            if (window.IITC_Native) {
               window.navigator.geolocation.getCurrentPosition = function(success, error) {
                 window.onIOSLocation = function(lat, lng, acc) {
                   success({ coords: { latitude: lat, longitude: lng, accuracy: acc }, timestamp: Date.now() });
                 };
                 window.webkit.messageHandlers.IITC_Native.postMessage({command: 'getCurrentPosition'});
               };

               window.IITC_Native.saveFile = function(content, filename, mimeType) {
                 window.webkit.messageHandlers.IITC_Native.postMessage({command: 'saveFile', content: content, filename: filename, mimeType: mimeType});
               };
            }

            var l = document.createElement('link');
            l.rel = 'stylesheet'; l.href = \(cesiumCssLiteral);
            (document.head || document.documentElement).appendChild(l);

            function addScript(src, cb) {
              var s = document.createElement('script');
              s.type = 'text/javascript'; s.src = src;
              if (cb) s.onload = cb;
              s.onerror = function() {
                window.IITC_NEXT_INJECTING = false;
                console.error('IITC-Next: Failed to load dependency:', src);
              };
              (document.head || document.documentElement).appendChild(s);
            }

            window.CESIUM_BASE_URL = \(cesiumBaseUrlLiteral);

            addScript(\(cesiumJsLiteral));
            addScript(\(systemJsLiteral), function() {
              addScript(\(systemNamedRegisterLiteral), function() {
                var checkCesium = setInterval(function() {
                  if (typeof Cesium !== 'undefined') {
                    clearInterval(checkCesium);
                    window.GM_info = { script: { name: \(scriptNameLiteral), version: \(scriptVersionLiteral) } };
                    window.GM_addStyle = window.GM_addStyle || function(css) {
                      var style = document.createElement('style');
                      style.type = 'text/css';
                      style.innerHTML = css;
                      (document.head || document.documentElement).appendChild(style);
                      return style;
                    };
                    window.GM_getResourceText = window.GM_getResourceText || function() { return ''; };
                    window.GM_setValue = window.GM_setValue || function(key, value) {
                        localStorage.setItem('GM_' + key, JSON.stringify(value));
                    };
                    window.GM_getValue = window.GM_getValue || function(key, defaultValue) {
                        var val = localStorage.getItem('GM_' + key);
                        if (val === null) return defaultValue;
                        try { return JSON.parse(val); } catch(e) { return val; }
                    };
                    window.GM_deleteValue = window.GM_deleteValue || function(key) {
                        localStorage.removeItem('GM_' + key);
                    };
                    window.GM_listValues = window.GM_listValues || function() {
                        return Object.keys(localStorage).filter(function(k) { return k.indexOf('GM_') === 0; }).map(function(k) { return k.substring(3); });
                    };
                    window.GM_setClipboard = window.GM_setClipboard || function(text) {
                        var el = document.createElement('textarea');
                        el.value = text;
                        document.body.appendChild(el);
                        el.select();
                        document.execCommand('copy');
                        document.body.removeChild(el);
                    };

                    var s = document.createElement('script');
                    s.type = 'text/javascript';
                    s.textContent = \(scriptLiteral);
                    (document.head || document.documentElement).appendChild(s);
                    window.IITC_NEXT_INJECTED = true;
                    window.IITC_NEXT_INJECTING = false;
                  }
                }, 100);
                setTimeout(function() {
                  if (!window.IITC_NEXT_INJECTED) {
                    clearInterval(checkCesium);
                    window.IITC_NEXT_INJECTING = false;
                    console.error('IITC-Next: Timed out waiting for Cesium');
                  }
                }, 15000);
              });
            });
          } catch(e) {
            window.IITC_NEXT_INJECTING = false;
            console.error('IITC-Next injection error:', e);
          }
        })();
        """
    }
}
