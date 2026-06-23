package eu.bieder.bigmc.premium;

import eu.bieder.bigmc.BigMC;
import org.bukkit.entity.Player;
import org.bukkit.permissions.PermissionAttachmentInfo;

/**
 * Kleiner Helfer fuer Premium-/Perk-Grenzen.
 *
 * Premium wird NICHT in einer eigenen Tabelle gehalten, sondern ueber
 * Permissions abgefragt (von LuckPerms, dem eingebauten Rang-System oder per
 * /op gesetzt). So bleibt das bestehende Rang-System unangetastet.
 *
 *   bigmc.premium            -> Master-Flag "ist Premium"
 *   bigmc.homes.<n>          -> erlaubt n Homes (hoechster Wert gewinnt)
 *   bigmc.enderchest.large   -> 54-Slot-Enderchest
 */
public class PremiumService {

    private final BigMC plugin;

    public PremiumService(BigMC plugin) {
        this.plugin = plugin;
    }

    /** Ist der Spieler Premium? */
    public boolean isPremium(Player player) {
        return player.hasPermission("bigmc.premium");
    }

    /**
     * Maximale Anzahl Homes: groesster Wert aus
     *  - config homes.default-limit
     *  - config homes.premium-limit (falls Premium)
     *  - bigmc.homes.<n> Permissions
     */
    public int getHomeLimit(Player player) {
        var cfg = plugin.getConfigManager().getConfig();
        int limit = Math.max(1, cfg.getInt("homes.default-limit", 3));
        if (isPremium(player)) {
            limit = Math.max(limit, cfg.getInt("homes.premium-limit", 6));
        }
        for (PermissionAttachmentInfo info : player.getEffectivePermissions()) {
            if (!info.getValue()) continue;
            String perm = info.getPermission();
            if (perm.startsWith("bigmc.homes.")) {
                try {
                    limit = Math.max(limit, Integer.parseInt(perm.substring("bigmc.homes.".length())));
                } catch (NumberFormatException ignored) {
                    // "bigmc.homes.*" o.ae. ignorieren
                }
            }
        }
        return limit;
    }

    /** Groesse der virtuellen Enderchest (54 fuer Premium, sonst 27). */
    public int getEnderchestSize(Player player) {
        return (isPremium(player) || player.hasPermission("bigmc.enderchest.large")) ? 54 : 27;
    }

    /** Maximale Clan-Mitgliederzahl (Premium groesser). */
    public int getClanSize(Player player) {
        var cfg = plugin.getConfigManager().getConfig();
        int base = cfg.getInt("clans.max-members", 10);
        if (player.hasPermission("bigmc.clan.size.30") || isPremium(player)) {
            return Math.max(base, cfg.getInt("clans.premium-max-members", 30));
        }
        return base;
    }
}
