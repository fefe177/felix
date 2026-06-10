package eu.bieder.bigmc.vote;

import eu.bieder.bigmc.BigMC;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

/**
 * Zahlt beim Join ausstehende Vote-Belohnungen aus (z.B. fuer Votes,
 * die eingingen, waehrend der Spieler offline war).
 */
public class VoteJoinListener implements Listener {

    private final BigMC plugin;

    public VoteJoinListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        // Etwas verzoegert, damit der Spieler vollstaendig geladen ist
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            int claimed = plugin.getVoteRewardManager().claimPending(player);
            if (claimed > 0) {
                plugin.getMessageManager().send(player, "vote.pending-claimed",
                        "%count%", String.valueOf(claimed));
            }
        }, 40L);
    }
}
