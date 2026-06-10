package eu.bieder.bigmc.economy;

import eu.bieder.bigmc.BigMC;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

/**
 * Sorgt dafuer, dass jeder Spieler beim Betreten des Servers
 * automatisch ein Konto mit Startguthaben bekommt.
 */
public class PlayerJoinListener implements Listener {

    private final BigMC plugin;

    public PlayerJoinListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        plugin.getEconomyManager().createAccountIfMissing(event.getPlayer());
    }
}
