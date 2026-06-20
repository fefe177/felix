package eu.bieder.bigmc.crate;

import org.bukkit.Material;

import java.util.List;
import java.util.Map;

/**
 * Eine moegliche Crate-Belohnung mit Gewicht (Drop-Chance) und Inhalt.
 *
 * @param weight   relatives Gewicht fuer die gewichtete Zufallsauswahl
 * @param rarity   Seltenheitsstufe (COMMON/RARE/EPIC/LEGENDARY) - nur Anzeige
 * @param display  Anzeigename (mit Farbcodes)
 * @param money    Geld-Belohnung
 * @param shards   Shards-Belohnung
 * @param items    Item-Belohnungen (Material -> Anzahl)
 * @param commands Konsolen-Befehle (%player% wird ersetzt)
 */
public record CrateReward(int weight, String rarity, String display,
                          double money, long shards,
                          Map<Material, Integer> items, List<String> commands) {
}
