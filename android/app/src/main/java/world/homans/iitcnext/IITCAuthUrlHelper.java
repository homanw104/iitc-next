package world.homans.iitcnext;

import android.net.Uri;
import java.util.regex.Pattern;

public final class IITCAuthUrlHelper {
    private static final Pattern GOOGLE_HOSTNAME_PATTERN = Pattern.compile("(^|\\.)google(\\.com|\\.co)?\\.\\w+$");

    private IITCAuthUrlHelper() {
    }

    public static boolean isIntelHost(Uri uri) {
        String host = getNormalizedHost(uri);
        return "intel.ingress.com".equals(host);
    }

    public static boolean isIntelSignInHandler(Uri uri) {
        return isIntelHost(uri) && uri.getPath() != null && uri.getPath().startsWith("/signinhandler");
    }

    public static boolean isAllowedAuthHost(Uri uri) {
        String host = getNormalizedHost(uri);
        if (host == null) return false;

        return isIntelHost(uri)
            || host.equals("ingress.com")
            || host.endsWith(".ingress.com")
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

    public static String getGoogleRedirectTarget(Uri uri) {
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
        return host == null ? null : host.toLowerCase();
    }
}
