package eu.bieder.bigmc.dailylogin;

import org.bukkit.Material;

import java.util.Map;

/**
 * Belohnung fuer einen Tag im Login-Zyklus.
 */
public record DailyReward(double money, long shards, Map<Material, Integer> items) {
}
