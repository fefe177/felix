package eu.bieder.bigmc.config;

import eu.bieder.bigmc.BigMC;
import org.bukkit.configuration.file.FileConfiguration;

import java.io.File;

/**
 * Verwaltet den Zugriff auf die config.yml.
 *
 * Alle "Zahlen" des Plugins (Preise, Limits, Cooldowns ...) sollen hier
 * zentral abgefragt werden, damit kein Wert im Code fest verdrahtet ist.
 * In Phase 0 enthaelt die Config nur ein paar Grundeinstellungen.
 */
public class ConfigManager {

    private final BigMC plugin;

    public ConfigManager(BigMC plugin) {
        this.plugin = plugin;
        // Sicherstellen, dass die config.yml existiert
        plugin.saveDefaultConfig();
    }

    /**
     * Liefert die geladene config.yml zurueck.
     */
    public FileConfiguration getConfig() {
        return plugin.getConfig();
    }

    /**
     * Laedt die config.yml neu von der Festplatte.
     */
    public void reload() {
        plugin.reloadConfig();
    }

    // ----- Beispiel-Getter (werden in spaeteren Phasen erweitert) -----

    /**
     * Dateiname der SQLite-Datenbank (Standard: bigmc.db).
     */
    public String getDatabaseFileName() {
        return getConfig().getString("database.file", "bigmc.db");
    }

    /**
     * Startguthaben fuer neue Spieler (wird ab Phase 1 genutzt).
     */
    public double getStartBalance() {
        return getConfig().getDouble("economy.start-balance", 100.0);
    }

    // ----- Hilfsmethode -----

    /**
     * Kopiert eine mitgelieferte Ressourcendatei (z.B. messages.yml) in den
     * Plugin-Ordner, falls sie dort noch nicht existiert.
     */
    public static void saveDefaultIfMissing(BigMC plugin, String resourceName) {
        File file = new File(plugin.getDataFolder(), resourceName);
        if (!file.exists()) {
            plugin.saveResource(resourceName, false);
        }
    }
}
