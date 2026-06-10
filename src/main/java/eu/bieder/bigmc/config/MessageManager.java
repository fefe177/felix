package eu.bieder.bigmc.config;

import eu.bieder.bigmc.BigMC;
import org.bukkit.ChatColor;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;

import java.io.File;

/**
 * Verwaltet alle Texte aus der messages.yml.
 *
 * Vorteile: Texte sind komplett vom Code getrennt, koennen in Deutsch
 * gepflegt werden und unterstuetzen klassische Farbcodes (&a, &c ...).
 * Jeder Text wird automatisch mit dem konfigurierbaren Praefix versehen.
 */
public class MessageManager {

    private final BigMC plugin;
    private FileConfiguration messages;
    private String prefix;

    public MessageManager(BigMC plugin) {
        this.plugin = plugin;
        reload();
    }

    /**
     * Laedt die messages.yml (neu) von der Festplatte.
     */
    public void reload() {
        File file = new File(plugin.getDataFolder(), "messages.yml");
        if (!file.exists()) {
            plugin.saveResource("messages.yml", false);
        }
        this.messages = YamlConfiguration.loadConfiguration(file);
        this.prefix = color(messages.getString("prefix", "&8[&bBigMC&8] &7"));
    }

    /**
     * Holt einen Text per Pfad (z.B. "general.no-permission"), ersetzt
     * Farbcodes und fuegt nichts hinzu (ohne Praefix).
     */
    public String getRaw(String path) {
        String value = messages.getString(path, "&cFehlende Nachricht: " + path);
        return color(value);
    }

    /**
     * Wie getRaw, aber mit vorangestelltem Praefix.
     */
    public String get(String path) {
        return prefix + getRaw(path);
    }

    /**
     * Holt einen Text und ersetzt Platzhalter paarweise.
     * Beispiel: get("economy.paid", "%amount%", "50", "%player%", "Felix")
     */
    public String get(String path, String... replacements) {
        String message = getRaw(path);
        for (int i = 0; i + 1 < replacements.length; i += 2) {
            message = message.replace(replacements[i], replacements[i + 1]);
        }
        return prefix + message;
    }

    /**
     * Sendet einem Empfaenger direkt eine Nachricht (mit Praefix + Platzhaltern).
     */
    public void send(CommandSender to, String path, String... replacements) {
        to.sendMessage(get(path, replacements));
    }

    /**
     * Gibt den konfigurierten Praefix zurueck.
     */
    public String getPrefix() {
        return prefix;
    }

    /**
     * Wandelt &-Farbcodes in echte Minecraft-Farbcodes um.
     */
    public static String color(String input) {
        if (input == null) return "";
        return ChatColor.translateAlternateColorCodes('&', input);
    }
}
