package eu.bieder.bigmc.shards;

import eu.bieder.bigmc.BigMC;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerJoinEvent;

/**
 * Verbindet die Shards mit dem Spielgeschehen:
 * - Join: Konto anlegen
 * - PvP-Kill: Shards-Belohnung fuer den Killer
 */
public class ShardListener implements Listener {

    private final BigMC plugin;

    public ShardListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        plugin.getShardsManager().createAccountIfMissing(event.getPlayer());
    }

    @EventHandler
    public void onDeath(PlayerDeathEvent event) {
        Player victim = event.getEntity();
        Player killer = victim.getKiller();
        if (killer == null || killer.getUniqueId().equals(victim.getUniqueId())) return;

        long reward = plugin.getShardsManager().getShardsPerKill();
        if (reward <= 0) return;

        plugin.getShardsManager().addShards(killer.getUniqueId(), reward);
        plugin.getMessageManager().send(killer, "shards.kill-reward",
                "%amount%", plugin.getShardsManager().formatShards(reward),
                "%player%", victim.getName());
    }
}
