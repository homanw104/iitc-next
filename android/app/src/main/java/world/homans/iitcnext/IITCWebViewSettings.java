package world.homans.iitcnext;

import android.content.Context;
import android.os.Build;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.webkit.UserAgentMetadata;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import java.util.Arrays;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class IITCWebViewSettings {
    private static final String LOG_TAG = "IITCWebViewSettings";
    private static final Pattern CHROME_VERSION_PATTERN = Pattern.compile("Chrome/(\\d+(?:\\.\\d+){1,3})");
    private static final Pattern ZERO_CHROME_VERSION_PATTERN = Pattern.compile("^(\\d+)\\.0\\.0\\.0$");

    private IITCWebViewSettings() {
    }

    public static void configureAuthIdentity(Context context, WebSettings settings) {
        String userAgent = getBrowserUserAgent(context);
        settings.setUserAgentString(userAgent);
        configureUserAgentMetadata(settings, userAgent);
    }

    public static String getBrowserUserAgent(Context context) {
        String defaultUA = WebSettings.getDefaultUserAgent(context);

        // Some Android WebViews report Chrome/N.0.0.0; Google auth rejects that shape on some devices.
        String chromeVersion = sanitizeChromeVersion(extractChromeVersion(defaultUA));
        String androidVersion = cleanUserAgentToken(Build.VERSION.RELEASE);
        String deviceModel = cleanUserAgentToken(Build.MODEL);

        if (chromeVersion.isEmpty() || androidVersion.isEmpty() || deviceModel.isEmpty()) {
            return defaultUA.replaceAll("Version/\\d+\\.\\d+\\s?", "").replaceAll(";\\s?wv", "");
        }

        return "Mozilla/5.0 (Linux; Android " + androidVersion + "; " + deviceModel + ") "
            + "AppleWebKit/537.36 (KHTML, like Gecko) "
            + "Chrome/" + chromeVersion + " Mobile Safari/537.36 IITCNext/" + BuildConfig.VERSION_NAME;
    }

    public static void configureNianticCookies(WebView webView) {
        try {
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);
            cookieManager.setCookie("https://signin.nianticspatial.com", "_ncc=0; Path=/; Domain=.nianticspatial.com");
            cookieManager.setCookie("https://nianticlabs.com", "_ncc=0; Path=/; Domain=.nianticlabs.com");
        } catch (Exception e) {
            Log.w(LOG_TAG, "Could not configure auth cookies: " + e.getMessage());
        }
    }

    private static void configureUserAgentMetadata(WebSettings settings, String userAgent) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) return;

        // Google reads UA Client Hints as well as the legacy UA string, so keep both in sync.
        String chromeVersion = extractChromeVersion(userAgent);
        if (chromeVersion.isEmpty()) return;

        String chromeMajorVersion = chromeVersion.split("\\.")[0];
        String androidVersion = cleanUserAgentToken(Build.VERSION.RELEASE);
        String deviceModel = cleanUserAgentToken(Build.MODEL);

        try {
            UserAgentMetadata.BrandVersion chromium = createBrandVersion("Chromium", chromeMajorVersion, chromeVersion);
            UserAgentMetadata.BrandVersion chrome = createBrandVersion("Google Chrome", chromeMajorVersion, chromeVersion);
            UserAgentMetadata metadata = new UserAgentMetadata.Builder()
                .setBrandVersionList(Arrays.asList(chromium, chrome))
                .setFullVersion(chromeVersion)
                .setPlatform("Android")
                .setPlatformVersion(androidVersion)
                .setArchitecture(Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : null)
                .setModel(deviceModel)
                .setMobile(true)
                .build();
            WebSettingsCompat.setUserAgentMetadata(settings, metadata);
        } catch (Exception e) {
            Log.w(LOG_TAG, "Could not configure user-agent metadata: " + e.getMessage());
        }
    }

    private static UserAgentMetadata.BrandVersion createBrandVersion(String brand, String majorVersion, String fullVersion) {
        return new UserAgentMetadata.BrandVersion.Builder()
            .setBrand(brand)
            .setMajorVersion(majorVersion)
            .setFullVersion(fullVersion)
            .build();
    }

    private static String extractChromeVersion(String userAgent) {
        Matcher matcher = CHROME_VERSION_PATTERN.matcher(userAgent);
        return matcher.find() ? matcher.group(1) : "";
    }

    private static String sanitizeChromeVersion(String chromeVersion) {
        Matcher matcher = ZERO_CHROME_VERSION_PATTERN.matcher(chromeVersion);
        return matcher.find() ? matcher.group(1) + ".0.0.1" : chromeVersion;
    }

    private static String cleanUserAgentToken(String token) {
        if (token == null) return "";
        return token.replaceAll("[;()]+", " ").replaceAll("\\s+", " ").trim();
    }
}
