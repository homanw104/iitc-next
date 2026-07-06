package world.homans.iitcnext;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Message;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

public class IITCPopupHandler extends BridgeWebChromeClient {
    private static final float POPUP_WIDTH_RATIO = 0.94f;
    private static final float POPUP_HEIGHT_RATIO = 0.86f;
    private static final float POPUP_DIM_AMOUNT = 0.42f;
    private static final float POPUP_CORNER_RADIUS_DP = 18f;

    private final MainActivity activity;
    private final Map<WebView, Dialog> popupDialogs = new HashMap<>();

    public IITCPopupHandler(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.activity = activity;
    }

    private void completeIntelReturn(String url) {
        CookieManager.getInstance().flush();
        dismissAllPopups();
        Uri uri = Uri.parse(url);
        if (IITCAuthUrlHelper.isIntelSignInHandler(uri)) {
            activity.openIntelMap();
        } else {
            activity.openMainWebViewUrl(url);
        }
    }

    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        callback.invoke(origin, true, false);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        if (!isUserGesture) return false;
        if (routeClickedUrlOutsidePopup(view)) return false;

        final WebView newWebView = createPopupWebView();
        showPopupDialog(newWebView);
        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(newWebView);
        resultMsg.sendToTarget();
        return true;
    }

    private WebView createPopupWebView() {
        WebView popupWebView = new WebView(activity);
        configurePopupWebView(popupWebView);
        popupWebView.setWebViewClient(createPopupWebViewClient());
        popupWebView.setWebChromeClient(createPopupChromeClient());
        return popupWebView;
    }

    private WebViewClient createPopupWebViewClient() {
        return new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!request.isForMainFrame()) {
                    return false;
                }

                String googleRedirect = IITCAuthUrlHelper.getGoogleRedirectTarget(uri);
                if (googleRedirect != null) {
                    return loadGoogleRedirect(view, googleRedirect);
                }

                if (IngressLinkHandler.openInApp(activity, uri)) {
                    dismissPopup(view);
                    return true;
                }

                if (IITCAuthUrlHelper.isIntelHost(uri) && "GET".equalsIgnoreCase(request.getMethod())) {
                    completeIntelReturn(uri.toString());
                    return true;
                }

                if (IITCAuthUrlHelper.isAllowedAuthHost(uri)) {
                    return false;
                }

                openExternalAndDismiss(view, uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                Uri uri = Uri.parse(url);
                if (IITCAuthUrlHelper.isIntelHost(uri)) {
                    completeIntelReturn(url);
                }
            }
        };
    }

    private WebChromeClient createPopupChromeClient() {
        return new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                if (!isUserGesture) return false;
                if (routeClickedUrlOutsidePopup(view)) return false;

                WebView nestedWebView = createPopupWebView();
                showPopupDialog(nestedWebView);
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(nestedWebView);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onCloseWindow(WebView window) {
                dismissPopup(window);
            }
        };
    }

    private void showPopupDialog(WebView webView) {
        Dialog dialog = new Dialog(activity);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setContentView(createPopupContainer(webView));
        dialog.setCanceledOnTouchOutside(true);
        dialog.setOnDismissListener(dismissedDialog -> {
            popupDialogs.remove(webView);
            webView.destroy();
        });

        popupDialogs.put(webView, dialog);
        dialog.show();

        Window window = dialog.getWindow();
        if (window == null) return;

        DisplayMetrics metrics = activity.getResources().getDisplayMetrics();
        int width = Math.round(metrics.widthPixels * POPUP_WIDTH_RATIO);
        int height = Math.round(metrics.heightPixels * POPUP_HEIGHT_RATIO);
        window.setLayout(width, height);
        window.setGravity(Gravity.CENTER);
        window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        WindowManager.LayoutParams attributes = window.getAttributes();
        attributes.dimAmount = POPUP_DIM_AMOUNT;
        window.setAttributes(attributes);
        window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
    }

    private FrameLayout createPopupContainer(WebView webView) {
        FrameLayout container = new FrameLayout(activity);
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.WHITE);
        background.setCornerRadius(dpToPx(POPUP_CORNER_RADIUS_DP));
        container.setBackground(background);
        container.setClipToOutline(true);

        webView.setBackgroundColor(Color.WHITE);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        container.addView(webView);
        return container;
    }

    private void configurePopupWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        IITCWebViewSettings.configureAuthIdentity(activity, settings);
        IITCWebViewSettings.configureNianticCookies(webView);
    }

    private int dpToPx(float dp) {
        return Math.round(dp * activity.getResources().getDisplayMetrics().density);
    }

    private boolean loadGoogleRedirect(WebView view, String url) {
        Uri uri = Uri.parse(url);
        if (IITCAuthUrlHelper.isAllowedAuthHost(uri)) {
            view.loadUrl(url);
        } else {
            openExternalAndDismiss(view, uri);
        }
        return true;
    }

    private boolean routeClickedUrlOutsidePopup(WebView view) {
        Uri uri = getHitTestUri(view);
        if (uri == null) return false;

        if (IngressLinkHandler.openInApp(activity, uri)) return true;
        if (IITCAuthUrlHelper.isAllowedAuthHost(uri)) return false;

        ExternalLinkHandler.open(activity, uri);
        return true;
    }

    private Uri getHitTestUri(WebView view) {
        WebView.HitTestResult hitTestResult = view.getHitTestResult();
        if (hitTestResult == null) return null;

        String url = hitTestResult.getExtra();
        if (url == null || url.isEmpty()) return null;

        Uri uri = Uri.parse(url);
        return uri.getScheme() == null ? null : uri;
    }

    private void openExternalAndDismiss(WebView webView, Uri uri) {
        ExternalLinkHandler.open(activity, uri);
        dismissPopup(webView);
    }

    private void dismissPopup(WebView webView) {
        Dialog dialog = popupDialogs.get(webView);
        if (dialog != null && dialog.isShowing()) {
            dialog.dismiss();
        }
    }

    private void dismissAllPopups() {
        for (Dialog dialog : new ArrayList<>(popupDialogs.values())) {
            if (dialog.isShowing()) {
                dialog.dismiss();
            }
        }
    }
}
