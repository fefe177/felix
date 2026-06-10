package eu.bieder.bigmc.duel;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.attribute.Attribute;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Steuert die komplette Duell-Logik:
 * - offene Herausforderungen (mit Ablauf)
 * - Start eines Duells (Inventar sichern, teleportieren, Countdown)
 * - Beenden (Sieger ermitteln, Inventare wiederherstellen, Statistik)
 *
 * Die Arena wird ueber zwei Spawn-Positionen in der config.yml definiert.
 */
public class DuelManager {

    private final BigMC plugin;

    /** Offene Herausforderungen: Ziel-UUID -> Herausforderer-UUID. */
    private final Map<UUID, UUID> pendingChallenges = new HashMap<>();

    /** Laufende Duelle: jede der beiden Spieler-UUIDs zeigt auf dasselbe Duel-Objekt. */
    private final Map<UUID, Duel> activeDuels = new HashMap<>();

    public DuelManager(BigMC plugin) {
        this.plugin = plugin;
    }

    // ----- Herausforderungen -----

    /**
     * Speichert eine Herausforderung und laesst sie nach Ablauf verfallen.
     */
    public void addChallenge(Player challenger, Player target) {
        pendingChallenges.put(target.getUniqueId(), challenger.getUniqueId());

        int timeout = plugin.getConfigManager().getConfig().getInt("duel.challenge-timeout-seconds", 30);
        UUID targetId = target.getUniqueId();
        UUID challengerId = challenger.getUniqueId();

        // Nach Ablauf entfernen - aber nur, wenn es noch dieselbe Herausforderung ist
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (challengerId.equals(pendingChallenges.get(targetId))) {
                pendingChallenges.remove(targetId);
                Player c = Bukkit.getPlayer(challengerId);
                Player t = Bukkit.getPlayer(targetId);
                if (c != null) plugin.getMessageManager().send(c, "duel.challenge-expired", "%player%",
                        t != null ? t.getName() : "?");
            }
        }, 20L * timeout);
    }

    /** Herausforderer, der diesen Spieler herausgefordert hat (oder null). */
    public UUID getChallenger(UUID target) {
        return pendingChallenges.get(target);
    }

    public void removeChallenge(UUID target) {
        pendingChallenges.remove(target);
    }

    public boolean hasChallenge(UUID target) {
        return pendingChallenges.containsKey(target);
    }

    // ----- Duell-Status -----

    public boolean isInDuel(UUID player) {
        return activeDuels.containsKey(player);
    }

    public Duel getDuel(UUID player) {
        return activeDuels.get(player);
    }

    // ----- Duell starten -----

    /**
     * Startet ein Duell zwischen zwei Spielern.
     * Sichert beide Zustaende, teleportiert in die Arena und startet den Countdown.
     */
    public void startDuel(Player p1, Player p2) {
        Location spawn1 = getArenaSpawn(1);
        Location spawn2 = getArenaSpawn(2);
        if (spawn1 == null || spawn2 == null) {
            plugin.getMessageManager().send(p1, "duel.arena-not-set");
            plugin.getMessageManager().send(p2, "duel.arena-not-set");
            return;
        }

        Duel duel = new Duel(p1.getUniqueId(), p2.getUniqueId());
        activeDuels.put(p1.getUniqueId(), duel);
        activeDuels.put(p2.getUniqueId(), duel);

        // Beide Zustaende sichern und fuer das Duell vorbereiten
        prepareForDuel(p1, duel);
        prepareForDuel(p2, duel);

        p1.teleport(spawn1);
        p2.teleport(spawn2);

        // Blickrichtung zueinander ausrichten (sieht sauberer aus)
        faceEachOther(p1, spawn1, spawn2);
        faceEachOther(p2, spawn2, spawn1);

        startCountdown(duel);
    }

    /** Sichert den Spielerzustand und raeumt ihn fuer das Duell auf. */
    private void prepareForDuel(Player player, Duel duel) {
        Duel.PlayerSnapshot snap = duel.getSnapshot(player.getUniqueId());
        snap.inventory = player.getInventory().getContents().clone();
        snap.armor = player.getInventory().getArmorContents().clone();
        snap.offhand = player.getInventory().getItemInOffHand().clone();
        snap.previousLocation = player.getLocation().clone();
        snap.health = player.getHealth();
        snap.foodLevel = player.getFoodLevel();
        snap.saturation = player.getSaturation();
        snap.level = player.getLevel();
        snap.exp = player.getExp();
        snap.gameMode = player.getGameMode();

        // Spieler "frisch" machen: volle Leben/Hunger, sauberes Inventar
        player.getInventory().clear();
        player.setGameMode(GameMode.SURVIVAL);
        double maxHealth = player.getAttribute(Attribute.MAX_HEALTH).getValue();
        player.setHealth(maxHealth);
        player.setFoodLevel(20);
        player.setSaturation(20f);
        player.setFireTicks(0);

        // Kit aus der config geben (optional)
        plugin.getDuelKit().applyKit(player);
    }

    /** Countdown vor Duell-Beginn (Bewegung/Schaden ist solange gesperrt). */
    private void startCountdown(Duel duel) {
        int seconds = plugin.getConfigManager().getConfig().getInt("duel.countdown-seconds", 5);

        new BukkitRunnable() {
            int remaining = seconds;

            @Override
            public void run() {
                // Abbruch, falls das Duell zwischenzeitlich beendet wurde
                if (duel.isFinished()) {
                    cancel();
                    return;
                }
                Player p1 = Bukkit.getPlayer(duel.getPlayer1());
                Player p2 = Bukkit.getPlayer(duel.getPlayer2());
                // Verlaesst jemand vorzeitig, gewinnt der andere
                if (p1 == null || p2 == null) {
                    cancel();
                    handleQuit(p1 == null ? duel.getPlayer1() : duel.getPlayer2());
                    return;
                }

                if (remaining > 0) {
                    plugin.getMessageManager().send(p1, "duel.countdown", "%seconds%", String.valueOf(remaining));
                    plugin.getMessageManager().send(p2, "duel.countdown", "%seconds%", String.valueOf(remaining));
                    remaining--;
                } else {
                    duel.setCountdownActive(false);
                    plugin.getMessageManager().send(p1, "duel.start");
                    plugin.getMessageManager().send(p2, "duel.start");
                    cancel();
                }
            }
        }.runTaskTimer(plugin, 0L, 20L);
    }

    // ----- Duell beenden -----

    /**
     * Beendet ein Duell reglulaer: "loser" hat verloren, der Gegner gewinnt.
     */
    public void finishDuel(UUID loser) {
        Duel duel = activeDuels.get(loser);
        if (duel == null || duel.isFinished()) return;
        duel.setFinished(true);

        UUID winnerId = duel.getOpponent(loser);

        // Beide aus der aktiven Liste nehmen
        activeDuels.remove(duel.getPlayer1());
        activeDuels.remove(duel.getPlayer2());

        Player winner = Bukkit.getPlayer(winnerId);
        Player loserPlayer = Bukkit.getPlayer(loser);

        // Zustaende wiederherstellen
        if (winner != null) restoreSnapshot(winner, duel);
        if (loserPlayer != null) restoreSnapshot(loserPlayer, duel);

        // Statistik: Sieg fuer den Gewinner
        plugin.getStatsManager().addDuelWin(winnerId);

        // Nachrichten + Broadcast
        String winnerName = winner != null ? winner.getName() : "?";
        String loserName = loserPlayer != null ? loserPlayer.getName() : "?";
        if (winner != null) plugin.getMessageManager().send(winner, "duel.you-won", "%player%", loserName);
        if (loserPlayer != null) plugin.getMessageManager().send(loserPlayer, "duel.you-lost", "%player%", winnerName);

        if (plugin.getConfigManager().getConfig().getBoolean("duel.broadcast-winner", true)) {
            Bukkit.broadcastMessage(plugin.getMessageManager().get("duel.broadcast",
                    "%winner%", winnerName, "%loser%", loserName));
        }
    }

    /**
     * Behandelt das Verlassen eines Spielers (Quit oder Logout) waehrend des Duells:
     * der verbleibende Spieler gewinnt, der gegangene gilt als Verlierer.
     */
    public void handleQuit(UUID quitter) {
        Duel duel = activeDuels.get(quitter);
        if (duel == null) return;
        // finishDuel stellt den verbleibenden Spieler wieder her und wertet den Sieg
        finishDuel(quitter);
    }

    /**
     * Stellt den gesicherten Zustand eines Spielers wieder her und teleportiert zurueck.
     */
    private void restoreSnapshot(Player player, Duel duel) {
        Duel.PlayerSnapshot snap = duel.getSnapshot(player.getUniqueId());
        if (snap.inventory == null) return;

        player.setFireTicks(0);
        player.getInventory().setContents(snap.inventory);
        player.getInventory().setArmorContents(snap.armor);
        player.getInventory().setItemInOffHand(snap.offhand);
        player.setGameMode(snap.gameMode);
        double maxHealth = player.getAttribute(Attribute.MAX_HEALTH).getValue();
        player.setHealth(Math.min(snap.health, maxHealth));
        player.setFoodLevel(snap.foodLevel);
        player.setSaturation(snap.saturation);
        player.setLevel(snap.level);
        player.setExp(snap.exp);

        if (snap.previousLocation != null) {
            player.teleport(snap.previousLocation);
        }
    }

    // ----- Arena / Hilfen -----

    /** Liest eine Arena-Spawnposition (1 oder 2) aus der config.yml. */
    public Location getArenaSpawn(int number) {
        var cfg = plugin.getConfigManager().getConfig();
        String base = "duel.arena.spawn" + number;
        String worldName = cfg.getString(base + ".world", "");
        if (worldName == null || worldName.isEmpty()) return null;
        World world = Bukkit.getWorld(worldName);
        if (world == null) return null;
        return new Location(world,
                cfg.getDouble(base + ".x"),
                cfg.getDouble(base + ".y"),
                cfg.getDouble(base + ".z"),
                (float) cfg.getDouble(base + ".yaw"),
                (float) cfg.getDouble(base + ".pitch"));
    }

    /** Speichert die aktuelle Spielerposition als Arena-Spawn (fuer /duel setspawn). */
    public void setArenaSpawn(int number, Location loc) {
        var cfg = plugin.getConfigManager().getConfig();
        String base = "duel.arena.spawn" + number;
        cfg.set(base + ".world", loc.getWorld().getName());
        cfg.set(base + ".x", loc.getX());
        cfg.set(base + ".y", loc.getY());
        cfg.set(base + ".z", loc.getZ());
        cfg.set(base + ".yaw", loc.getYaw());
        cfg.set(base + ".pitch", loc.getPitch());
        plugin.saveConfig();
    }

    /** Dreht "player" so, dass er Richtung Zielposition blickt. */
    private void faceEachOther(Player player, Location from, Location to) {
        double dx = to.getX() - from.getX();
        double dz = to.getZ() - from.getZ();
        float yaw = (float) (Math.toDegrees(Math.atan2(-dx, dz)));
        Location loc = player.getLocation();
        loc.setYaw(yaw);
        loc.setPitch(0);
        player.teleport(loc);
    }

    /** Beim Plugin-Stop alle laufenden Duelle sauber zuruecksetzen. */
    public void endAllDuels() {
        for (UUID id : new HashMap<>(activeDuels).keySet()) {
            Duel duel = activeDuels.get(id);
            if (duel == null || duel.isFinished()) continue;
            duel.setFinished(true);
            Player p1 = Bukkit.getPlayer(duel.getPlayer1());
            Player p2 = Bukkit.getPlayer(duel.getPlayer2());
            if (p1 != null) restoreSnapshot(p1, duel);
            if (p2 != null) restoreSnapshot(p2, duel);
            activeDuels.remove(duel.getPlayer1());
            activeDuels.remove(duel.getPlayer2());
        }
    }
}
