package eu.bieder.bigmc.drill;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

import java.util.List;

/**
 * Verwaltet die Drill-Spitzhacke.
 *
 * Die Drill ist eine normale Spitzhacke mit einer PDC-Markierung. Der
 * DrillListener erkennt sie daran und baut beim Abbauen einen 3x3-Bereich ab -
 * je nach Blickrichtung als senkrechte Wand (normales Graben) oder als
 * waagerechtes 3x3-Loch (wenn man nach unten/oben schaut).
 */
public class DrillManager {

    private final BigMC plugin;

    /** PDC-Schluessel, der ein Item als Drill markiert. */
    private final NamespacedKey drillKey;

    public DrillManager(BigMC plugin) {
        this.plugin = plugin;
        this.drillKey = new NamespacedKey(plugin, "drill");
    }

    /** Erstellt eine Drill-Spitzhacke (Material/Name aus Code, Preis aus config). */
    public ItemStack createDrill() {
        Material mat = Material.matchMaterial(
                plugin.getConfigManager().getConfig().getString("drill.material", "DIAMOND_PICKAXE"));
        if (mat == null) mat = Material.DIAMOND_PICKAXE;

        ItemStack item = new ItemStack(mat);
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            meta.setDisplayName(MessageManager.color("&b&lDrill-Spitzhacke"));
            meta.setLore(List.of(
                    MessageManager.color("&7Baut einen &e3x3&7-Bereich ab."),
                    MessageManager.color("&7Nach unten schauen = &e3x3-Loch nach unten."),
                    MessageManager.color("&8BigMC Drill")));
            meta.getPersistentDataContainer().set(drillKey, PersistentDataType.BYTE, (byte) 1);
            item.setItemMeta(meta);
        }
        return item;
    }

    /** Prueft, ob ein Item eine Drill-Spitzhacke ist. */
    public boolean isDrill(ItemStack item) {
        if (item == null || !item.hasItemMeta()) return false;
        PersistentDataContainer pdc = item.getItemMeta().getPersistentDataContainer();
        Byte flag = pdc.get(drillKey, PersistentDataType.BYTE);
        return flag != null && flag == (byte) 1;
    }

    public double getPrice() {
        return plugin.getConfigManager().getConfig().getDouble("drill.price", 50000.0);
    }

    public int getDurabilityPerBlock() {
        return plugin.getConfigManager().getConfig().getInt("drill.durability-per-block", 1);
    }
}
