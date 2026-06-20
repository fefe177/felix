package eu.bieder.bigmc.boss;

import org.bukkit.Location;
import org.bukkit.entity.EntityType;

import java.util.Map;

/**
 * Definition eines Bosses aus der config.yml.
 *
 * @param id        eindeutiger Schluessel
 * @param display   Anzeigename (mit Farbcodes)
 * @param type      Mob-Typ (muss ein LivingEntity sein)
 * @param health    maximale Lebenspunkte
 * @param location  Spawn-Position (null = in der Naehe eines zufaelligen Spielers)
 * @param rewards   Belohnungen pro Platzierung (1 = bester Schaden)
 */
public record BossDefinition(String id, String display, EntityType type, double health,
                             Location location, Map<Integer, BossReward> rewards) {
}
