package eu.bieder.bigmc.fly;

import eu.bieder.bigmc.BigMC;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Sorgt fuer den Sturzschutz nach Flug-Ende und raeumt beim Quit auf.
 */
public class FlyListener implements Listener {

    private final BigMC plugin;

    public FlyListener(BigMC plugin) {
        this.plugin = plugin;
    }

    /** Sturzschaden ignorieren, solange der Spieler geschuetzt ist. */
    @EventHandler(ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        if (event.getCause() != EntityDamageEvent.DamageCause.FALL) return;
        if (!(event.getEntity() instanceof Player player)) return;
        if (FallProtection.isProtected(player.getUniqueId())) {
            event.setCancelled(true);
        }
    }

    /** Beim Verlassen den Flug-Status sauber zuruecksetzen. */
    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getFlyManager().disableFly(event.getPlayer().getUniqueId(), false);
    }
}
