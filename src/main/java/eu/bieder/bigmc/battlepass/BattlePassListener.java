package eu.bieder.bigmc.battlepass;

import eu.bieder.bigmc.BigMC;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Laedt/speichert die Battle-Pass-Daten eines Spielers beim Join/Quit.
 * (XP wird im QuestListener vergeben, der bereits den Farm-Schutz besitzt.)
 */
public class BattlePassListener implements Listener {

    private final BigMC plugin;

    public BattlePassListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        plugin.getBattlePassManager().loadPlayer(event.getPlayer().getUniqueId());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getBattlePassManager().unloadPlayer(event.getPlayer().getUniqueId());
    }
}
