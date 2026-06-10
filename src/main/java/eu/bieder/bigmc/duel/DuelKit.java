package eu.bieder.bigmc.duel;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

/**
 * Vergibt das optionale Start-Kit fuer Duelle.
 *
 * In der config.yml kann unter "duel.kit" ein einfaches Kit aus Material-Namen
 * und Anzahl definiert werden. Ist die Liste leer oder "enabled: false",
 * starten die Spieler ohne Items (z.B. fuer reine "bring dein eigenes Zeug"-Duelle,
 * wobei das Inventar dann aber leer ist - sinnvoll meist mit Kit).
 */
public class DuelKit {

    private final BigMC plugin;

    public DuelKit(BigMC plugin) {
        this.plugin = plugin;
    }

    /**
     * Legt das konfigurierte Kit ins Inventar des Spielers (falls aktiviert).
     */
    public void applyKit(Player player) {
        ConfigurationSection kit = plugin.getConfigManager().getConfig()
                .getConfigurationSection("duel.kit");
        if (kit == null || !kit.getBoolean("enabled", true)) {
            return;
        }

        // Ruestung
        applyArmor(player, kit);

        // Hotbar-/Inventar-Items
        ConfigurationSection items = kit.getConfigurationSection("items");
        if (items != null) {
            for (String matName : items.getKeys(false)) {
                Material mat = Material.matchMaterial(matName);
                if (mat == null) {
                    plugin.getLogger().warning("Duell-Kit: unbekanntes Material '" + matName + "'.");
                    continue;
                }
                int amount = items.getInt(matName, 1);
                player.getInventory().addItem(new ItemStack(mat, amount));
            }
        }
    }

    /** Setzt die Ruestungsteile aus dem Kit. */
    private void applyArmor(Player player, ConfigurationSection kit) {
        ItemStack helmet = armorPiece(kit.getString("armor.helmet"));
        ItemStack chest = armorPiece(kit.getString("armor.chestplate"));
        ItemStack legs = armorPiece(kit.getString("armor.leggings"));
        ItemStack boots = armorPiece(kit.getString("armor.boots"));
        if (helmet != null) player.getInventory().setHelmet(helmet);
        if (chest != null) player.getInventory().setChestplate(chest);
        if (legs != null) player.getInventory().setLeggings(legs);
        if (boots != null) player.getInventory().setBoots(boots);
    }

    private ItemStack armorPiece(String matName) {
        if (matName == null || matName.isEmpty()) return null;
        Material mat = Material.matchMaterial(matName);
        if (mat == null) {
            plugin.getLogger().warning("Duell-Kit: unbekanntes Ruestungsteil '" + matName + "'.");
            return null;
        }
        return new ItemStack(mat);
    }
}
