package world.homans.iitcnext;

import android.Manifest;
import android.annotation.SuppressLint;
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
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.json.JSONObject;

public class IITCNativeInterface {
    public static final int LOCATION_PERMISSION_REQUEST_CODE = 1234;
    private static final String LOG_TAG = "IITC-Next";
    private static final int GEOLOCATION_PERMISSION_DENIED = 1;
    private static final int GEOLOCATION_POSITION_UNAVAILABLE = 2;

    private final WebView webView;
    private final MainActivity activity;
    private final LocationManager locationManager;
    private final IITCNativeHttpClient nativeHttpClient;
    private boolean pendingLocationRequest;

    public IITCNativeInterface(WebView webView, MainActivity activity) {
        this.webView = webView;
        this.activity = activity;
        this.locationManager = (LocationManager) webView.getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
        this.nativeHttpClient = new IITCNativeHttpClient(webView);
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
    @SuppressWarnings("unused")
    public void log(String msg) {
        Log.i(LOG_TAG, "JS Log: " + msg);
    }

    @JavascriptInterface
    @SuppressWarnings("unused")
    public void diag(String data) {
        Log.d(LOG_TAG, "JS Diag: " + data);
    }

    @JavascriptInterface
    @SuppressWarnings("unused")
    public void hideStartupSplash() {
        // Compatibility shim for older injected bootstrap code.
    }

    @JavascriptInterface
    @SuppressWarnings("unused")
    public void xmlHttpRequest(String requestJson) {
        nativeHttpClient.request(requestJson);
    }

    @JavascriptInterface
    @SuppressWarnings("unused")
    public void abortXmlHttpRequest(String id) {
        nativeHttpClient.abort(id);
    }

    @JavascriptInterface
    @SuppressWarnings("unused")
    public void getCurrentPosition() {
        webView.post(() -> {
            if (!hasLocationPermission()) {
                requestLocationPermission();
                return;
            }
            requestCurrentPosition();
        });
    }

    public void onRequestPermissionsResult(int requestCode) {
        if (requestCode != LOCATION_PERMISSION_REQUEST_CODE || !pendingLocationRequest) return;

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
            // Return a cached fix immediately when possible, then ask Android for one fresh provider update.
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
                @Override public void onStatusChanged(@NonNull String provider, int status, @NonNull Bundle extras) {}
                @Override public void onProviderEnabled(@NonNull String provider) {}
                @Override public void onProviderDisabled(@NonNull String provider) {
                    sendLocationErrorToJs(
                        GEOLOCATION_POSITION_UNAVAILABLE,
                        "Location provider is disabled"
                    );
                }
            }, null);
        } catch (SecurityException e) {
            Log.e(LOG_TAG, "Location permission missing", e);
            sendLocationErrorToJs(GEOLOCATION_PERMISSION_DENIED, "Location permission is missing");
        } catch (Exception e) {
            Log.e(LOG_TAG, "Error getting location", e);
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

    @SuppressLint("MissingPermission")
    private Location getLastKnownLocation(String provider) {
        try {
            if (!hasLocationPermission()) return null;
            if (LocationManager.GPS_PROVIDER.equals(provider) && !hasFineLocationPermission()) return null;
            if (!LocationManager.PASSIVE_PROVIDER.equals(provider) && !locationManager.isProviderEnabled(provider)) {
                return null;
            }
            return locationManager.getLastKnownLocation(provider);
        } catch (Exception e) {
            Log.d(LOG_TAG, "Could not read last known location from " + provider, e);
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
    @SuppressWarnings("unused")
    public void saveFile(String content, String filename, String mimeType) {
        webView.post(() -> {
            try {
                File cachePath = new File(webView.getContext().getCacheDir(), "exports");
                if (!cachePath.isDirectory() && !cachePath.mkdirs()) {
                    throw new IllegalStateException("Could not create export directory");
                }
                String safeFilename = getSafeExportFileName(filename);
                File file = new File(cachePath, safeFilename);
                try (FileOutputStream stream = new FileOutputStream(file)) {
                    stream.write(content.getBytes(StandardCharsets.UTF_8));
                }

                Uri contentUri = FileProvider.getUriForFile(webView.getContext(),
                        webView.getContext().getPackageName() + ".fileprovider", file);

                if (contentUri != null) {
                    Intent shareIntent = new Intent();
                    shareIntent.setAction(Intent.ACTION_SEND);
                    shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                    shareIntent.setType(mimeType);

                    webView.getContext().startActivity(Intent.createChooser(shareIntent, "Save/Share " + safeFilename));
                }
            } catch (Exception e) {
                Log.e(LOG_TAG, "Error saving/sharing file", e);
            }
        });
    }

    private String getSafeExportFileName(String filename) {
        if (filename == null || filename.trim().isEmpty()) {
            return "iitc-next-export";
        }
        String safeFilename = new File(filename).getName();
        return safeFilename.isEmpty() ? "iitc-next-export" : safeFilename;
    }
}
