package world.homans.iitcnext;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private final ScriptInjector scriptInjector = new ScriptInjector();
    private static final int PERMISSION_REQUEST_CODE = 1234;
    private Insets systemBarInsets = Insets.NONE;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.AppTheme_NoActionBar);
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        configureEdgeToEdge();
        super.onCreate(savedInstanceState);
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
        if (0 != (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        scriptInjector.loadUserScript(this);
        checkAndRequestPermissions();
    }

    private void configureEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );

        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(false);
        insetsController.setAppearanceLightNavigationBars(false);
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
        configureSystemInsetBridge(webView);

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

    private void configureSystemInsetBridge(WebView webView) {
        View webViewParent = (View) webView.getParent();

        ViewCompat.setOnApplyWindowInsetsListener(webViewParent, (view, windowInsets) -> {
            systemBarInsets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            view.setPadding(0, 0, 0, 0);
            publishSystemInsets(webView);
            return windowInsets;
        });

        webViewParent.setPadding(0, 0, 0, 0);
        webView.setPadding(0, 0, 0, 0);

        ViewGroup.LayoutParams layoutParams = webView.getLayoutParams();
        layoutParams.width = ViewGroup.LayoutParams.MATCH_PARENT;
        layoutParams.height = ViewGroup.LayoutParams.MATCH_PARENT;
        webView.setLayoutParams(layoutParams);

        ViewCompat.requestApplyInsets(webViewParent);
    }

    public void publishSystemInsets(WebView webView) {
        float density = getResources().getDisplayMetrics().density;
        int top = Math.round(systemBarInsets.top / density);
        int right = Math.round(systemBarInsets.right / density);
        int bottom = Math.round(systemBarInsets.bottom / density);
        int left = Math.round(systemBarInsets.left / density);
        String script =
            "document.documentElement.style.setProperty('--iitc-system-top-inset', '" + top + "px');" +
            "document.documentElement.style.setProperty('--iitc-system-right-inset', '" + right + "px');" +
            "document.documentElement.style.setProperty('--iitc-system-bottom-inset', '" + bottom + "px');" +
            "document.documentElement.style.setProperty('--iitc-system-left-inset', '" + left + "px');";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }
}
