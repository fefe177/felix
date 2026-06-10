package eu.bieder.bigmc.stats;

import eu.bieder.bigmc.BigMC;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Zaehlt Kills und Tode und verwaltet die Spielzeit-Sessions.
 */
public class StatsListener implements Listener {

    private final BigMC plugin;

    public StatsListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        plugin.getStatsManager().startSession(event.getPlayer());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getStatsManager().endSession(event.getPlayer().getUniqueId());
    }

    @EventHandler
    public void onDeath(PlayerDeathEvent event) {
        Player victim = event.getEntity();
        plugin.getStatsManager().addDeath(victim.getUniqueId());

        // Kill nur zaehlen, wenn ein anderer Spieler der Killer war
        Player killer = victim.getKiller();
        if (killer != null && !killer.getUniqueId().equals(victim.getUniqueId())) {
            plugin.getStatsManager().addKill(killer.getUniqueId());
        }
    }
}
