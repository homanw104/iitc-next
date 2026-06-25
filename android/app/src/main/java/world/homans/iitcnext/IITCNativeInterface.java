package world.homans.iitcnext;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
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
    public void hideStartupSplash() {
        // Compatibility shim for older injected bootstrap code.
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

    @JavascriptInterface
    public void saveFile(String content, String filename, String mimeType) {
        webView.post(() -> {
            try {
                File cachePath = new File(webView.getContext().getCacheDir(), "exports");
                cachePath.mkdirs();
                File file = new File(cachePath, filename);
                FileOutputStream stream = new FileOutputStream(file);
                stream.write(content.getBytes());
                stream.close();

                Uri contentUri = FileProvider.getUriForFile(webView.getContext(),
                        webView.getContext().getPackageName() + ".fileprovider", file);

                if (contentUri != null) {
                    Intent shareIntent = new Intent();
                    shareIntent.setAction(Intent.ACTION_SEND);
                    shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                    shareIntent.setType(mimeType);

                    webView.getContext().startActivity(Intent.createChooser(shareIntent, "Save/Share " + filename));
                }
            } catch (Exception e) {
                Log.e("IITC-Next", "Error saving/sharing file", e);
            }
        });
    }
}
