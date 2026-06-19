package world.homans.iitcnext;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

public final class IngressLinkHandler {
    private static final String INGRESS_LINK_HOST = "link.ingress.com";

    private IngressLinkHandler() {
    }

    public static boolean openInApp(MainActivity activity, Uri uri) {
        if (uri == null || !INGRESS_LINK_HOST.equalsIgnoreCase(uri.getHost())) {
            return false;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);

        try {
            activity.startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }
}
