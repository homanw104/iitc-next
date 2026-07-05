package world.homans.iitcnext;

import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

public class IITCWebViewClient extends BridgeWebViewClient {
    private final MainActivity activity;

    public IITCWebViewClient(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.activity = activity;
    }

    private boolean shouldInjectIITC(String url) {
        if (url == null) return false;

        Uri uri = Uri.parse(url);
        String path = uri.getPath();
        return IITCAuthUrlHelper.isIntelHost(uri)
            && (path == null || (!path.startsWith("/login") && !path.startsWith("/signinhandler")));
    }

    private boolean isIntelSignInHandler(String url) {
        return url != null && IITCAuthUrlHelper.isIntelSignInHandler(Uri.parse(url));
    }

    private void injectIITC(WebView view, String url) {
        if (shouldInjectIITC(url)) {
            view.evaluateJavascript(activity.getScriptInjector().getInjectionJs(), null);
        }
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (IngressLinkHandler.openInApp(activity, request.getUrl())) {
            return true;
        }

        return super.shouldOverrideUrlLoading(view, request);
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        activity.publishSystemInsets(view);
        if (isIntelSignInHandler(url)) {
            CookieManager.getInstance().flush();
            activity.openIntelMap();
            return;
        }

        injectIITC(view, url);
        // Retry after a short delay for cases where the DOM isn't ready
        view.postDelayed(() -> {
            activity.publishSystemInsets(view);
            injectIITC(view, view.getUrl());
        }, 2000);
    }

}
