package world.homans.iitcnext;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private final ScriptInjector scriptInjector = new ScriptInjector();
    private IITCNativeInterface nativeInterface;
    private Insets systemBarInsets = Insets.NONE;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
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

    @Override
    public void onResume() {
        super.onResume();
        scriptInjector.loadUserScript(this);
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        @NonNull String[] permissions,
        @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (nativeInterface != null) {
            nativeInterface.onRequestPermissionsResult(requestCode);
        }
    }

    public ScriptInjector getScriptInjector() {
        return scriptInjector;
    }

    public void openIntelMap() {
        openMainWebViewUrl(IITCUrlPolicy.INTEL_MAP_URL);
    }

    public void openMainWebViewUrl(String url) {
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url));
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

        IITCWebViewSettings.configureNianticCookies(webView);
        IITCWebViewSettings.configureAuthIdentity(this, settings);

        nativeInterface = new IITCNativeInterface(webView, this);
        webView.addJavascriptInterface(nativeInterface, "IITC_Native");
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
