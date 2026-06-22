package eu.bieder.bigmc.config;

import eu.bieder.bigmc.BigMC;
import org.bukkit.ChatColor;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;

import java.io.File;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Verwaltet alle Texte aus der messages.yml.
 *
 * Vorteile: Texte sind komplett vom Code getrennt, koennen in Deutsch
 * gepflegt werden und unterstuetzen Farbcodes:
 *   - klassisch:  &a, &c, &l ...
 *   - Hex (1.16+): &#RRGGBB  (z.B. &#FF8800)
 *   - Verlauf:    <g:#RRGGBB:#RRGGBB>Text</g>  (DonutSMP-/HugoSMP-Stil)
 * Jeder Text wird automatisch mit dem konfigurierbaren Praefix versehen.
 */
public class MessageManager {

    /** Einzelner Hex-Farbcode, z.B. &#FF8800 */
    private static final Pattern HEX_PATTERN = Pattern.compile("&#([A-Fa-f0-9]{6})");

    /** Farbverlauf-Tag, z.B. <g:#FFE259:#FFA751>&lSHOP</g> */
    private static final Pattern GRADIENT_PATTERN =
            Pattern.compile("<g:#([A-Fa-f0-9]{6}):#([A-Fa-f0-9]{6})>(.*?)</g>");

    /** Format-Codes (fett, kursiv, unterstrichen, durchgestrichen, magisch). */
    private static final String FORMAT_CODES = "klmno";

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
     * Holt eine Text-Liste (z.B. Scoreboard-Zeilen) und ersetzt Farbcodes.
     */
    public java.util.List<String> getRawList(String path) {
        return messages.getStringList(path).stream()
                .map(MessageManager::color)
                .toList();
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
     * Wandelt alle Farbcodes in echte Minecraft-Farbcodes um.
     * Reihenfolge: erst Verlaeufe, dann Hex, dann klassische &-Codes.
     */
    public static String color(String input) {
        if (input == null) return "";
        String out = applyGradients(input);
        out = applyHex(out);
        return ChatColor.translateAlternateColorCodes('&', out);
    }

    /**
     * Ersetzt alle &#RRGGBB durch das Bukkit-Hex-Format (§x§R§R§G§G§B§B).
     */
    private static String applyHex(String input) {
        Matcher m = HEX_PATTERN.matcher(input);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            m.appendReplacement(sb, Matcher.quoteReplacement(hexToLegacy(m.group(1))));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /**
     * Ersetzt alle <g:#hex:#hex>Text</g> durch einen weichen Farbverlauf,
     * wobei Format-Codes (z.B. &l) innerhalb des Textes erhalten bleiben.
     */
    private static String applyGradients(String input) {
        Matcher m = GRADIENT_PATTERN.matcher(input);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            int[] from = rgb(m.group(1));
            int[] to = rgb(m.group(2));
            m.appendReplacement(sb, Matcher.quoteReplacement(buildGradient(m.group(3), from, to)));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /**
     * Baut den Verlauf Zeichen fuer Zeichen auf. Aktive Format-Codes werden
     * nach jedem Farbwechsel erneut gesetzt (sonst wuerde z.B. &l verloren gehen).
     */
    private static String buildGradient(String text, int[] from, int[] to) {
        int visible = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if ((c == '&' || c == ChatColor.COLOR_CHAR) && i + 1 < text.length()) { i++; continue; }
            visible++;
        }
        if (visible == 0) return text;

        StringBuilder active = new StringBuilder();
        StringBuilder out = new StringBuilder();
        int idx = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if ((c == '&' || c == ChatColor.COLOR_CHAR) && i + 1 < text.length()) {
                char code = Character.toLowerCase(text.charAt(i + 1));
                i++;
                if (code == 'r') {
                    active.setLength(0);
                } else if (FORMAT_CODES.indexOf(code) >= 0) {
                    active.append(ChatColor.COLOR_CHAR).append(code);
                }
                // Reine Farbcodes innerhalb des Verlaufs ignorieren - der Verlauf bestimmt die Farbe.
                continue;
            }
            double ratio = visible == 1 ? 0.0 : (double) idx / (visible - 1);
            int r = (int) Math.round(from[0] + (to[0] - from[0]) * ratio);
            int g = (int) Math.round(from[1] + (to[1] - from[1]) * ratio);
            int b = (int) Math.round(from[2] + (to[2] - from[2]) * ratio);
            out.append(hexToLegacy(r, g, b)).append(active).append(c);
            idx++;
        }
        return out.toString();
    }

    /** Wandelt "RRGGBB" in das Bukkit-Hex-Format §x§R§R§G§G§B§B um. */
    private static String hexToLegacy(String hex) {
        StringBuilder sb = new StringBuilder().append(ChatColor.COLOR_CHAR).append('x');
        for (char ch : hex.toCharArray()) {
            sb.append(ChatColor.COLOR_CHAR).append(ch);
        }
        return sb.toString();
    }

    /** Wandelt einzelne RGB-Werte in das Bukkit-Hex-Format um. */
    private static String hexToLegacy(int r, int g, int b) {
        return hexToLegacy(String.format("%02x%02x%02x", r & 0xFF, g & 0xFF, b & 0xFF));
    }

    /** Zerlegt "RRGGBB" in die drei RGB-Komponenten. */
    private static int[] rgb(String hex) {
        return new int[]{
                Integer.parseInt(hex.substring(0, 2), 16),
                Integer.parseInt(hex.substring(2, 4), 16),
                Integer.parseInt(hex.substring(4, 6), 16)
        };
    }
}
