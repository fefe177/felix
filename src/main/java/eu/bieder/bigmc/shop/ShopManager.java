package eu.bieder.bigmc.shop;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Laedt und verwaltet alle Shop-Kategorien und Item-Preise aus der config.yml.
 *
 * Der Shop ist ein reiner Adminshop mit festen Preisen:
 * - "buy"  = was der Spieler beim Kauf zahlt
 * - "sell" = was der Spieler beim Verkauf erhaelt (0 oder fehlend = unverkaeuflich)
 * Die Verkaufspreise werden auch von /sell hand und /sell all benutzt.
 */
public class ShopManager {

    /** Ein einzelnes kaufbares/verkaufbares Item. */
    public record ShopItem(Material material, double buyPrice, double sellPrice) {
        public boolean canBuy()  { return buyPrice  > 0; }
        public boolean canSell() { return sellPrice > 0; }
    }

    /** Eine Kategorie im Hauptmenue (z.B. Bloecke, Erze ...). */
    public record Category(String id, String displayName, Material icon, List<ShopItem> items) {
    }

    private final BigMC plugin;

    /** Alle Kategorien in Config-Reihenfolge. */
    private final Map<String, Category> categories = new LinkedHashMap<>();

    /** Schneller Zugriff: Material -> Verkaufspreis (fuer /sell). */
    private final Map<Material, Double> sellPrices = new LinkedHashMap<>();

    public ShopManager(BigMC plugin) {
        this.plugin = plugin;
        loadFromConfig();
    }

    /**
     * Liest alle Kategorien und Preise aus der config.yml ein.
     */
    public void loadFromConfig() {
        categories.clear();
        sellPrices.clear();

        ConfigurationSection root = plugin.getConfigManager().getConfig()
                .getConfigurationSection("shop.categories");
        if (root == null) {
            plugin.getLogger().warning("Keine Shop-Kategorien in der config.yml gefunden (shop.categories).");
            return;
        }

        for (String id : root.getKeys(false)) {
            ConfigurationSection cat = root.getConfigurationSection(id);
            if (cat == null) continue;

            String displayName = cat.getString("name", id);
            Material icon = parseMaterial(cat.getString("icon", "CHEST"), "Icon von Kategorie " + id);
            if (icon == null) icon = Material.CHEST;

            List<ShopItem> items = new ArrayList<>();
            ConfigurationSection itemSec = cat.getConfigurationSection("items");
            if (itemSec != null) {
                for (String matName : itemSec.getKeys(false)) {
                    Material mat = parseMaterial(matName, "Item in Kategorie " + id);
                    if (mat == null) continue;
                    double buy = itemSec.getDouble(matName + ".buy", 0);
                    double sell = itemSec.getDouble(matName + ".sell", 0);
                    items.add(new ShopItem(mat, buy, sell));
                    if (sell > 0) {
                        sellPrices.put(mat, sell);
                    }
                }
            }
            categories.put(id, new Category(id, displayName, icon, items));
        }
        plugin.getLogger().info("Shop geladen: " + categories.size() + " Kategorien, "
                + sellPrices.size() + " verkaufbare Items.");
    }

    /** Wandelt einen Material-Namen aus der Config sicher um (loggt Fehler). */
    private Material parseMaterial(String name, String context) {
        Material mat = Material.matchMaterial(name);
        if (mat == null) {
            plugin.getLogger().warning("Unbekanntes Material '" + name + "' (" + context + ") - wird uebersprungen.");
        }
        return mat;
    }

    public List<Category> getCategories() {
        return List.copyOf(categories.values());
    }

    public Optional<Category> getCategory(String id) {
        return Optional.ofNullable(categories.get(id));
    }

    /**
     * Verkaufspreis fuer ein Material (leer, wenn unverkaeuflich).
     */
    public Optional<Double> getSellPrice(Material material) {
        return Optional.ofNullable(sellPrices.get(material));
    }
}
