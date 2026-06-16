package world.homans.iitcnext;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Message;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

public class IITCPopupHandler extends BridgeWebChromeClient {
    private final MainActivity activity;
    private Dialog popupDialog;

    public IITCPopupHandler(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.activity = activity;
    }

    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        callback.invoke(origin, true, false);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        final WebView newWebView = new WebView(activity);
        configurePopupWebView(newWebView);

        if (popupDialog != null && popupDialog.isShowing()) {
            popupDialog.dismiss();
        }

        popupDialog = new Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
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
                    return false;
                }

                try {
                    CustomTabsIntent.Builder builder = new CustomTabsIntent.Builder();
                    CustomTabsIntent customTabsIntent = builder.build();
                    customTabsIntent.launchUrl(activity, Uri.parse(url));
                    return true;
                } catch (Exception e) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    activity.startActivity(intent);
                    return true;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url.contains("intel.ingress.com") && !url.contains("auth")) {
                    CookieManager.getInstance().flush();
                    activity.getBridge().getWebView().loadUrl(url);
                    dismissPopup();
                }
            }
        });

        newWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onCloseWindow(WebView window) {
                dismissPopup();
            }
        });

        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(newWebView);
        resultMsg.sendToTarget();
        return true;
    }

    private void configurePopupWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setDomStorageEnabled(true);

        String cleanedUA = MainActivity.getCleanedUserAgent(activity);
        settings.setUserAgentString(cleanedUA);

        // Set _ncc cookie to disable Niantic's cookie consent banner
        try {
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setCookie("https://signin.nianticspatial.com", "_ncc=0; Path=/; Domain=.nianticspatial.com");
        } catch (Exception e) {
            Log.w("IITCPopupHandler", "Could not set _ncc cookie: " + e.getMessage());
        }
    }

    private void dismissPopup() {
        if (popupDialog != null && popupDialog.isShowing()) {
            popupDialog.dismiss();
            popupDialog = null;
        }
    }
}
