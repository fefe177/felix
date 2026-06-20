package eu.bieder.bigmc.clan;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Verwaltet Clans: Erstellen, Mitglieder, Raenge, Punkte, Chat und Topliste.
 *
 * Clans und Mitgliedschaften werden im Arbeitsspeicher gehalten (schnell fuer
 * Chat/Checks) und asynchron in SQLite gespiegelt (restart-sicher). IDs werden
 * selbst vergeben (kein Generated-Key noetig).
 */
public class ClanManager {

    private final BigMC plugin;

    private final Map<Integer, Clan> clansById = new HashMap<>();
    private final Map<String, Integer> nameIndex = new HashMap<>(); // lower-case name -> id
    private final Map<UUID, Integer> memberClan = new HashMap<>();

    /** Offene Einladungen: eingeladener Spieler -> Clan-ID. */
    private final Map<UUID, Integer> invites = new HashMap<>();

    /** Spieler mit aktiviertem Clan-Chat. */
    private final java.util.Set<UUID> clanChat = new java.util.HashSet<>();

    private int nextId = 1;

    public ClanManager(BigMC plugin) {
        this.plugin = plugin;
        createTables();
        loadAll();
    }

    private void createTables() {
        plugin.getDatabaseExecutor().execute(conn -> {
            try (Statement st = conn.createStatement()) {
                st.execute("""
                    CREATE TABLE IF NOT EXISTS clans (
                        id      INTEGER PRIMARY KEY,
                        name    TEXT    NOT NULL,
                        tag     TEXT    NOT NULL,
                        owner   TEXT    NOT NULL,
                        points  INTEGER NOT NULL DEFAULT 0
                    );
                """);
                st.execute("""
                    CREATE TABLE IF NOT EXISTS clan_members (
                        uuid    TEXT PRIMARY KEY,
                        clan_id INTEGER NOT NULL,
                        rank    TEXT NOT NULL,
                        name    TEXT NOT NULL
                    );
                """);
            }
        });
    }

    /** Laedt alle Clans + Mitglieder asynchron und baut das In-Memory-Modell auf. */
    private void loadAll() {
        plugin.getDatabaseExecutor().query(conn -> {
            List<Object[]> clanRows = new ArrayList<>();
            try (PreparedStatement ps = conn.prepareStatement("SELECT id, name, tag, owner, points FROM clans;");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    clanRows.add(new Object[]{rs.getInt("id"), rs.getString("name"), rs.getString("tag"),
                            rs.getString("owner"), rs.getLong("points")});
                }
            }
            List<Object[]> memberRows = new ArrayList<>();
            try (PreparedStatement ps = conn.prepareStatement("SELECT uuid, clan_id, rank, name FROM clan_members;");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    memberRows.add(new Object[]{rs.getString("uuid"), rs.getInt("clan_id"),
                            rs.getString("rank"), rs.getString("name")});
                }
            }
            return new Object[]{clanRows, memberRows};
        }, result -> {
            if (result == null) return;
            @SuppressWarnings("unchecked")
            List<Object[]> clanRows = (List<Object[]>) result[0];
            @SuppressWarnings("unchecked")
            List<Object[]> memberRows = (List<Object[]>) result[1];

            for (Object[] r : clanRows) {
                int id = (int) r[0];
                Clan clan = new Clan(id, (String) r[1], (String) r[2], UUID.fromString((String) r[3]), (long) r[4]);
                clansById.put(id, clan);
                nameIndex.put(((String) r[1]).toLowerCase(), id);
                nextId = Math.max(nextId, id + 1);
            }
            for (Object[] r : memberRows) {
                int clanId = (int) r[1];
                Clan clan = clansById.get(clanId);
                if (clan == null) continue;
                UUID uuid = UUID.fromString((String) r[0]);
                ClanRank rank;
                try {
                    rank = ClanRank.valueOf((String) r[2]);
                } catch (IllegalArgumentException e) {
                    rank = ClanRank.MEMBER;
                }
                clan.getMembers().put(uuid, new Clan.Member(rank, (String) r[3]));
                memberClan.put(uuid, clanId);
            }
            plugin.getLogger().info("Clans geladen: " + clansById.size());
        });
    }

    // ----- Abfragen -----

    public Clan getClanOf(UUID uuid) {
        Integer id = memberClan.get(uuid);
        return id == null ? null : clansById.get(id);
    }

    public Optional<Clan> getClanByName(String name) {
        Integer id = nameIndex.get(name.toLowerCase());
        return id == null ? Optional.empty() : Optional.ofNullable(clansById.get(id));
    }

    public boolean isInClan(UUID uuid) {
        return memberClan.containsKey(uuid);
    }

    public ClanRank getRank(UUID uuid) {
        Clan clan = getClanOf(uuid);
        return clan == null ? null : clan.rankOf(uuid);
    }

    public List<Clan> getTop(int limit) {
        List<Clan> list = new ArrayList<>(clansById.values());
        list.sort(Comparator.comparingLong(Clan::getPoints).reversed());
        return list.size() > limit ? list.subList(0, limit) : list;
    }

    // ----- Config -----

    public int minNameLength() { return plugin.getConfigManager().getConfig().getInt("clans.min-name-length", 3); }
    public int maxNameLength() { return plugin.getConfigManager().getConfig().getInt("clans.max-name-length", 12); }
    public int maxMembers() { return plugin.getConfigManager().getConfig().getInt("clans.max-members", 10); }
    public long pointsPerKill() { return plugin.getConfigManager().getConfig().getLong("clans.points-per-kill", 1); }

    // ----- Mutationen -----

    /** Erstellt einen Clan (Aufrufer muss vorher validieren). */
    public Clan create(Player owner, String name) {
        int id = nextId++;
        Clan clan = new Clan(id, name, name, owner.getUniqueId(), 0);
        clan.getMembers().put(owner.getUniqueId(), new Clan.Member(ClanRank.OWNER, owner.getName()));
        clansById.put(id, clan);
        nameIndex.put(name.toLowerCase(), id);
        memberClan.put(owner.getUniqueId(), id);

        final String ownerStr = owner.getUniqueId().toString();
        final String ownerName = owner.getName();
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO clans (id, name, tag, owner, points) VALUES (?, ?, ?, ?, 0);")) {
                ps.setInt(1, id);
                ps.setString(2, name);
                ps.setString(3, name);
                ps.setString(4, ownerStr);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO clan_members (uuid, clan_id, rank, name) VALUES (?, ?, 'OWNER', ?);")) {
                ps.setString(1, ownerStr);
                ps.setInt(2, id);
                ps.setString(3, ownerName);
                ps.executeUpdate();
            }
        });
        return clan;
    }

    public void addMember(Clan clan, UUID uuid, String name, ClanRank rank) {
        clan.getMembers().put(uuid, new Clan.Member(rank, name));
        memberClan.put(uuid, clan.getId());
        final int clanId = clan.getId();
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO clan_members (uuid, clan_id, rank, name) VALUES (?, ?, ?, ?) " +
                            "ON CONFLICT(uuid) DO UPDATE SET clan_id = excluded.clan_id, rank = excluded.rank, name = excluded.name;")) {
                ps.setString(1, uuid.toString());
                ps.setInt(2, clanId);
                ps.setString(3, rank.name());
                ps.setString(4, name);
                ps.executeUpdate();
            }
        });
    }

    public void removeMember(UUID uuid) {
        Clan clan = getClanOf(uuid);
        if (clan == null) return;
        clan.getMembers().remove(uuid);
        memberClan.remove(uuid);
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM clan_members WHERE uuid = ?;")) {
                ps.setString(1, uuid.toString());
                ps.executeUpdate();
            }
        });
    }

    public void setRank(Clan clan, UUID uuid, ClanRank rank) {
        Clan.Member m = clan.getMembers().get(uuid);
        if (m == null) return;
        m.rank = rank;
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE clan_members SET rank = ? WHERE uuid = ?;")) {
                ps.setString(1, rank.name());
                ps.setString(2, uuid.toString());
                ps.executeUpdate();
            }
        });
    }

    public void disband(Clan clan) {
        for (UUID uuid : new ArrayList<>(clan.getMembers().keySet())) {
            memberClan.remove(uuid);
        }
        clansById.remove(clan.getId());
        nameIndex.remove(clan.getName().toLowerCase());
        final int id = clan.getId();
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM clan_members WHERE clan_id = ?;")) {
                ps.setInt(1, id);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM clans WHERE id = ?;")) {
                ps.setInt(1, id);
                ps.executeUpdate();
            }
        });
    }

    /** Admin: Punkte eines Clans direkt setzen. */
    public void setPoints(Clan clan, long points) {
        clan.setPoints(points);
        final int id = clan.getId();
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement("UPDATE clans SET points = ? WHERE id = ?;")) {
                ps.setLong(1, points);
                ps.setInt(2, id);
                ps.executeUpdate();
            }
        });
    }

    public void addPoints(UUID uuid, long amount) {
        Clan clan = getClanOf(uuid);
        if (clan == null || amount == 0) return;
        clan.addPoints(amount);
        final int id = clan.getId();
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE clans SET points = points + ? WHERE id = ?;")) {
                ps.setLong(1, amount);
                ps.setInt(2, id);
                ps.executeUpdate();
            }
        });
    }

    // ----- Einladungen -----

    public void invite(Player target, Clan clan) {
        invites.put(target.getUniqueId(), clan.getId());
        int timeout = plugin.getConfigManager().getConfig().getInt("clans.invite-timeout-seconds", 60);
        UUID id = target.getUniqueId();
        int clanId = clan.getId();
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (invites.getOrDefault(id, -1) == clanId) invites.remove(id);
        }, 20L * timeout);
    }

    public Optional<Clan> getInvite(UUID uuid) {
        Integer id = invites.get(uuid);
        return id == null ? Optional.empty() : Optional.ofNullable(clansById.get(id));
    }

    public void clearInvite(UUID uuid) {
        invites.remove(uuid);
    }

    // ----- Clan-Chat -----

    public boolean toggleChat(UUID uuid) {
        if (clanChat.remove(uuid)) return false;
        clanChat.add(uuid);
        return true;
    }

    public boolean isChatOn(UUID uuid) {
        return clanChat.contains(uuid);
    }

    /** Sendet eine Nachricht an alle ONLINE-Mitglieder des Spieler-Clans. */
    public void sendClanMessage(Player sender, String message) {
        Clan clan = getClanOf(sender.getUniqueId());
        if (clan == null) {
            plugin.getMessageManager().send(sender, "clan.not-in-clan");
            return;
        }
        String formatted = plugin.getMessageManager().get("clan.chat-format",
                "%clan%", clan.getName(), "%player%", sender.getName(), "%message%", message);
        for (UUID uuid : clan.getMembers().keySet()) {
            Player member = Bukkit.getPlayer(uuid);
            if (member != null) member.sendMessage(formatted);
        }
    }

    public void handleQuit(UUID uuid) {
        clanChat.remove(uuid);
        invites.remove(uuid);
    }
}
