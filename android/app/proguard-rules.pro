# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep line numbers for more useful stack traces in Google Play Console
-keepattributes SourceFile,LineNumberTable

# Preserve JavaScript Interface methods
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep our native interfaces used by WebView
-keep class world.homans.iitcnext.IITCNativeInterface { *; }

# Capacitor rules (if not already included by the library)
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }

# Cordova plugins rules
-keep public class * extends org.apache.cordova.* {
    public <methods>;
    public <fields>;
}
