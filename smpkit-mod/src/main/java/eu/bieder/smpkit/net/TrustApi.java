package eu.bieder.smpkit.net;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import eu.bieder.smpkit.config.SmpKitConfig;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Asynchroner Zugriff auf das Trust-Backend. Alle Aufrufe laufen über den
 * ForkJoinPool von HttpClient und blockieren nie den Client-Thread.
 */
public final class TrustApi {

    private static final Gson GSON = new Gson();
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(4))
            .build();

    private TrustApi() {}

    private static HttpRequest.Builder base(String path) {
        SmpKitConfig cfg = SmpKitConfig.get();
        HttpRequest.Builder b = HttpRequest.newBuilder()
                .uri(URI.create(cfg.baseUrl() + path))
                .timeout(Duration.ofSeconds(6))
                .header("Accept", "application/json");
        if (cfg.apiKey != null && !cfg.apiKey.isBlank()) {
            b.header("X-Api-Key", cfg.apiKey);
        }
        return b;
    }

    private static String enc(String s) {
        return java.net.URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    /** Einzelnen Spieler abfragen. Bei Fehler -> unknown(). */
    public static CompletableFuture<PlayerTrust> getPlayer(String name) {
        HttpRequest req = base("/api/player?name=" + enc(name)).GET().build();
        return HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenApply(r -> {
                    if (r.statusCode() == 200) {
                        try {
                            return GSON.fromJson(r.body(), PlayerTrust.class);
                        } catch (RuntimeException ignored) { }
                    }
                    return PlayerTrust.unknown(name);
                })
                .exceptionally(e -> PlayerTrust.unknown(name));
    }

    /** Batch-Abfrage mehrerer Namen (für nahe Spieler). */
    public static CompletableFuture<Map<String, PlayerTrust>> getPlayers(List<String> names) {
        if (names.isEmpty()) {
            return CompletableFuture.completedFuture(Map.of());
        }
        String joined = String.join(",", names);
        HttpRequest req = base("/api/players?names=" + enc(joined)).GET().build();
        return HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenApply(r -> {
                    Map<String, PlayerTrust> out = new HashMap<>();
                    if (r.statusCode() == 200) {
                        try {
                            JsonObject obj = GSON.fromJson(r.body(), JsonObject.class);
                            for (String key : obj.keySet()) {
                                out.put(key, GSON.fromJson(obj.get(key), PlayerTrust.class));
                            }
                        } catch (RuntimeException ignored) { }
                    }
                    return out;
                })
                .exceptionally(e -> Map.of());
    }

    /** Geteilte Blacklist (geflaggte Spieler) laden. */
    public static CompletableFuture<List<PlayerTrust>> getBlacklist() {
        HttpRequest req = base("/api/blacklist").GET().build();
        return HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenApply(r -> {
                    List<PlayerTrust> out = new ArrayList<>();
                    if (r.statusCode() == 200) {
                        try {
                            JsonObject obj = GSON.fromJson(r.body(), JsonObject.class);
                            obj.getAsJsonArray("players").forEach(el ->
                                    out.add(GSON.fromJson(el, PlayerTrust.class)));
                        } catch (RuntimeException ignored) { }
                    }
                    return out;
                })
                .exceptionally(e -> List.of());
    }

    private static CompletableFuture<ApiResult> postJson(String path, JsonObject body) {
        HttpRequest req = base(path)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8))
                .build();
        return HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenApply(r -> {
                    if (r.statusCode() == 200) {
                        try {
                            JsonObject obj = GSON.fromJson(r.body(), JsonObject.class);
                            PlayerTrust p = obj.has("player")
                                    ? GSON.fromJson(obj.get("player"), PlayerTrust.class) : null;
                            return ApiResult.ok(p);
                        } catch (RuntimeException e) {
                            return ApiResult.ok(null);
                        }
                    }
                    if (r.statusCode() == 429) return ApiResult.error("Rate-Limit erreicht – bitte kurz warten.");
                    if (r.statusCode() == 401) return ApiResult.error("Nicht autorisiert (API-Key?).");
                    String msg = "Backend-Fehler (HTTP " + r.statusCode() + ")";
                    try {
                        JsonObject obj = GSON.fromJson(r.body(), JsonObject.class);
                        if (obj != null && obj.has("error")) msg = obj.get("error").getAsString();
                    } catch (RuntimeException ignored) { }
                    return ApiResult.error(msg);
                })
                .exceptionally(e -> ApiResult.error("Backend nicht erreichbar: " + e.getMessage()));
    }

    public static CompletableFuture<ApiResult> report(String reporterUuid, String reporter,
                                                      String target, String category, String note) {
        JsonObject b = new JsonObject();
        b.addProperty("reporterUuid", reporterUuid);
        b.addProperty("reporter", reporter);
        b.addProperty("target", target);
        b.addProperty("category", category);
        b.addProperty("note", note);
        return postJson("/api/report", b);
    }

    public static CompletableFuture<ApiResult> vouch(String voucherUuid, String voucher, String target) {
        JsonObject b = new JsonObject();
        b.addProperty("voucherUuid", voucherUuid);
        b.addProperty("voucher", voucher);
        b.addProperty("target", target);
        return postJson("/api/vouch", b);
    }

    public static CompletableFuture<ApiResult> unreport(String reporterUuid, String target) {
        JsonObject b = new JsonObject();
        b.addProperty("reporterUuid", reporterUuid);
        b.addProperty("target", target);
        return postJson("/api/unreport", b);
    }

    /** Ergebnis einer Schreib-Aktion. */
    public static final class ApiResult {
        public final boolean success;
        public final String error;
        public final PlayerTrust player;

        private ApiResult(boolean s, String e, PlayerTrust p) {
            this.success = s; this.error = e; this.player = p;
        }
        static ApiResult ok(PlayerTrust p) { return new ApiResult(true, null, p); }
        static ApiResult error(String e) { return new ApiResult(false, e, null); }
    }
}
