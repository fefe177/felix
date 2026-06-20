package eu.bieder.bigmc.cosmetics;

import org.bukkit.Material;

/**
 * Ein einzelnes Cosmetic.
 *
 * @param id       eindeutiger Schluessel innerhalb der Kategorie
 * @param category Kategorie
 * @param display  Anzeigename (mit Farbcodes)
 * @param icon     GUI-Icon
 * @param value    Effektwert (Partikel-Name / Titel-Text / Join-Vorlage)
 */
public record Cosmetic(String id, CosmeticCategory category, String display, Material icon, String value) {
}
