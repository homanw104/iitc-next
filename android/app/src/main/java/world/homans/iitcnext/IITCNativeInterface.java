package world.homans.iitcnext;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import java.util.Locale;

public class IITCNativeInterface {
    private WebView webView;
    private LocationManager locationManager;

    public IITCNativeInterface(WebView webView) {
        this.webView = webView;
        this.locationManager = (LocationManager) webView.getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(webView.getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
               ContextCompat.checkSelfPermission(webView.getContext(), Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface
    public void log(String msg) {
        Log.i("IITC-Next", "JS Log: " + msg);
    }

    @JavascriptInterface
    public void diag(String data) {
        Log.d("IITC-Next", "JS Diag: " + data);
    }

    @JavascriptInterface
    public void getCurrentPosition() {
        webView.post(() -> {
            try {
                if (!hasLocationPermission()) {
                    Log.e("IITC-Next", "Location permission missing at runtime");
                    return;
                }

                Location lastKnown = null;
                if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    lastKnown = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                }
                if (lastKnown == null && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    lastKnown = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                }

                if (lastKnown != null) {
                    sendLocationToJs(lastKnown);
                }

                // Also request a fresh update
                locationManager.requestSingleUpdate(LocationManager.GPS_PROVIDER, new LocationListener() {
                    @Override public void onLocationChanged(@NonNull Location location) { sendLocationToJs(location); }
                    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
                    @Override public void onProviderEnabled(String provider) {}
                    @Override public void onProviderDisabled(String provider) {}
                }, null);
            } catch (SecurityException e) {
                Log.e("IITC-Next", "Location permission missing", e);
            } catch (Exception e) {
                Log.e("IITC-Next", "Error getting location", e);
            }
        });
    }

    private void sendLocationToJs(Location location) {
        String js = String.format(Locale.US, "if (window.onAndroidLocation) window.onAndroidLocation(%f, %f, %f)",
                location.getLatitude(), location.getLongitude(), location.getAccuracy());
        webView.evaluateJavascript(js, null);
    }
}
