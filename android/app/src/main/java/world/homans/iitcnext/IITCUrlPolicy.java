package world.homans.iitcnext;

import android.net.Uri;
import java.util.Locale;
import java.util.regex.Pattern;

public final class IITCUrlPolicy {
    public static final String INTEL_MAP_URL = "https://intel.ingress.com/intel";

    private static final String INTEL_HOST = "intel.ingress.com";
    private static final Pattern GOOGLE_HOSTNAME_PATTERN = Pattern.compile("(^|\\.)google(\\.com|\\.co)?\\.\\w+$");

    private IITCUrlPolicy() {
    }

    public static boolean isIntelHost(Uri uri) {
        return INTEL_HOST.equals(getNormalizedHost(uri));
    }

    public static boolean isIntelSignInHandler(Uri uri) {
        return isIntelHost(uri) && uri.getPath() != null && uri.getPath().startsWith("/signinhandler");
    }

    public static boolean isInjectableIntelPage(Uri uri) {
        if (!isIntelHost(uri)) return false;

        String path = uri.getPath();
        return path == null || (!path.startsWith("/login") && !path.startsWith("/signinhandler"));
    }

    public static boolean shouldStayInAuthWebView(Uri uri) {
        String host = getNormalizedHost(uri);
        if (host == null) return false;

        // This is intentionally narrower than Capacitor's allowNavigation list:
        // only auth/session hosts should remain in the in-app WebView popup.
        return isIntelHost(uri)
            || isGoogleHost(host)
            || host.equals("googleusercontent.com")
            || host.endsWith(".googleusercontent.com")
            || host.equals("gstatic.com")
            || host.endsWith(".gstatic.com")
            || host.equals("googleapis.com")
            || host.endsWith(".googleapis.com")
            || host.equals("appleid.apple.com")
            || host.equals("signin.nianticspatial.com")
            || host.endsWith(".nianticspatial.com")
            || host.equals("nianticlabs.com")
            || host.endsWith(".nianticlabs.com");
    }

    public static String unwrapGoogleRedirect(Uri uri) {
        String host = getNormalizedHost(uri);
        if (host == null || !isGoogleHost(host)) return null;
        if (!"/url".equals(uri.getPath())) return null;
        return uri.getQueryParameter("q");
    }

    private static boolean isGoogleHost(String host) {
        return GOOGLE_HOSTNAME_PATTERN.matcher(host).find()
            || host.equals("youtube.com")
            || host.endsWith(".youtube.com")
            || host.equals("googleusercontent.com")
            || host.endsWith(".googleusercontent.com");
    }

    private static String getNormalizedHost(Uri uri) {
        String host = uri.getHost();
        return host == null ? null : host.toLowerCase(Locale.ROOT);
    }
}
