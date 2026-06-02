package world.homans.iitcnext;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private final ScriptInjector scriptInjector = new ScriptInjector();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (0 != (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        scriptInjector.loadUserScript(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        scriptInjector.loadUserScript(this);
    }

    public ScriptInjector getScriptInjector() {
        return scriptInjector;
    }

    public static String getCleanedUserAgent(Context context) {
        String defaultUA = WebSettings.getDefaultUserAgent(context);
        return defaultUA.replaceAll("Version/\\d+\\.\\d+\\s?", "").replaceAll(";\\s?wv", "");
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void load() {
        super.load();
        final WebView webView = getBridge().getWebView();
        configureWebView(webView);

        webView.setWebViewClient(new IITCWebViewClient(getBridge(), this));
        webView.setWebChromeClient(new IITCPopupHandler(getBridge(), this));
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setJavaScriptEnabled(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        settings.setUserAgentString(getCleanedUserAgent(this));

        webView.addJavascriptInterface(new IITCNativeInterface(), "IITC_Native");
    }
}
