package eu.bieder.bigmc.spawner;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;

import java.util.List;
import java.util.Map;

/**
 * Der Spawner-Shop: zeigt alle kaufbaren Spawner-Typen mit Preis.
 * Linksklick = 1 kaufen, Rechtsklick = 8 kaufen.
 */
public class SpawnerShopGUI implements Listener {

    /** Marker-Holder fuer den Spawner-Shop. */
    public static class Holder implements InventoryHolder {
        private Inventory inventory;
        @Override
        public Inventory getInventory() {
            return inventory;
        }
    }

    private final BigMC plugin;

    public SpawnerShopGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player) {
        MessageManager msg = plugin.getMessageManager();
        List<SpawnerType> types = plugin.getSpawnerManager().getTypes();

        int rows = Math.min(6, Math.max(1, (types.size() + 8) / 9));
        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, rows * 9, msg.getRaw("spawner.shop-title"));
        holder.inventory = inv;

        int slot = 0;
        for (SpawnerType type : types) {
            if (slot >= inv.getSize()) break;
            inv.setItem(slot++, displayItem(type));
        }
        player.openInventory(inv);
    }

    /** Bau-Anzeige eines Spawner-Typs im Shop (Spawner-Item + Preis-Lore). */
    private ItemStack displayItem(SpawnerType type) {
        MessageManager msg = plugin.getMessageManager();
        ItemStack item = plugin.getSpawnerManager().createSpawnerItem(type, 1);
        var meta = item.getItemMeta();
        if (meta != null) {
            List<String> lore = meta.hasLore() ? meta.getLore() : new java.util.ArrayList<>();
            lore.add("");
            lore.add(msg.getRaw("spawner.shop-price")
                    .replace("%price%", plugin.getEconomyManager().formatMoney(type.price())));
            lore.add(msg.getRaw("spawner.shop-click"));
            meta.setLore(lore);
            item.setItemMeta(meta);
        }
        return item;
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        List<SpawnerType> types = plugin.getSpawnerManager().getTypes();
        int index = event.getSlot();
        if (index < 0 || index >= types.size()) return;
        SpawnerType type = types.get(index);

        int amount = event.isRightClick() ? 8 : 1;
        buy(player, type, amount);
    }

    /** Kauft eine Anzahl Spawner: erst Geld abbuchen, dann Items geben. */
    private void buy(Player player, SpawnerType type, int amount) {
        MessageManager msg = plugin.getMessageManager();
        double total = type.price() * amount;

        if (!plugin.getEconomyManager().withdraw(player.getUniqueId(), total)) {
            msg.send(player, "economy.not-enough-money");
            return;
        }

        ItemStack item = plugin.getSpawnerManager().createSpawnerItem(type, amount);
        Map<Integer, ItemStack> leftover = player.getInventory().addItem(item);

        int notAdded = leftover.values().stream().mapToInt(ItemStack::getAmount).sum();
        if (notAdded > 0) {
            // Geld fuer nicht uebergebene Spawner erstatten
            plugin.getEconomyManager().deposit(player.getUniqueId(), type.price() * notAdded);
            msg.send(player, "spawner.shop-inventory-full");
        }
        int bought = amount - notAdded;
        if (bought > 0) {
            msg.send(player, "spawner.bought",
                    "%amount%", String.valueOf(bought),
                    "%type%", MessageManager.color(type.displayName()),
                    "%price%", plugin.getEconomyManager().formatMoney(type.price() * bought));
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
