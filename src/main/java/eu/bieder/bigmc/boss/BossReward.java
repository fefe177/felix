package eu.bieder.bigmc.boss;

import org.bukkit.Material;

import java.util.Map;

/**
 * Belohnung fuer eine Platzierung in der Schadens-Rangliste eines Boss-Events.
 */
public record BossReward(double money, long shards, Map<Material, Integer> items) {
}
