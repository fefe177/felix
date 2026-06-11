package eu.bieder.bigmc.spawn;

import eu.bieder.bigmc.BigMC;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;

/**
 * Setzt die Spawn-Schutzzone durch:
 * - kein Blockabbau/Platzieren (ausser bypass-Permission)
 * - kein PvP, wenn Opfer ODER Angreifer in der Zone steht
 */
public class SpawnListener implements Listener {

    private final BigMC plugin;

    public SpawnListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler(ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        if (!plugin.getSpawnManager().isProtected(event.getBlock().getLocation())) return;
        if (plugin.getSpawnManager().canBypass(event.getPlayer())) return;
        event.setCancelled(true);
        plugin.getMessageManager().send(event.getPlayer(), "spawn.protected");
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        if (!plugin.getSpawnManager().isProtected(event.getBlock().getLocation())) return;
        if (plugin.getSpawnManager().canBypass(event.getPlayer())) return;
        event.setCancelled(true);
        plugin.getMessageManager().send(event.getPlayer(), "spawn.protected");
    }

    @EventHandler(ignoreCancelled = true)
    public void onPvp(EntityDamageByEntityEvent event) {
        if (!(event.getEntity() instanceof Player victim)) return;

        // Angreifer ermitteln (direkt oder als Schuetze eines Projektils)
        Player attacker = null;
        if (event.getDamager() instanceof Player p) {
            attacker = p;
        } else if (event.getDamager() instanceof Projectile projectile
                && projectile.getShooter() instanceof Player p) {
            attacker = p;
        }
        if (attacker == null || attacker.getUniqueId().equals(victim.getUniqueId())) return;

        // PvP blockieren, wenn einer von beiden in der Schutzzone steht
        if (plugin.getSpawnManager().isProtected(victim.getLocation())
                || plugin.getSpawnManager().isProtected(attacker.getLocation())) {
            event.setCancelled(true);
            plugin.getMessageManager().send(attacker, "spawn.no-pvp");
        }
    }
}
