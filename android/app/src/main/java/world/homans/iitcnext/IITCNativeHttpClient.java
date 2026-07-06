package world.homans.iitcnext;

import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

final class IITCNativeHttpClient {
    private static final String LOG_TAG = "IITCNativeHttpClient";
    private static final int DEFAULT_TIMEOUT_MS = 15_000;
    private static final int MAX_TIMEOUT_MS = 30_000;
    private static final int MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

    private final WebView webView;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final Map<String, RunningRequest> activeRequests = new ConcurrentHashMap<>();

    IITCNativeHttpClient(WebView webView) {
        this.webView = webView;
    }

    void request(String requestJson) {
        NativeRequest request;
        try {
            request = NativeRequest.fromJson(new JSONObject(requestJson));
            validateRequest(request);
        } catch (Exception e) {
            Log.w(LOG_TAG, "Rejected native HTTP request", e);
            dispatchError(getRequestId(requestJson), "error", e.getMessage());
            return;
        }

        RunningRequest runningRequest = new RunningRequest();
        activeRequests.put(request.id, runningRequest);
        executor.execute(() -> executeRequest(request, runningRequest));
    }

    void abort(String id) {
        if (id == null) return;

        RunningRequest request = activeRequests.remove(id);
        if (request != null) request.cancel();
    }

    private void executeRequest(NativeRequest request, RunningRequest runningRequest) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) request.url.openConnection();
            runningRequest.setConnection(connection);

            connection.setInstanceFollowRedirects(true);
            connection.setRequestMethod(request.method);
            connection.setConnectTimeout(request.timeoutMs);
            connection.setReadTimeout(request.timeoutMs);
            connection.setUseCaches(false);

            for (Iterator<String> keys = request.headers.keys(); keys.hasNext();) {
                String key = keys.next();
                connection.setRequestProperty(key, request.headers.optString(key));
            }

            if (request.body != null && !request.body.isEmpty()) {
                byte[] bodyBytes = request.body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(bodyBytes.length);
                try (OutputStream outputStream = connection.getOutputStream()) {
                    outputStream.write(bodyBytes);
                }
            }

            int status = connection.getResponseCode();
            URL finalUrl = connection.getURL();
            byte[] responseBytes = readResponseBytes(connection, status);
            if (runningRequest.isCancelled()) return;

            JSONObject payload = new JSONObject()
                .put("status", status)
                .put("statusText", connection.getResponseMessage() == null ? "" : connection.getResponseMessage())
                .put("finalUrl", finalUrl == null ? request.url.toString() : finalUrl.toString())
                .put("responseHeaders", formatResponseHeaders(connection.getHeaderFields()))
                .put("mimeType", getMimeType(connection.getContentType()))
                .put("bodyBase64", Base64.encodeToString(responseBytes, Base64.NO_WRAP));

            dispatch(request.id, "load", payload);
        } catch (InterruptedIOException e) {
            if (!runningRequest.isCancelled()) dispatchError(request.id, "timeout", e.getMessage());
        } catch (Exception e) {
            if (!runningRequest.isCancelled()) dispatchError(request.id, "error", e.getMessage());
        } finally {
            activeRequests.remove(request.id, runningRequest);
            if (connection != null) connection.disconnect();
        }
    }

    private byte[] readResponseBytes(HttpURLConnection connection, int status) throws IOException {
        InputStream inputStream = status >= HttpURLConnection.HTTP_BAD_REQUEST
            ? connection.getErrorStream()
            : connection.getInputStream();

        if (inputStream == null) return new byte[0];

        try (InputStream stream = inputStream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16 * 1024];
            int totalBytes = 0;
            int bytesRead;
            while ((bytesRead = stream.read(buffer)) != -1) {
                totalBytes += bytesRead;
                if (totalBytes > MAX_RESPONSE_BYTES) {
                    throw new IOException("Native HTTP response is too large");
                }
                output.write(buffer, 0, bytesRead);
            }
            return output.toByteArray();
        }
    }

    private void validateRequest(NativeRequest request) {
        if (request.id.isEmpty()) throw new IllegalArgumentException("Missing request id");
        if (!"GET".equals(request.method) && !"POST".equals(request.method)) {
            throw new IllegalArgumentException("Unsupported request method");
        }
        if (!"https".equalsIgnoreCase(request.url.getProtocol())) {
            throw new IllegalArgumentException("Only HTTPS requests are allowed");
        }

        String host = request.url.getHost();
        if (host == null || !isAllowedHost(host.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("Host is not allowed");
        }
    }

    private boolean isAllowedHost(String host) {
        // Keep the native bridge scoped to hosts already declared in the userscript @connect metadata.
        return host.equals("tm.amap.com")
            || host.equals("google.com")
            || host.endsWith(".google.com")
            || host.equals("googleapis.com")
            || host.endsWith(".googleapis.com");
    }

    private void dispatchError(String id, String eventName, String message) {
        if (id == null || id.isEmpty()) return;

        try {
            JSONObject payload = new JSONObject()
                .put("status", 0)
                .put("statusText", message == null ? "" : message)
                .put("finalUrl", "")
                .put("responseHeaders", "")
                .put("mimeType", "")
                .put("bodyBase64", "");
            dispatch(id, eventName, payload);
        } catch (Exception e) {
            Log.w(LOG_TAG, "Could not dispatch native HTTP error", e);
        }
    }

    private void dispatch(String id, String eventName, JSONObject payload) {
        String js = "window.IITC_NEXT_NATIVE_XHR_RESPONSE && window.IITC_NEXT_NATIVE_XHR_RESPONSE("
            + JSONObject.quote(id) + ","
            + JSONObject.quote(eventName) + ","
            + payload
            + ")";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private String formatResponseHeaders(Map<String, List<String>> headers) {
        StringBuilder builder = new StringBuilder();
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            String name = entry.getKey();
            if (name == null) continue;
            for (String value : entry.getValue()) {
                builder.append(name).append(": ").append(value).append("\r\n");
            }
        }
        return builder.toString();
    }

    private String getMimeType(String contentType) {
        if (contentType == null) return "";
        int separatorIndex = contentType.indexOf(';');
        return separatorIndex >= 0 ? contentType.substring(0, separatorIndex).trim() : contentType.trim();
    }

    private String getRequestId(String requestJson) {
        try {
            return new JSONObject(requestJson).optString("id", "");
        } catch (Exception ignored) {
            return "";
        }
    }

    private static final class NativeRequest {
        final String id;
        final String method;
        final URL url;
        final JSONObject headers;
        final String body;
        final int timeoutMs;

        private NativeRequest(String id, String method, URL url, JSONObject headers, String body, int timeoutMs) {
            this.id = id;
            this.method = method;
            this.url = url;
            this.headers = headers;
            this.body = body;
            this.timeoutMs = timeoutMs;
        }

        static NativeRequest fromJson(JSONObject json) throws Exception {
            int requestedTimeoutMs = json.optInt("timeout", DEFAULT_TIMEOUT_MS);
            int timeoutMs = requestedTimeoutMs > 0
                ? Math.min(requestedTimeoutMs, MAX_TIMEOUT_MS)
                : DEFAULT_TIMEOUT_MS;
            JSONObject headers = json.optJSONObject("headers");
            String body = json.has("data") && !json.isNull("data") ? json.optString("data") : null;

            return new NativeRequest(
                json.optString("id", ""),
                json.optString("method", "GET").toUpperCase(Locale.ROOT),
                new URL(json.optString("url", "")),
                headers == null ? new JSONObject() : headers,
                body,
                timeoutMs
            );
        }
    }

    private static final class RunningRequest {
        private final AtomicBoolean cancelled = new AtomicBoolean(false);
        private volatile HttpURLConnection connection;

        void setConnection(HttpURLConnection connection) {
            this.connection = connection;
            if (cancelled.get()) connection.disconnect();
        }

        void cancel() {
            cancelled.set(true);
            HttpURLConnection currentConnection = connection;
            if (currentConnection != null) currentConnection.disconnect();
        }

        boolean isCancelled() {
            return cancelled.get();
        }
    }
}
