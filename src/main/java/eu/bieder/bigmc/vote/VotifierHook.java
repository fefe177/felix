package eu.bieder.bigmc.vote;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.event.Event;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;

/**
 * Bindet NuVotifier per Reflection an.
 *
 * Dadurch braucht BigMC KEINE Votifier-Bibliothek zum Kompilieren und laeuft
 * sowohl mit als auch ohne NuVotifier. Ist NuVotifier installiert, registrieren
 * wir dynamisch einen Listener auf das VotifierEvent und lesen den Spielernamen
 * ueber Reflection aus - das echte Event wird vom Vote-Plugin bereitgestellt.
 */
public final class VotifierHook {

    private VotifierHook() {
    }

    /**
     * Versucht, den Vote-Listener zu registrieren.
     * @return true, wenn NuVotifier vorhanden ist und der Listener haengt
     */
    @SuppressWarnings("unchecked")
    public static boolean register(BigMC plugin) {
        Class<?> eventClass;
        try {
            eventClass = Class.forName("com.vexsoftware.votifier.model.VotifierEvent");
        } catch (ClassNotFoundException e) {
            return false; // Kein Votifier installiert
        }

        // Leerer Listener nur als "Eigentuemer" der Registrierung
        Listener owner = new Listener() {
        };

        Bukkit.getPluginManager().registerEvent(
                (Class<? extends Event>) eventClass, owner, EventPriority.NORMAL,
                (listener, event) -> handleVoteEvent(plugin, event),
                plugin);
        return true;
    }

    /** Liest Spielernamen aus dem VotifierEvent (per Reflection) und belohnt. */
    private static void handleVoteEvent(BigMC plugin, Event event) {
        try {
            Object vote = event.getClass().getMethod("getVote").invoke(event);
            Object username = vote.getClass().getMethod("getUsername").invoke(vote);
            if (username instanceof String name && !name.isBlank()) {
                // Votes kommen async an -> auf den Hauptthread wechseln
                Bukkit.getScheduler().runTask(plugin,
                        () -> plugin.getVoteRewardManager().handleVote(name));
            }
        } catch (Exception ex) {
            plugin.getLogger().warning("Vote konnte nicht verarbeitet werden: " + ex.getMessage());
        }
    }
}
