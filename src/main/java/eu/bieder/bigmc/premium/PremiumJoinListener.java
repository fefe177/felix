package eu.bieder.bigmc.premium;

import eu.bieder.bigmc.BigMC;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerLoginEvent;

/**
 * Laesst Premium-Spieler (Permission bigmc.join.full) auch dann auf den Server,
 * wenn dieser bereits voll ist.
 */
public class PremiumJoinListener implements Listener {

    @SuppressWarnings("unused")
    private final BigMC plugin;

    public PremiumJoinListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onLogin(PlayerLoginEvent event) {
        if (event.getResult() == PlayerLoginEvent.Result.KICK_FULL
                && event.getPlayer().hasPermission("bigmc.join.full")) {
            event.allow();
        }
    }
}
