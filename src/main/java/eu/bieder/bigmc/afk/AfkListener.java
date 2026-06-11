package eu.bieder.bigmc.afk;

import eu.bieder.bigmc.BigMC;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Raeumt den AFK-Status beim Verlassen des Servers auf
 * (Spieler wird vorher an seine Original-Position zurueckgesetzt).
 */
public class AfkListener implements Listener {

    private final BigMC plugin;

    public AfkListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getAfkManager().handleQuit(event.getPlayer());
    }
}
