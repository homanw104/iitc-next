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
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Locale;
import org.json.JSONObject;

public class IITCNativeInterface {
    public static final int LOCATION_PERMISSION_REQUEST_CODE = 1234;
    private static final int GEOLOCATION_PERMISSION_DENIED = 1;
    private static final int GEOLOCATION_POSITION_UNAVAILABLE = 2;

    private final WebView webView;
    private final MainActivity activity;
    private final LocationManager locationManager;
    private boolean pendingLocationRequest;

    public IITCNativeInterface(WebView webView, MainActivity activity) {
        this.webView = webView;
        this.activity = activity;
        this.locationManager = (LocationManager) webView.getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
    }

    private boolean hasLocationPermission() {
        return hasFineLocationPermission() || hasCoarseLocationPermission();
    }

    private boolean hasFineLocationPermission() {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasCoarseLocationPermission() {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
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
            if (!hasLocationPermission()) {
                requestLocationPermission();
                return;
            }
            requestCurrentPosition();
        });
    }

    public boolean onRequestPermissionsResult(int requestCode) {
        if (requestCode != LOCATION_PERMISSION_REQUEST_CODE) return false;
        if (!pendingLocationRequest) return true;

        pendingLocationRequest = false;
        webView.post(() -> {
            if (hasLocationPermission()) {
                requestCurrentPosition();
                return;
            }

            sendLocationErrorToJs(
                GEOLOCATION_PERMISSION_DENIED,
                getLocationPermissionDeniedMessage()
            );
        });
        return true;
    }

    private void requestLocationPermission() {
        if (pendingLocationRequest) return;

        pendingLocationRequest = true;
        ActivityCompat.requestPermissions(
            activity,
            new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
            LOCATION_PERMISSION_REQUEST_CODE
        );
    }

    private void requestCurrentPosition() {
        try {
            Location lastKnown = getBestLastKnownLocation();
            if (lastKnown != null) {
                sendLocationToJs(lastKnown);
            }

            String provider = getFreshLocationProvider();
            if (provider == null) {
                if (lastKnown == null) {
                    sendLocationErrorToJs(
                        GEOLOCATION_POSITION_UNAVAILABLE,
                        "No enabled location provider is available"
                    );
                }
                return;
            }

            locationManager.requestSingleUpdate(provider, new LocationListener() {
                @Override public void onLocationChanged(@NonNull Location location) { sendLocationToJs(location); }
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
                @Override public void onProviderEnabled(String provider) {}
                @Override public void onProviderDisabled(String provider) {
                    sendLocationErrorToJs(
                        GEOLOCATION_POSITION_UNAVAILABLE,
                        "Location provider is disabled"
                    );
                }
            }, null);
        } catch (SecurityException e) {
            Log.e("IITC-Next", "Location permission missing", e);
            sendLocationErrorToJs(GEOLOCATION_PERMISSION_DENIED, "Location permission is missing");
        } catch (Exception e) {
            Log.e("IITC-Next", "Error getting location", e);
            sendLocationErrorToJs(GEOLOCATION_POSITION_UNAVAILABLE, "Unable to get current location");
        }
    }

    private Location getBestLastKnownLocation() {
        Location bestLocation = null;
        if (hasFineLocationPermission()) {
            bestLocation = getBetterLocation(bestLocation, getLastKnownLocation(LocationManager.GPS_PROVIDER));
        }
        if (hasLocationPermission()) {
            bestLocation = getBetterLocation(bestLocation, getLastKnownLocation(LocationManager.NETWORK_PROVIDER));
            bestLocation = getBetterLocation(bestLocation, getLastKnownLocation(LocationManager.PASSIVE_PROVIDER));
        }
        return bestLocation;
    }

    private Location getLastKnownLocation(String provider) {
        try {
            if (!LocationManager.PASSIVE_PROVIDER.equals(provider) && !locationManager.isProviderEnabled(provider)) {
                return null;
            }
            return locationManager.getLastKnownLocation(provider);
        } catch (Exception e) {
            Log.d("IITC-Next", "Could not read last known location from " + provider, e);
            return null;
        }
    }

    private Location getBetterLocation(Location current, Location candidate) {
        if (candidate == null) return current;
        if (current == null) return candidate;
        if (!candidate.hasAccuracy()) {
            return !current.hasAccuracy() && candidate.getTime() > current.getTime() ? candidate : current;
        }
        if (!current.hasAccuracy()) return candidate;
        if (candidate.getAccuracy() < current.getAccuracy()) return candidate;
        return candidate.getTime() > current.getTime() && candidate.getAccuracy() <= current.getAccuracy() * 2
            ? candidate
            : current;
    }

    private String getFreshLocationProvider() {
        if (hasFineLocationPermission() && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            return LocationManager.GPS_PROVIDER;
        }
        if (hasLocationPermission() && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            return LocationManager.NETWORK_PROVIDER;
        }
        return null;
    }

    private String getLocationPermissionDeniedMessage() {
        boolean canAskAgain =
            ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.ACCESS_FINE_LOCATION) ||
            ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.ACCESS_COARSE_LOCATION);

        if (canAskAgain) {
            return "Location permission was denied";
        }
        return "Location permission was denied. Enable location access in Android Settings.";
    }

    private void sendLocationToJs(Location location) {
        String js = String.format(Locale.US, "if (window.onAndroidLocation) window.onAndroidLocation(%f, %f, %f)",
                location.getLatitude(), location.getLongitude(), location.getAccuracy());
        webView.evaluateJavascript(js, null);
    }

    private void sendLocationErrorToJs(int code, String message) {
        String js = String.format(
            Locale.US,
            "if (window.onAndroidLocationError) window.onAndroidLocationError(%d, %s)",
            code,
            JSONObject.quote(message)
        );
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
