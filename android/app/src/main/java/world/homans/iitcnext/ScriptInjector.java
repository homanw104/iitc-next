package world.homans.iitcnext;

import android.content.Context;
import android.util.Log;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

public class ScriptInjector {
    private String cesiumJs = "https://cdn.jsdelivr.net/npm/cesium@1.142.0/Build/Cesium/Cesium.js";
    private String cesiumCss = "https://cdn.jsdelivr.net/npm/cesium@latest/Build/Cesium/Widgets/widgets.css";
    private String systemJs = "https://cdn.jsdelivr.net/npm/systemjs@6.15.1/dist/system.min.js";
    private String systemNamedRegister = "https://cdn.jsdelivr.net/npm/systemjs@6.15.1/dist/extras/named-register.min.js";
    private String scriptVersion = "1.4.0";
    private String scriptName = "iitc-next";

    private String userScript;

    public void loadUserScript(Context context) {
        try {
            InputStream is = context.getAssets().open("public/iitc-next.user.js");
            BufferedReader reader = new BufferedReader(new InputStreamReader(is));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            userScript = sb.toString();
            reader.close();

            parseMetadata(userScript);
        } catch (Exception e) {
            Log.e("IITC-Next", "Error loading userscript from assets", e);
        }
    }

    private void parseMetadata(String script) {
        if (script == null) return;

        // Match the metadata block
        Pattern blockPattern = Pattern.compile("// ==UserScript==[\\s\\S]*?// ==/UserScript==");
        Matcher blockMatcher = blockPattern.matcher(script);
        if (blockMatcher.find()) {
            String metadata = blockMatcher.group();

            String name = findTagValue(metadata, "@name");
            if (name != null) scriptName = name;

            String version = findTagValue(metadata, "@version");
            if (version != null) scriptVersion = version;

            // For @require, we need to find specific ones
            String cesiumJsMatch = findRequireMatch(metadata, "cesium@.*?/Cesium\\.js");
            if (cesiumJsMatch != null) cesiumJs = cesiumJsMatch;

            String systemJsMatch = findRequireMatch(metadata, "systemjs@.*?/system\\.min\\.js");
            if (systemJsMatch != null) systemJs = systemJsMatch;

            String namedRegisterMatch = findRequireMatch(metadata, "systemjs@.*?/named-register\\.min\\.js");
            if (namedRegisterMatch != null) systemNamedRegister = namedRegisterMatch;

            // For @resource
            String cesiumCssMatch = findResourceMatch(metadata);
            if (cesiumCssMatch != null) cesiumCss = cesiumCssMatch;
        }
    }

    private String findTagValue(String metadata, String tag) {
        Pattern pattern = Pattern.compile("//\\s+" + tag + "\\s+(.*)");
        Matcher matcher = pattern.matcher(metadata);
        if (matcher.find()) {
            String value = matcher.group(1);
            return value != null ? value.trim() : null;
        }
        return null;
    }

    private String findRequireMatch(String metadata, String regex) {
        Pattern pattern = Pattern.compile("//\\s+@require\\s+(.*?" + regex + ")");
        Matcher matcher = pattern.matcher(metadata);
        if (matcher.find()) {
            String value = matcher.group(1);
            return value != null ? value.trim() : null;
        }
        return null;
    }

    private String findResourceMatch(String metadata) {
        Pattern pattern = Pattern.compile("//\\s+@resource\\s+\\S+\\s+(.*?" + "widgets\\.css" + ")");
        Matcher matcher = pattern.matcher(metadata);
        if (matcher.find()) {
            String value = matcher.group(1);
            return value != null ? value.trim() : null;
        }
        return null;
    }

    public String getInjectionJs() {
        if (userScript == null) return "";

        String cesiumBaseUrl = cesiumJs.substring(0, cesiumJs.lastIndexOf("/") + 1);
        String cesiumJsLiteral = JSONObject.quote(cesiumJs);
        String cesiumCssLiteral = JSONObject.quote(cesiumCss);
        String systemJsLiteral = JSONObject.quote(systemJs);
        String systemNamedRegisterLiteral = JSONObject.quote(systemNamedRegister);
        String cesiumBaseUrlLiteral = JSONObject.quote(cesiumBaseUrl);
        String scriptNameLiteral = JSONObject.quote(scriptName);
        String scriptVersionLiteral = JSONObject.quote(scriptVersion);

        return "javascript:(function() { " +
            "try { " +
            "  if (window.IITC_NEXT_INJECTED) return; " +
            "  if (window.IITC_NEXT_INJECTING) return; " +
            "  window.IITC_NEXT_INJECTING = true; " +
            "  window.unsafeWindow = window; " + // Provide unsafeWindow fallback

            "  if (window.IITC_Native) { " +
            "    window.navigator.geolocation.getCurrentPosition = function(success, error) { " +
            "      window.onAndroidLocation = function(lat, lng, acc) { " +
            "        success({ coords: { latitude: lat, longitude: lng, accuracy: acc }, timestamp: Date.now() }); " +
            "      }; " +
            "      window.IITC_Native.getCurrentPosition(); " +
            "    }; " +
            "  } " +

            "  var l = document.createElement('link'); " +
            "  l.rel = 'stylesheet'; l.href = " + cesiumCssLiteral + "; " +
            "  (document.head || document.documentElement).appendChild(l); " +

            "  function addScript(src, cb) { " +
            "    var s = document.createElement('script'); " +
            "    s.type = 'text/javascript'; s.src = src; " +
            "    if (cb) s.onload = cb; " +
            "    s.onerror = function() { " +
            "      window.IITC_NEXT_INJECTING = false; " +
            "      console.error('IITC-Next: Failed to load dependency:', src); " +
            "    }; " +
            "    (document.head || document.documentElement).appendChild(s); " +
            "  } " +

            "  window.CESIUM_BASE_URL = " + cesiumBaseUrlLiteral + "; " +
            "  addScript(" + cesiumJsLiteral + "); " +
            "  addScript(" + systemJsLiteral + ", function() { " +
            "    addScript(" + systemNamedRegisterLiteral + ", function() { " +
            "      var checkCesium = setInterval(function() { " +
            "        if (typeof Cesium !== 'undefined') { " +
            "          clearInterval(checkCesium); " +
            "          window.GM_info = { script: { name: " + scriptNameLiteral + ", version: " + scriptVersionLiteral + " } }; " +
            "          window.GM_addStyle = window.GM_addStyle || function(css) { " +
            "            var style = document.createElement('style'); " +
            "            style.type = 'text/css'; " +
            "            style.innerHTML = css; " +
            "            (document.head || document.documentElement).appendChild(style); " +
            "            return style; " +
            "          }; " +
            "          window.GM_getResourceText = window.GM_getResourceText || function() { return ''; }; " +
            "          var s = document.createElement('script'); " +
            "          s.type = 'text/javascript'; " +
            "          s.textContent = " + JSONObject.quote(userScript) + "; " +
            "          (document.head || document.documentElement).appendChild(s); " +
            "          window.IITC_NEXT_INJECTED = true; " +
            "          window.IITC_NEXT_INJECTING = false; " +
            "        } " +
            "      }, 100); " +
            "      setTimeout(function() { " +
            "        if (!window.IITC_NEXT_INJECTED) { " +
            "          clearInterval(checkCesium); " +
            "          window.IITC_NEXT_INJECTING = false; " +
            "          console.error('IITC-Next: Timed out waiting for Cesium'); " +
            "        } " +
            "      }, 15000); " +
            "    }); " +
            "  }); " +
            "} catch(e) { " +
            "  window.IITC_NEXT_INJECTING = false; " +
            "  console.error('IITC-Next injection error:', e); " +
            "} " +
            "})();";
    }
}
