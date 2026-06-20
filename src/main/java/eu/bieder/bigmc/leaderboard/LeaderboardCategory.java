package eu.bieder.bigmc.leaderboard;

import org.bukkit.Material;

/**
 * Kategorien der erweiterten Leaderboards.
 */
public enum LeaderboardCategory {
    MONEY("money", "&aGeld", Material.GOLD_INGOT),
    SHARDS("shards", "&dShards", Material.AMETHYST_SHARD),
    KILLS("kills", "&cKills", Material.DIAMOND_SWORD),
    DEATHS("deaths", "&7Tode", Material.SKELETON_SKULL),
    PRESTIGE("prestige", "&5Prestige", Material.NETHER_STAR),
    CLAN_POINTS("clanpoints", "&bClan-Punkte", Material.SHIELD),
    BATTLEPASS("battlepass", "&6Battle-Pass-Level", Material.EXPERIENCE_BOTTLE);

    public final String id;
    public final String display;
    public final Material icon;

    LeaderboardCategory(String id, String display, Material icon) {
        this.id = id;
        this.display = display;
        this.icon = icon;
    }

    public static LeaderboardCategory byId(String id) {
        for (LeaderboardCategory c : values()) {
            if (c.id.equalsIgnoreCase(id)) return c;
        }
        return null;
    }
}
