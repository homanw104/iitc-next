package world.homans.iitcnext;

import android.util.Log;
import android.webkit.JavascriptInterface;

public class IITCNativeInterface {
    @JavascriptInterface
    public void log(String msg) {
        Log.i("IITC-Next", "JS Log: " + msg);
    }

    @JavascriptInterface
    public void diag(String data) {
        Log.d("IITC-Next", "JS Diag: " + data);
    }
}
