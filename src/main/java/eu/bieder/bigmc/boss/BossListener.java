package eu.bieder.bigmc.boss;

import eu.bieder.bigmc.BigMC;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Verbindet Boss-Events mit dem Spielgeschehen:
 * - Schaden am Boss zaehlen (auch ueber Projektile)
 * - Tod des Bosses -> Rangliste + Belohnungen
 * - BossBar fuer joinende/quittende Spieler aktualisieren
 */
public class BossListener implements Listener {

    private final BigMC plugin;

    public BossListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler(ignoreCancelled = true)
    public void onDamage(EntityDamageByEntityEvent event) {
        if (!plugin.getBossManager().isActive()) return;
        if (!event.getEntity().getUniqueId().equals(plugin.getBossManager().getBossEntityId())) return;

        Player attacker = null;
        if (event.getDamager() instanceof Player p) {
            attacker = p;
        } else if (event.getDamager() instanceof Projectile proj && proj.getShooter() instanceof Player p) {
            attacker = p;
        }
        if (attacker == null) return;
        plugin.getBossManager().recordDamage(event.getEntity().getUniqueId(), attacker, event.getFinalDamage());
    }

    @EventHandler
    public void onDeath(EntityDeathEvent event) {
        if (!plugin.getBossManager().isActive()) return;
        if (event.getEntity().getUniqueId().equals(plugin.getBossManager().getBossEntityId())) {
            plugin.getBossManager().onBossDeath(event.getEntity().getUniqueId());
        }
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        plugin.getBossManager().addViewer(event.getPlayer());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getBossManager().removeViewer(event.getPlayer());
    }
}
