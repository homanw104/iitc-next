package world.homans.iitcnext;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.annotation.Nullable;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    private Dialog popupDialog;
    private String userScript;

    private static final String CESIUM_JS = "https://cdn.jsdelivr.net/npm/cesium@1.141.0/Build/Cesium/Cesium.js";
    private static final String CESIUM_CSS = "https://cdn.jsdelivr.net/npm/cesium@latest/Build/Cesium/Widgets/widgets.css";

    private String getLoaderJs() {
        return "javascript:(function() { " +
            "try { " +
            "if (window.IITC_NEXT_INJECTED) return; " +
            "window.IITC_NEXT_INJECTED = true; " +
            "var cScript = document.createElement('script'); " +
            "cScript.type = 'text/javascript'; " +
            "cScript.src = '" + CESIUM_JS + "'; " +
            "var lScript = document.createElement('link'); " +
            "lScript.rel = 'stylesheet'; " +
            "lScript.href = '" + CESIUM_CSS + "'; " +
            "var script = document.createElement('script'); " +
            "script.type = 'text/javascript'; " +
            "script.src = 'https://iitc-next.local/inject.js'; " +
            "var target = document.head || document.documentElement; " +
            "if (target) { target.appendChild(cScript); target.appendChild(lScript); target.appendChild(script); } " +
            "else { " +
            "document.addEventListener('DOMContentLoaded', function() { var t = document.head || document.documentElement; t.appendChild(cScript); t.appendChild(lScript); t.appendChild(script); }); } " +
            "} catch(e) { console.error('IITC-Next Loader Error', e); }" +
            "})();";
    }

    private void injectLoader(WebView view) {
        String url = view.getUrl();
        if (url != null && (url.contains("/signinhandler") || url.contains("/login"))) {
            return;
        }
        view.evaluateJavascript(getLoaderJs(), null);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (0 != (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        loadUserScript();
    }

    private void addIITCInterface(WebView webView) {
        // Keep the interface for compatibility with existing userscripts
        webView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void log(String msg) {
                // Silenced for production
            }

            @android.webkit.JavascriptInterface
            public void diag(String data) {
                // Silenced for production
            }
        }, "IITC_Native");
    }

    @Override
    public void onResume() {
        super.onResume();
        loadUserScript();
    }

    private void loadUserScript() {
        try {
            InputStream is = getAssets().open("public/iitc-next.user.js");
            BufferedReader reader = new BufferedReader(new InputStreamReader(is));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            userScript = sb.toString();
            reader.close();
        } catch (Exception e) {
            android.util.Log.e("IITC-Next", "Error loading userscript from assets", e);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void load() {
        super.load();
        final WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setJavaScriptEnabled(true); // Ensure JS is enabled

        android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // Dynamically set User Agent by removing WebView identifiers to bypass Google's block
        String defaultUA = WebSettings.getDefaultUserAgent(this);
        String cleanedUA = defaultUA.replaceAll("Version/\\d+\\.\\d+\\s?", "").replaceAll(";\\s?wv", "");
        settings.setUserAgentString(cleanedUA);

        addIITCInterface(webView);

        // Inject userscript using a more aggressive approach: re-set the client AFTER bridge initialization
        webView.post(() -> {
            webView.setWebViewClient(new com.getcapacitor.BridgeWebViewClient(getBridge()) {
                @Nullable
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    String urlStr = request.getUrl().toString();
                    
                    // Handle internal script requests (like the old project did)
                    if (urlStr.contains("iitc-next.local/inject.js")) {
                        if (userScript == null) loadUserScript();
                        if (userScript != null) {
                            String wrapper = "(function() { " +
                                "if (typeof GM_getResourceText === 'undefined') { " +
                                "  window.GM_getResourceText = function(name) { " +
                                "    return ''; " +
                                "  }; " +
                                "} " +
                                "if (typeof GM_addStyle === 'undefined') { " +
                                "  window.GM_addStyle = function(css) { " +
                                "    var style = document.createElement('style'); " +
                                "    style.type = 'text/css'; " +
                                "    style.innerHTML = css; " +
                                "    var target = document.head || document.documentElement; " +
                                "    if (target) target.appendChild(style); " +
                                "    return style; " +
                                "  }; " +
                                "} " +
                                "function start() { " +
                                "  try { " +
                                "    if (!document.body) { " +
                                "      setTimeout(start, 100); " +
                                "      return; " +
                                "    } " +
                                "    if (typeof Cesium === 'undefined') { " +
                                "      setTimeout(start, 100); " +
                                "      return; " +
                                "    } " +
                                userScript +
                                "  } catch (e) { " +
                                "    console.error('IITC-Next Execution Error', e); " +
                                "  } " +
                                "} " +
                                "start(); " +
                                "})();";
                            InputStream is = new ByteArrayInputStream(wrapper.getBytes(StandardCharsets.UTF_8));
                            return new WebResourceResponse("application/javascript", "UTF-8", is);
                        }
                    }

                    if (urlStr.contains("intel.ingress.com") && request.isForMainFrame() && userScript != null) {
                        // Skip injection on non-map pages (like login handler) to avoid errors
                        if (urlStr.contains("/signinhandler") || urlStr.contains("/login")) {
                            return null;
                        }
                        try {
                            URL url = new URL(urlStr);
                            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                            conn.setRequestMethod(request.getMethod());
                            
                            // Copy request headers
                            for (Map.Entry<String, String> entry : request.getRequestHeaders().entrySet()) {
                                conn.setRequestProperty(entry.getKey(), entry.getValue());
                            }
                            
                            // Handle response
                            InputStream in;
                            int responseCode = conn.getResponseCode();
                            if (responseCode >= 400) {
                                in = conn.getErrorStream();
                            } else {
                                in = conn.getInputStream();
                            }
                            
                            if (in == null) {
                                conn.disconnect();
                                return null;
                            }

                            String contentEncoding = conn.getContentEncoding();
                            if (contentEncoding != null && contentEncoding.equalsIgnoreCase("gzip")) {
                                in = new java.util.zip.GZIPInputStream(in);
                            }
                            
                            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                            StringBuilder responseBuilder = new StringBuilder();
                            String line;
                            while ((line = reader.readLine()) != null) {
                                responseBuilder.append(line).append("\n");
                            }
                            reader.close();
                            conn.disconnect();
                            
                            String html = responseBuilder.toString();
                            
                            // INJECT HERE - Use the old project's strategy: add a script tag that loads our script
                            String scriptTag = "<script type=\"text/javascript\" src=\"" + CESIUM_JS + "\"></script>" +
                                "<script type=\"text/javascript\">" +
                                "(function(){" +
                                "try {" +
                                "if (window.IITC_NEXT_INJECTED) return; " +
                                "window.IITC_NEXT_INJECTED = true; " +
                                "var script = document.createElement('script'); " +
                                "script.type = 'text/javascript'; " +
                                "script.src = 'https://iitc-next.local/inject.js'; " +
                                "var target = document.head || document.documentElement; " +
                                "if (target) { target.appendChild(script); } " +
                                "else { " +
                                "document.addEventListener('DOMContentLoaded', function() { (document.head || document.documentElement).appendChild(script); }); } " +
                                "} catch(e) { console.error('IITC-Next Interceptor Error', e); }" +
                                "})();" +
                                "</script>";
                            
                            // Try to inject at the very beginning of the response
                            if (html.toLowerCase().contains("<head>")) {
                                html = html.replaceFirst("(?i)<head>", "<head>" + scriptTag + "<link rel=\"stylesheet\" href=\"" + CESIUM_CSS + "\">");
                            } else if (html.toLowerCase().contains("<html>")) {
                                html = html.replaceFirst("(?i)<html>", "<html>" + scriptTag + "<link rel=\"stylesheet\" href=\"" + CESIUM_CSS + "\">");
                            } else {
                                html = scriptTag + "<link rel=\"stylesheet\" href=\"" + CESIUM_CSS + "\">" + html;
                            }

                            InputStream is = new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8));
                            Map<String, String> responseHeaders = new HashMap<>();
                            for (int i = 0; ; i++) {
                                String name = conn.getHeaderFieldKey(i);
                                String value = conn.getHeaderField(i);
                                if (name == null && value == null) break;
                                if (name != null) {
                                    if (name.equalsIgnoreCase("Content-Encoding") || name.equalsIgnoreCase("Content-Length")) continue;
                                    responseHeaders.put(name, value);
                                }
                            }
                            responseHeaders.put("Content-Type", "text/html; charset=utf-8");
                            responseHeaders.put("Access-Control-Allow-Origin", "*");
                            
                            return new WebResourceResponse("text/html", "UTF-8", responseCode, conn.getResponseMessage(), responseHeaders, is);
                        } catch (Exception e) {
                            android.util.Log.e("IITC-Next", "Interceptor Error", e);
                        }
                    }
                    return super.shouldInterceptRequest(view, request);
                }

                @Override
                public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                    super.onPageStarted(view, url, favicon);
                    if (url != null && url.contains("intel.ingress.com")) {
                        injectLoader(view);
                    }
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    if (url != null && url.contains("intel.ingress.com")) {
                        injectLoader(view);
                        view.postDelayed(() -> injectLoader(view), 2000);
                    }
                }

                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    super.onPageCommitVisible(view, url);
                    if (url != null && url.contains("intel.ingress.com")) {
                        injectLoader(view);
                    }
                }
            });
        });

        webView.setWebChromeClient(new com.getcapacitor.BridgeWebChromeClient(getBridge()) {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                super.onProgressChanged(view, newProgress);
                if (newProgress == 100) {
                    String url = view.getUrl();
                    if (url != null && url.contains("intel.ingress.com")) {
                        injectLoader(view);
                    }
                }
            }

            @SuppressLint("SetJavaScriptEnabled")
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                final WebView newWebView = new WebView(MainActivity.this);
                WebSettings settings = newWebView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setSupportMultipleWindows(true);
                settings.setJavaScriptCanOpenWindowsAutomatically(true);
                settings.setDomStorageEnabled(true);

                // Dynamically set User Agent for the popup as well
                String defaultUA = WebSettings.getDefaultUserAgent(MainActivity.this);
                String cleanedUA = defaultUA.replaceAll("Version/\\d+\\.\\d+\\s?", "").replaceAll(";\\s?wv", "");
                settings.setUserAgentString(cleanedUA);

                if (popupDialog != null && popupDialog.isShowing()) {
                    popupDialog.dismiss();
                }

                popupDialog = new Dialog(MainActivity.this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
                popupDialog.setContentView(newWebView);
                ViewGroup.LayoutParams params = newWebView.getLayoutParams();
                params.width = ViewGroup.LayoutParams.MATCH_PARENT;
                params.height = ViewGroup.LayoutParams.MATCH_PARENT;
                newWebView.setLayoutParams(params);
                popupDialog.show();

                newWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        String url = request.getUrl().toString();
                        if (url.contains("google.com") || url.contains("nianticspatial.com") || url.contains("ingress.com")) {
                            return false; // Let the new WebView handle it
                        }

                        // For everything else, use Custom Tabs
                        try {
                            CustomTabsIntent.Builder builder = new CustomTabsIntent.Builder();
                            CustomTabsIntent customTabsIntent = builder.build();
                            customTabsIntent.launchUrl(MainActivity.this, Uri.parse(url));
                            return true;
                        } catch (Exception e) {
                            // Fallback to external browser
                            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                            startActivity(intent);
                            return true;
                        }
                    }

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        // If it redirects back to ingress.com, we might want to close this popup
                        if (url.contains("intel.ingress.com") && !url.contains("auth")) {
                            if (popupDialog != null && popupDialog.isShowing()) {
                                popupDialog.dismiss();
                                popupDialog = null;
                            }
                        }
                    }
                });

                newWebView.setWebChromeClient(new android.webkit.WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        if (popupDialog != null && popupDialog.isShowing()) {
                            popupDialog.dismiss();
                            popupDialog = null;
                        }
                    }
                });

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(newWebView);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }
}
