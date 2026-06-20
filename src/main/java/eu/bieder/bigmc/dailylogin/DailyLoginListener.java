package eu.bieder.bigmc.dailylogin;

import eu.bieder.bigmc.BigMC;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Laedt die Login-Daten beim Join und erinnert an die abholbare Belohnung.
 */
public class DailyLoginListener implements Listener {

    private final BigMC plugin;

    public DailyLoginListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        var player = event.getPlayer();
        plugin.getDailyLoginManager().loadPlayer(player.getUniqueId());
        // Kurz verzoegert pruefen, ob heute schon abgeholt wurde (nach DB-Load)
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            if (player.isOnline() && plugin.getDailyLoginManager().canClaim(player.getUniqueId())) {
                plugin.getMessageManager().send(player, "dailylogin.reminder");
            }
        }, 40L);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getDailyLoginManager().unloadPlayer(event.getPlayer().getUniqueId());
    }
}
