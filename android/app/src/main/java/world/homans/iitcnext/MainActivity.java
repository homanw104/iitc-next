package world.homans.iitcnext;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private final ScriptInjector scriptInjector = new ScriptInjector();
    private static final int PERMISSION_REQUEST_CODE = 1234;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (0 != (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        scriptInjector.loadUserScript(this);
        checkAndRequestPermissions();
    }

    private void checkAndRequestPermissions() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            
            ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                PERMISSION_REQUEST_CODE);
        }
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
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setGeolocationEnabled(true);

        android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // Set _ncc cookie to disable Niantic's cookie consent banner
        try {
            cookieManager.setAcceptCookie(true);
            cookieManager.setCookie("https://signin.nianticspatial.com", "_ncc=0; Path=/; Domain=.nianticspatial.com");
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "Could not set _ncc cookie: " + e.getMessage());
        }

        settings.setUserAgentString(getCleanedUserAgent(this));

        webView.addJavascriptInterface(new IITCNativeInterface(webView), "IITC_Native");
    }
}
