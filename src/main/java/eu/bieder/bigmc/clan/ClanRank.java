package eu.bieder.bigmc.clan;

/**
 * Rang eines Spielers innerhalb seines Clans.
 * Hoeheres Gewicht = mehr Rechte.
 */
public enum ClanRank {
    MEMBER(1),
    ADMIN(2),
    OWNER(3);

    private final int weight;

    ClanRank(int weight) {
        this.weight = weight;
    }

    public int weight() {
        return weight;
    }

    /** Darf dieser Rang Mitglieder einladen/kicken? */
    public boolean canManageMembers() {
        return weight >= ADMIN.weight;
    }
}
