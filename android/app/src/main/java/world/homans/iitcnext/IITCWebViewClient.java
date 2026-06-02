package world.homans.iitcnext;

import android.graphics.Bitmap;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

public class IITCWebViewClient extends BridgeWebViewClient {
    private final MainActivity activity;

    public IITCWebViewClient(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.activity = activity;
    }

    private void injectIITC(WebView view) {
        String url = view.getUrl();
        if (url != null && url.contains("intel.ingress.com") && !url.contains("/login") && !url.contains("/signinhandler")) {
            view.evaluateJavascript(activity.getScriptInjector().getInjectionJs(), null);
        }
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
        injectIITC(view);
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        injectIITC(view);
        // Retry after a short delay for cases where the DOM isn't ready
        view.postDelayed(() -> injectIITC(view), 2000);
    }

    @Override
    public void onPageCommitVisible(WebView view, String url) {
        super.onPageCommitVisible(view, url);
        injectIITC(view);
    }
}
