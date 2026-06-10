package eu.bieder.bigmc.spawner;

import org.bukkit.Material;
import org.bukkit.entity.EntityType;

/**
 * Beschreibt einen kaufbaren Spawner-Typ aus der config.yml.
 *
 * Ein Custom-Spawner spawnt KEINE Mobs, sondern produziert in festen
 * Abstaenden ein bestimmtes Item in seinen internen Speicher.
 *
 * @param id                Schluessel in der config (z.B. "knochen")
 * @param displayName       Anzeigename (mit Farbcodes)
 * @param product           produziertes Item
 * @param amountPerCycle    wie viele Items pro Produktionszyklus (je Stack-Einheit)
 * @param intervalSeconds   Abstand zwischen zwei Zyklen in Sekunden
 * @param maxStoragePerStack maximaler Speicher pro Stack-Einheit (Gesamtcap = * stackSize)
 * @param price             Kaufpreis pro Spawner
 * @param displayEntity     optionale, rein optische Figur im Spawner (oder null)
 */
public record SpawnerType(String id, String displayName, Material product,
                          int amountPerCycle, int intervalSeconds,
                          long maxStoragePerStack, double price,
                          EntityType displayEntity) {
}
