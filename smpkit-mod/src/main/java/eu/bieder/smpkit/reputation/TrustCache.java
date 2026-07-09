package eu.bieder.smpkit.reputation;

import eu.bieder.smpkit.net.PlayerTrust;
import eu.bieder.smpkit.net.TrustApi;

import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Hält Trust-Werte clientseitig zwischen, damit der HUD nicht bei jedem Frame
 * das Backend anfragt. Einträge verfallen nach TTL. Zusätzlich wird die
 * geteilte Blacklist als Namens-Set gepflegt (für die Nähe-Warnung).
 */
public final class TrustCache {

    private static final long TTL_MS = 60_000;         // Einzelwerte 1 Min gültig
    private static final long INFLIGHT_MS = 5_000;     // Doppelanfragen dämpfen

    private record Entry(PlayerTrust value, long fetchedAt) {}

    private static final Map<String, Entry> CACHE = new ConcurrentHashMap<>();
    private static final Map<String, Long> INFLIGHT = new ConcurrentHashMap<>();
    private static volatile Set<String> blacklist = Set.of();
    private static volatile long blacklistFetched = 0;

    private TrustCache() {}

    private static String key(String name) {
        return name.toLowerCase(Locale.ROOT);
    }

    /** Aktuellen Wert zurückgeben (oder null). Löst bei Bedarf ein Nachladen aus. */
    public static PlayerTrust peek(String name) {
        Entry e = CACHE.get(key(name));
        long now = System.currentTimeMillis();
        if (e == null || now - e.fetchedAt > TTL_MS) {
            requestRefresh(name);
        }
        return e == null ? null : e.value;
    }

    /** Nachladen anstoßen, aber nicht öfter als INFLIGHT_MS pro Spieler. */
    public static void requestRefresh(String name) {
        String k = key(name);
        long now = System.currentTimeMillis();
        Long last = INFLIGHT.get(k);
        if (last != null && now - last < INFLIGHT_MS) return;
        INFLIGHT.put(k, now);
        TrustApi.getPlayer(name).thenAccept(pt -> put(name, pt));
    }

    public static void put(String name, PlayerTrust pt) {
        if (pt == null) return;
        CACHE.put(key(name), new Entry(pt, System.currentTimeMillis()));
    }

    public static void putAll(Map<String, PlayerTrust> map) {
        map.forEach(TrustCache::put);
    }

    /** Sofort ungültig machen (nach eigenem Report/Vouch). */
    public static void invalidate(String name) {
        CACHE.remove(key(name));
        INFLIGHT.remove(key(name));
    }

    // --- Blacklist ---
    public static boolean isFlagged(String name) {
        return blacklist.contains(key(name));
    }

    public static Set<String> blacklist() {
        return blacklist;
    }

    /** Blacklist höchstens alle 5 Minuten neu vom Backend holen. */
    public static void refreshBlacklistIfStale() {
        long now = System.currentTimeMillis();
        if (now - blacklistFetched < 300_000) return;
        blacklistFetched = now;
        TrustApi.getBlacklist().thenAccept(list -> {
            Set<String> set = ConcurrentHashMap.newKeySet();
            for (PlayerTrust p : list) {
                if (p.name != null) set.add(key(p.name));
            }
            blacklist = set;
        });
    }
}
