package eu.bieder.bigmc.cosmetics;

import org.bukkit.Material;

/**
 * Kategorien von Cosmetics.
 */
public enum CosmeticCategory {
    PARTICLE("particles", "&dPartikel-Effekte", Material.NETHER_STAR),
    TITLE("titles", "&eTitel", Material.NAME_TAG),
    JOIN_MESSAGE("join-messages", "&aJoin-Nachrichten", Material.PAPER);

    public final String configKey;
    public final String display;
    public final Material icon;

    CosmeticCategory(String configKey, String display, Material icon) {
        this.configKey = configKey;
        this.display = display;
        this.icon = icon;
    }
}
