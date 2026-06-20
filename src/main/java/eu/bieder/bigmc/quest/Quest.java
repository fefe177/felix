package eu.bieder.bigmc.quest;

import org.bukkit.Material;

/**
 * Definition einer Quest (aus der config.yml geladen).
 *
 * @param id           eindeutiger Schluessel
 * @param period       Daily oder Weekly
 * @param objective    Art des Ziels
 * @param filter       Material-/EntityType-Filter (null/leer = beliebig)
 * @param amount       benoetigte Anzahl
 * @param display      Anzeigename (mit Farbcodes)
 * @param icon         GUI-Icon
 * @param rewardMoney  Geld-Belohnung
 * @param rewardShards Shards-Belohnung
 * @param rewardXp     Battle-Pass-XP-Belohnung
 */
public record Quest(String id, QuestPeriod period, QuestObjective objective, String filter,
                    int amount, String display, Material icon,
                    double rewardMoney, long rewardShards, int rewardXp) {

    /** Prueft, ob ein Ereignis (objective + Wert) zu dieser Quest passt. */
    public boolean matches(QuestObjective obj, String value) {
        if (obj != objective) return false;
        if (filter == null || filter.isEmpty()) return true;
        return value != null && filter.equalsIgnoreCase(value);
    }
}
