package eu.bieder.bigmc.clan;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Ein Clan mit Mitgliedern, Punkten und Besitzer (im Arbeitsspeicher gehalten,
 * async in SQLite gespiegelt).
 */
public class Clan {

    /** Mitgliedsinfo: Rang + zuletzt bekannter Name. */
    public static class Member {
        public ClanRank rank;
        public String name;

        public Member(ClanRank rank, String name) {
            this.rank = rank;
            this.name = name;
        }
    }

    private final int id;
    private String name;
    private String tag;
    private UUID owner;
    private long points;
    private final Map<UUID, Member> members = new HashMap<>();

    public Clan(int id, String name, String tag, UUID owner, long points) {
        this.id = id;
        this.name = name;
        this.tag = tag;
        this.owner = owner;
        this.points = points;
    }

    public int getId() { return id; }
    public String getName() { return name; }
    public String getTag() { return tag; }
    public UUID getOwner() { return owner; }
    public long getPoints() { return points; }
    public Map<UUID, Member> getMembers() { return members; }

    public void setName(String name) { this.name = name; }
    public void setTag(String tag) { this.tag = tag; }
    public void setOwner(UUID owner) { this.owner = owner; }
    public void setPoints(long points) { this.points = points; }
    public void addPoints(long amount) { this.points += amount; }

    public int memberCount() { return members.size(); }

    public ClanRank rankOf(UUID uuid) {
        Member m = members.get(uuid);
        return m == null ? null : m.rank;
    }
}
