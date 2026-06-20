package eu.bieder.bigmc.crate;

import org.bukkit.Material;

import java.util.List;

/**
 * Eine Crate-Definition aus der config.yml.
 */
public record Crate(String id, String display, Material icon, List<CrateReward> rewards, int totalWeight) {
}
