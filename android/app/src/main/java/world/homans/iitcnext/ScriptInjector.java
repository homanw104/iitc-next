package world.homans.iitcnext;

import android.content.Context;
import android.util.Log;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

public class ScriptInjector {
    private static final String LOG_TAG = "IITC-Next";
    private static final String USER_SCRIPT_ASSET_PATH = "public/iitc-next.user.js";
    private static final Pattern METADATA_BLOCK_PATTERN = Pattern.compile("// ==UserScript==[\\s\\S]*?// ==/UserScript==");
    private static final Pattern REQUIRE_PATTERN = Pattern.compile("//\\s+@require\\s+(\\S+)");
    private static final Pattern RESOURCE_PATTERN = Pattern.compile("//\\s+@resource\\s+(\\S+)\\s+(\\S+)");

    private String scriptVersion = BuildConfig.VERSION_NAME;
    private String scriptName = "iitc-next";

    private final List<String> requireUrls = new ArrayList<>();
    private final Map<String, String> resourceUrls = new LinkedHashMap<>();
    private String userScript;

    public void loadUserScript(Context context) {
        try (
            InputStream is = context.getAssets().open(USER_SCRIPT_ASSET_PATH);
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))
        ) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            userScript = sb.toString();

            parseMetadata(userScript);
        } catch (Exception e) {
            Log.e(LOG_TAG, "Error loading userscript from assets", e);
        }
    }

    private void parseMetadata(String script) {
        if (script == null) return;

        requireUrls.clear();
        resourceUrls.clear();

        Matcher blockMatcher = METADATA_BLOCK_PATTERN.matcher(script);
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
        Matcher matcher = REQUIRE_PATTERN.matcher(metadata);
        while (matcher.find()) {
            String value = matcher.group(1);
            if (value != null) requireUrls.add(value.trim());
        }
    }

    private void collectResources(String metadata) {
        Matcher matcher = RESOURCE_PATTERN.matcher(metadata);
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

    private String getNativeXmlHttpRequestShimJs() {
        // The bundled userscript snapshots GM_xmlhttpRequest during module startup, so install this before injecting it.
        return
            "  function installNativeXmlHttpRequest() { " +
            "    if (!window.IITC_Native || typeof window.IITC_Native.xmlHttpRequest !== 'function') return; " +
            "    var nextNativeXhrId = 1; " +
            "    var nativeXhrCallbacks = {}; " +
            "    function getHeadersObject(headers) { " +
            "      var result = {}; " +
            "      if (!headers || typeof headers !== 'object') return result; " +
            "      Object.keys(headers).forEach(function(key) { " +
            "        var value = headers[key]; " +
            "        if (value != null) result[key] = String(value); " +
            "      }); " +
            "      return result; " +
            "    } " +
            "    function base64ToBytes(base64) { " +
            "      var binary = window.atob(base64 || ''); " +
            "      var bytes = new Uint8Array(binary.length); " +
            "      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); " +
            "      return bytes; " +
            "    } " +
            "    function bytesToText(bytes) { " +
            "      if (window.TextDecoder) return new TextDecoder('utf-8').decode(bytes); " +
            "      var text = ''; " +
            "      for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]); " +
            "      return text; " +
            "    } " +
            "    function createResponse(details, payload) { " +
            "      var bytes = base64ToBytes(payload.bodyBase64); " +
            "      var responseType = String(details.responseType || '').toLowerCase(); " +
            "      var responseText = responseType === 'blob' || responseType === 'arraybuffer' ? '' : bytesToText(bytes); " +
            "      var response = responseText; " +
            "      if (responseType === 'blob') response = new Blob([bytes], { type: payload.mimeType || '' }); " +
            "      if (responseType === 'arraybuffer') response = bytes.buffer; " +
            "      if (responseType === 'json') response = responseText ? JSON.parse(responseText) : null; " +
            "      return { " +
            "        finalUrl: payload.finalUrl || details.url || '', " +
            "        readyState: 4, " +
            "        response: response, " +
            "        responseHeaders: payload.responseHeaders || '', " +
            "        responseText: responseText, " +
            "        status: payload.status || 0, " +
            "        statusText: payload.statusText || '' " +
            "      }; " +
            "    } " +
            "    window.IITC_NEXT_NATIVE_XHR_RESPONSE = function(id, eventName, payload) { " +
            "      var details = nativeXhrCallbacks[id]; " +
            "      if (!details) return; " +
            "      delete nativeXhrCallbacks[id]; " +
            "      try { " +
            "        var response = createResponse(details, payload || {}); " +
            "        if (eventName === 'load' && typeof details.onload === 'function') details.onload(response); " +
            "        if (eventName === 'timeout' && typeof details.ontimeout === 'function') details.ontimeout(response); " +
            "        if (eventName === 'error' && typeof details.onerror === 'function') details.onerror(response); " +
            "      } catch (e) { " +
            "        if (typeof details.onerror === 'function') details.onerror({ status: 0, statusText: String(e), responseText: '' }); " +
            "      } " +
            "    }; " +
            "    window.GM_xmlhttpRequest = window.GM_xmlhttpRequest || function(details) { " +
            "      details = details || {}; " +
            "      var id = 'native-xhr-' + (nextNativeXhrId++); " +
            "      nativeXhrCallbacks[id] = details; " +
            "      try { " +
            "        window.IITC_Native.xmlHttpRequest(JSON.stringify({ " +
            "          id: id, " +
            "          method: details.method || 'GET', " +
            "          url: String(details.url || ''), " +
            "          responseType: details.responseType || '', " +
            "          timeout: Number(details.timeout) || 0, " +
            "          headers: getHeadersObject(details.headers), " +
            "          data: typeof details.data === 'string' ? details.data : undefined " +
            "        })); " +
            "      } catch (e) { " +
            "        delete nativeXhrCallbacks[id]; " +
            "        window.setTimeout(function() { " +
            "          if (typeof details.onerror === 'function') details.onerror({ status: 0, statusText: String(e), responseText: '' }); " +
            "        }, 0); " +
            "      } " +
            "      return { " +
            "        abort: function() { " +
            "          if (!nativeXhrCallbacks[id]) return; " +
            "          delete nativeXhrCallbacks[id]; " +
            "          try { window.IITC_Native.abortXmlHttpRequest(id); } catch (e) {} " +
            "          if (typeof details.onabort === 'function') details.onabort({ status: 0, statusText: 'abort', responseText: '' }); " +
            "        } " +
            "      }; " +
            "    }; " +
            "    window.GM = window.GM || {}; " +
            "    window.GM.xmlHttpRequest = window.GM.xmlHttpRequest || window.GM_xmlhttpRequest; " +
            "  } " +
            "  installNativeXmlHttpRequest(); ";
    }

    private String getInjectionBootstrapJs() {
        return
            "  if (window.IITC_NEXT_INJECTED) return; " +
            "  if (window.IITC_NEXT_INJECTING) return; " +
            "  window.IITC_NEXT_INJECTING = true; " +
            "  window.unsafeWindow = window; ";
    }

    private String getAndroidGeolocationShimJs() {
        return
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
            "  } ";
    }

    private String getUserscriptRuntimeShimJs(
        String resourceUrlsLiteral,
        String cesiumBaseUrlLiteral,
        String scriptNameLiteral,
        String scriptVersionLiteral
    ) {
        return
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
            "  }); ";
    }

    private String getDependencyLoaderJs(String requireUrlsLiteral, String userScriptLiteral) {
        return
            "  var requires = " + requireUrlsLiteral + "; " +
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
            "  loadRequire(0); ";
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
            getInjectionBootstrapJs() +
            getAndroidGeolocationShimJs() +
            getNativeXmlHttpRequestShimJs() +
            getUserscriptRuntimeShimJs(resourceUrlsLiteral, cesiumBaseUrlLiteral, scriptNameLiteral, scriptVersionLiteral) +
            getDependencyLoaderJs(requireUrlsLiteral, userScriptLiteral) +
            "} catch(e) { " +
            "  window.IITC_NEXT_INJECTING = false; " +
            "  console.error('IITC-Next injection error:', e); " +
            "} " +
            "})();";
    }
}
