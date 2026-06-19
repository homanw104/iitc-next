package world.homans.iitcnext;

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
        if (url != null && url.contains("intel.ingress.com") && !url.contains("/login") && !url.contains("/signinhandler")) {
            return true;
        }
        return false;
    }

    private void injectIITC(WebView view, String url) {
        if (shouldInjectIITC(url)) {
            view.evaluateJavascript(activity.getScriptInjector().getInjectionJs(), null);
        }
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        activity.publishSystemInsets(view);
        injectIITC(view, url);
        // Retry after a short delay for cases where the DOM isn't ready
        view.postDelayed(() -> {
            activity.publishSystemInsets(view);
            injectIITC(view, view.getUrl());
        }, 2000);
    }

}
