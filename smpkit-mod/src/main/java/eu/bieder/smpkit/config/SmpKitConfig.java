package eu.bieder.smpkit.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Persistente Konfiguration, gespeichert als config/smpkit.json.
 * Wird beim Start geladen und bei Änderungen (z.B. /smptrust seturl) gespeichert.
 */
public class SmpKitConfig {

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE =
            FabricLoader.getInstance().getConfigDir().resolve("smpkit.json");

    // --- Backend ---
    /** Basis-URL des Trust-Backends, ohne abschließenden Slash. */
    public String backendUrl = "http://localhost:8080";
    /**
     * Zugangs-Token bzw. API-Key (X-Api-Key). Wird normalerweise automatisch von
     * "/smpkit redeem &lt;schlüssel&gt;" gesetzt (persönliches Token nach Einlösung).
     * Leer = keiner.
     */
    public String apiKey = "";

    // --- Reputation / Trust ---
    public boolean trustHudEnabled = true;
    /** Warnen, wenn ein geflaggter Spieler in der Nähe ist. */
    public boolean nearbyWarningEnabled = true;
    /** Radius (Blöcke) für die Nähe-Warnung. */
    public int nearbyWarnRadius = 24;
    /** Trust-Wert, ab dem der HUD gelb warnt. */
    public int warnTrustBelow = 40;

    // --- SafeTrade: /pay-Doppelbestätigung ---
    public boolean payConfirmEnabled = true;
    /** Ab dieser Summe wird eine Bestätigung verlangt. */
    public long payConfirmThreshold = 100_000L;

    // --- Ledger (Economy-HUD) ---
    public boolean ledgerHudEnabled = true;

    // --- Grind-Tracker ---
    public boolean grindHudEnabled = false;

    // ---------------------------------------------------------------

    private static SmpKitConfig instance;

    public static SmpKitConfig get() {
        if (instance == null) {
            instance = load();
        }
        return instance;
    }

    private static SmpKitConfig load() {
        try {
            if (Files.exists(FILE)) {
                String json = Files.readString(FILE);
                SmpKitConfig cfg = GSON.fromJson(json, SmpKitConfig.class);
                if (cfg != null) {
                    return cfg;
                }
            }
        } catch (IOException | RuntimeException e) {
            System.err.println("[SMP-Kit] Konfiguration konnte nicht geladen werden: " + e.getMessage());
        }
        SmpKitConfig cfg = new SmpKitConfig();
        cfg.save();
        return cfg;
    }

    public void save() {
        try {
            Files.createDirectories(FILE.getParent());
            Files.writeString(FILE, GSON.toJson(this));
        } catch (IOException e) {
            System.err.println("[SMP-Kit] Konfiguration konnte nicht gespeichert werden: " + e.getMessage());
        }
    }

    /** Normalisierte Backend-URL ohne abschließenden Slash. */
    public String baseUrl() {
        String u = backendUrl == null ? "" : backendUrl.trim();
        while (u.endsWith("/")) {
            u = u.substring(0, u.length() - 1);
        }
        return u;
    }
}
