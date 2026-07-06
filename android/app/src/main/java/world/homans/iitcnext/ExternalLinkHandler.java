package world.homans.iitcnext;

import android.content.Intent;
import android.net.Uri;
import androidx.browser.customtabs.CustomTabsIntent;

public final class ExternalLinkHandler {
    private ExternalLinkHandler() {
    }

    public static void open(MainActivity activity, Uri uri) {
        if (uri == null) return;

        try {
            CustomTabsIntent.Builder builder = new CustomTabsIntent.Builder();
            CustomTabsIntent customTabsIntent = builder.build();
            customTabsIntent.launchUrl(activity, uri);
        } catch (Exception e) {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            activity.startActivity(intent);
        }
    }
}
