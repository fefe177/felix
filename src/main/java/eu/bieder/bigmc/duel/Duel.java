package eu.bieder.bigmc.duel;

import org.bukkit.Location;
import org.bukkit.inventory.ItemStack;

import java.util.UUID;

/**
 * Haelt den Zustand eines laufenden Duells zwischen zwei Spielern.
 *
 * Wichtig fuer die Fairness: Das komplette Inventar, die Ruestung, Leben,
 * Hunger und die urspruengliche Position beider Spieler werden hier
 * zwischengespeichert und nach dem Duell exakt wiederhergestellt.
 */
public class Duel {

    /** Sicherung des kompletten Spielerzustands vor dem Duell. */
    public static class PlayerSnapshot {
        public ItemStack[] inventory;
        public ItemStack[] armor;
        public ItemStack offhand;
        public Location previousLocation;
        public double health;
        public int foodLevel;
        public float saturation;
        public int level;
        public float exp;
        public org.bukkit.GameMode gameMode;
    }

    private final UUID player1;
    private final UUID player2;
    private final PlayerSnapshot snapshot1 = new PlayerSnapshot();
    private final PlayerSnapshot snapshot2 = new PlayerSnapshot();

    /** true, solange noch der Countdown laeuft (Bewegung/Schaden blockiert). */
    private boolean countdownActive = true;

    /** true, sobald das Duell beendet wird (verhindert doppelte Auswertung). */
    private boolean finished = false;

    public Duel(UUID player1, UUID player2) {
        this.player1 = player1;
        this.player2 = player2;
    }

    public UUID getPlayer1() {
        return player1;
    }

    public UUID getPlayer2() {
        return player2;
    }

    /** Liefert den Gegner einer der beiden Duell-Parteien. */
    public UUID getOpponent(UUID player) {
        if (player.equals(player1)) return player2;
        if (player.equals(player2)) return player1;
        return null;
    }

    public boolean contains(UUID player) {
        return player.equals(player1) || player.equals(player2);
    }

    public PlayerSnapshot getSnapshot(UUID player) {
        return player.equals(player1) ? snapshot1 : snapshot2;
    }

    public boolean isCountdownActive() {
        return countdownActive;
    }

    public void setCountdownActive(boolean countdownActive) {
        this.countdownActive = countdownActive;
    }

    public boolean isFinished() {
        return finished;
    }

    public void setFinished(boolean finished) {
        this.finished = finished;
    }
}
