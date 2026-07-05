package world.homans.iitcnext;

import android.content.Context;
import android.util.Log;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

public class ScriptInjector {
    private String scriptVersion = BuildConfig.VERSION_NAME;
    private String scriptName = "iitc-next";

    private final List<String> requireUrls = new ArrayList<>();
    private final Map<String, String> resourceUrls = new LinkedHashMap<>();
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

        requireUrls.clear();
        resourceUrls.clear();

        // Match the metadata block
        Pattern blockPattern = Pattern.compile("// ==UserScript==[\\s\\S]*?// ==/UserScript==");
        Matcher blockMatcher = blockPattern.matcher(script);
        if (blockMatcher.find()) {
            String metadata = blockMatcher.group();

            String name = findTagValue(metadata, "@name");
            if (name != null) scriptName = name;

            String version = findTagValue(metadata, "@version");
            if (version != null) scriptVersion = version;

            collectRequires(metadata);
            collectResources(metadata);
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

    private void collectRequires(String metadata) {
        Pattern pattern = Pattern.compile("//\\s+@require\\s+(\\S+)");
        Matcher matcher = pattern.matcher(metadata);
        while (matcher.find()) {
            String value = matcher.group(1);
            if (value != null) requireUrls.add(value.trim());
        }
    }

    private void collectResources(String metadata) {
        Pattern pattern = Pattern.compile("//\\s+@resource\\s+(\\S+)\\s+(\\S+)");
        Matcher matcher = pattern.matcher(metadata);
        while (matcher.find()) {
            String name = matcher.group(1);
            String url = matcher.group(2);
            if (name != null && url != null) resourceUrls.put(name.trim(), url.trim());
        }
    }

    private String findCesiumBaseUrl() {
        for (String requireUrl : requireUrls) {
            int cesiumJsIndex = requireUrl.lastIndexOf("/Cesium.js");
            if (cesiumJsIndex >= 0) return requireUrl.substring(0, cesiumJsIndex + 1);
        }
        return "https://cdn.jsdelivr.net/npm/cesium@1.142.0/Build/Cesium/";
    }

    private String toJsonArray(List<String> values) {
        StringBuilder builder = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) builder.append(",");
            builder.append(JSONObject.quote(values.get(i)));
        }
        builder.append("]");
        return builder.toString();
    }

    private String toJsonObject(Map<String, String> values) {
        StringBuilder builder = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> entry : values.entrySet()) {
            if (!first) builder.append(",");
            first = false;
            builder
                .append(JSONObject.quote(entry.getKey()))
                .append(":")
                .append(JSONObject.quote(entry.getValue()));
        }
        builder.append("}");
        return builder.toString();
    }

    public String getInjectionJs() {
        if (userScript == null) return "";

        String requireUrlsLiteral = toJsonArray(requireUrls);
        String resourceUrlsLiteral = toJsonObject(resourceUrls);
        String cesiumBaseUrlLiteral = JSONObject.quote(findCesiumBaseUrl());
        String scriptNameLiteral = JSONObject.quote(scriptName);
        String scriptVersionLiteral = JSONObject.quote(scriptVersion);
        String userScriptLiteral = JSONObject.quote(userScript);

        return "javascript:(function() { " +
            "try { " +
            "  if (window.IITC_NEXT_INJECTED) return; " +
            "  if (window.IITC_NEXT_INJECTING) return; " +
            "  window.IITC_NEXT_INJECTING = true; " +
            "  window.unsafeWindow = window; " +

            "  if (window.IITC_Native) { " +
            "    window.navigator.geolocation.getCurrentPosition = function(success, error) { " +
            "      window.onAndroidLocation = function(lat, lng, acc) { " +
            "        success({ coords: { latitude: lat, longitude: lng, accuracy: acc }, timestamp: Date.now() }); " +
            "      }; " +
            "      window.onAndroidLocationError = function(code, message) { " +
            "        if (typeof error === 'function') { " +
            "          error({ code: code, message: message }); " +
            "        } else { " +
            "          console.warn('IITC-Next: location unavailable:', message); " +
            "        } " +
            "      }; " +
            "      window.IITC_Native.getCurrentPosition(); " +
            "    }; " +
            "  } " +

            "  var requires = " + requireUrlsLiteral + "; " +
            "  var resources = " + resourceUrlsLiteral + "; " +
            "  var head = document.head || document.documentElement; " +
            "  window.CESIUM_BASE_URL = " + cesiumBaseUrlLiteral + "; " +
            "  window.GM_info = { script: { name: " + scriptNameLiteral + ", version: " + scriptVersionLiteral + " } }; " +
            "  window.GM_addStyle = window.GM_addStyle || function(css) { " +
            "    var style = document.createElement('style'); " +
            "    style.type = 'text/css'; " +
            "    style.textContent = css || ''; " +
            "    head.appendChild(style); " +
            "    return style; " +
            "  }; " +
            "  window.GM_getResourceText = window.GM_getResourceText || function(name) { return ''; }; " +
            "  Object.keys(resources).forEach(function(name) { " +
            "    var url = resources[name]; " +
            "    if (/\\.css(?:[?#].*)?$/i.test(url)) { " +
            "      var link = document.createElement('link'); " +
            "      link.rel = 'stylesheet'; " +
            "      link.href = url; " +
            "      link.setAttribute('data-iitc-next-resource', name); " +
            "      head.appendChild(link); " +
            "    } " +
            "  }); " +
            "  function fail(message, detail) { " +
            "    window.IITC_NEXT_INJECTING = false; " +
            "    console.error(message, detail || ''); " +
            "  } " +
            "  function addScript(src, cb) { " +
            "    var s = document.createElement('script'); " +
            "    var done = false; " +
            "    var timeout = window.setTimeout(function() { " +
            "      if (done) return; " +
            "      done = true; " +
            "      fail('IITC-Next: Timed out loading dependency:', src); " +
            "    }, 15000); " +
            "    s.type = 'text/javascript'; s.src = src; " +
            "    s.onload = function() { " +
            "      if (done) return; " +
            "      done = true; " +
            "      window.clearTimeout(timeout); " +
            "      if (cb) cb(); " +
            "    }; " +
            "    s.onerror = function() { " +
            "      if (done) return; " +
            "      done = true; " +
            "      window.clearTimeout(timeout); " +
            "      fail('IITC-Next: Failed to load dependency:', src); " +
            "    }; " +
            "    head.appendChild(s); " +
            "  } " +
            "  function loadRequire(index) { " +
            "    if (index >= requires.length) { injectUserScript(); return; } " +
            "    addScript(requires[index], function() { loadRequire(index + 1); }); " +
            "  } " +
            "  function injectUserScript() { " +
            "    var s = document.createElement('script'); " +
            "    s.type = 'text/javascript'; " +
            "    s.textContent = " + userScriptLiteral + "; " +
            "    head.appendChild(s); " +
            "    window.IITC_NEXT_INJECTED = true; " +
            "    window.IITC_NEXT_INJECTING = false; " +
            "  } " +
            "  loadRequire(0); " +
            "} catch(e) { " +
            "  window.IITC_NEXT_INJECTING = false; " +
            "  console.error('IITC-Next injection error:', e); " +
            "} " +
            "})();";
    }
}
