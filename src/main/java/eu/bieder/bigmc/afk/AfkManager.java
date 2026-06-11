package eu.bieder.bigmc.afk;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.Player;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Die AFK-Zone (wie auf DonutSMP): Spieler teleportieren sich mit /afk in
 * einen sicheren Bereich und verdienen dort passiv Shards.
 *
 * /afk merkt sich die vorherige Position; erneutes /afk teleportiert zurueck.
 * Ein Task schreibt allen AFK-Spielern regelmaessig Shards gut.
 */
public class AfkManager {

    private final BigMC plugin;

    /** AFK-Spieler -> Rueckkehr-Position. */
    private final Map<UUID, Location> afkPlayers = new HashMap<>();

    public AfkManager(BigMC plugin) {
        this.plugin = plugin;
    }

    /** Startet den Belohnungs-Task (Intervall + Menge aus der config). */
    public void start() {
        long interval = 20L * Math.max(5,
                plugin.getConfigManager().getConfig().getLong("afk.reward-interval-seconds", 60));
        Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            long amount = plugin.getConfigManager().getConfig().getLong("afk.shards-per-interval", 1);
            if (amount <= 0) return;
            for (UUID uuid : afkPlayers.keySet()) {
                Player player = Bukkit.getPlayer(uuid);
                if (player == null) continue;
                plugin.getShardsManager().addShards(uuid, amount);
                plugin.getMessageManager().send(player, "afk.reward",
                        "%amount%", plugin.getShardsManager().formatShards(amount));
            }
        }, interval, interval);
    }

    public boolean isAfk(UUID uuid) {
        return afkPlayers.containsKey(uuid);
    }

    /**
     * Teleportiert den Spieler in die AFK-Zone und merkt sich die Rueckkehr-Position.
     * @return false, wenn keine Zone konfiguriert ist
     */
    public boolean enterAfk(Player player) {
        Location zone = getZone();
        if (zone == null) return false;
        afkPlayers.put(player.getUniqueId(), player.getLocation().clone());
        player.teleport(zone);
        return true;
    }

    /** Teleportiert den Spieler aus der AFK-Zone zurueck. */
    public void leaveAfk(Player player) {
        Location back = afkPlayers.remove(player.getUniqueId());
        if (back != null) {
            player.teleport(back);
        }
    }

    /** Beim Quit: zurueckteleportieren und Status entfernen. */
    public void handleQuit(Player player) {
        leaveAfk(player);
    }

    /** Liest die AFK-Zone aus der config (null = nicht gesetzt). */
    public Location getZone() {
        var cfg = plugin.getConfigManager().getConfig();
        String worldName = cfg.getString("afk.zone.world", "");
        if (worldName == null || worldName.isEmpty()) return null;
        World world = Bukkit.getWorld(worldName);
        if (world == null) return null;
        return new Location(world,
                cfg.getDouble("afk.zone.x"),
                cfg.getDouble("afk.zone.y"),
                cfg.getDouble("afk.zone.z"),
                (float) cfg.getDouble("afk.zone.yaw"),
                (float) cfg.getDouble("afk.zone.pitch"));
    }

    /** Setzt die AFK-Zone auf eine Position (fuer /afk set). */
    public void setZone(Location loc) {
        var cfg = plugin.getConfigManager().getConfig();
        cfg.set("afk.zone.world", loc.getWorld().getName());
        cfg.set("afk.zone.x", loc.getX());
        cfg.set("afk.zone.y", loc.getY());
        cfg.set("afk.zone.z", loc.getZ());
        cfg.set("afk.zone.yaw", loc.getYaw());
        cfg.set("afk.zone.pitch", loc.getPitch());
        plugin.saveConfig();
    }
}
