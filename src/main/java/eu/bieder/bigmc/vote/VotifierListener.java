package eu.bieder.bigmc.vote;

import com.vexsoftware.votifier.model.Vote;
import com.vexsoftware.votifier.model.VotifierEvent;
import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

/**
 * Empfaengt Votes von NuVotifier (VotifierEvent) und leitet sie an den
 * VoteRewardManager weiter.
 *
 * WICHTIG: Diese Klasse referenziert Votifier-Klassen. Sie wird daher in der
 * Hauptklasse NUR dann registriert, wenn das Plugin "Votifier"/"NuVotifier"
 * tatsaechlich installiert ist - sonst wird sie nie geladen und das Plugin
 * laeuft auch ohne Votifier problemlos (Soft-Depend).
 */
public class VotifierListener implements Listener {

    private final BigMC plugin;

    public VotifierListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onVote(VotifierEvent event) {
        Vote vote = event.getVote();
        String playerName = vote.getUsername();
        if (playerName == null || playerName.isBlank()) {
            plugin.getLogger().warning("Vote ohne Spielernamen empfangen - wird ignoriert.");
            return;
        }
        // Auf den Hauptthread wechseln (Votes kommen async an, Bukkit-Aufrufe muessen sync sein)
        Bukkit.getScheduler().runTask(plugin, () -> plugin.getVoteRewardManager().handleVote(playerName));
    }
}
