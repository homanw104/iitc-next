package world.homans.iitcnext;

import android.content.Context;
import android.util.Log;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import org.json.JSONObject;

public class ScriptInjector {
    public static final String CESIUM_JS = "https://cdn.jsdelivr.net/npm/cesium@1.141.0/Build/Cesium/Cesium.js";
    public static final String CESIUM_CSS = "https://cdn.jsdelivr.net/npm/cesium@latest/Build/Cesium/Widgets/widgets.css";
    public static final String SYSTEM_JS = "https://cdn.jsdelivr.net/npm/systemjs@6.15.1/dist/system.min.js";
    public static final String SYSTEM_NAMED_REGISTER = "https://cdn.jsdelivr.net/npm/systemjs@6.15.1/dist/extras/named-register.min.js";

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
        } catch (Exception e) {
            Log.e("IITC-Next", "Error loading userscript from assets", e);
        }
    }

    public String getInjectionJs() {
        if (userScript == null) return "";
        
        return "javascript:(function() { " +
            "try { " +
            "  if (window.IITC_NEXT_INJECTED) return; " +
            "  window.IITC_NEXT_INJECTED = true; " +
            "  console.log('IITC-Next: Starting injection'); " +
            
            "  var l = document.createElement('link'); " +
            "  l.rel = 'stylesheet'; l.href = '" + CESIUM_CSS + "'; " +
            "  (document.head || document.documentElement).appendChild(l); " +
            
            "  function addScript(src, cb) { " +
            "    var s = document.createElement('script'); " +
            "    s.type = 'text/javascript'; s.src = src; " +
            "    if (cb) s.onload = cb; " +
            "    (document.head || document.documentElement).appendChild(s); " +
            "  } " +
            
            "  addScript('" + CESIUM_JS + "'); " +
            "  addScript('" + SYSTEM_JS + "', function() { " +
            "    addScript('" + SYSTEM_NAMED_REGISTER + "', function() { " +
            "      console.log('IITC-Next: Dependencies loaded, waiting for Cesium global'); " +
            "      var checkCesium = setInterval(function() { " +
            "        if (typeof Cesium !== 'undefined') { " +
            "          clearInterval(checkCesium); " +
            "          console.log('IITC-Next: Cesium ready, injecting userscript'); " +
            "          window.CESIUM_BASE_URL = 'https://cdn.jsdelivr.net/npm/cesium@1.141.0/Build/Cesium/'; " +
            "          window.GM_info = { script: { name: 'iitc-next', version: '1.0.0' } }; " +
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
            "        } " +
            "      }, 100); " +
            "    }); " +
            "  }); " +
            "} catch(e) { console.error('IITC-Next Injection Error', e); } " +
            "})();";
    }
}
