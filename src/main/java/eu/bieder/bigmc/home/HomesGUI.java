package eu.bieder.bigmc.home;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.util.GuiDesign;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * GUI fuer die Homes eines Spielers: ein Bett-Icon je Home.
 *  - Linksklick        -> teleportieren
 *  - Shift-Linksklick  -> Home loeschen
 */
public class HomesGUI implements Listener {

    public static class Holder implements InventoryHolder {
        private final Map<Integer, String> slots = new HashMap<>(); // Slot -> Home-Name
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public HomesGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player) {
        MessageManager msg = plugin.getMessageManager();
        List<HomeManager.Home> homes = plugin.getHomeManager().getHomes(player.getUniqueId());
        int limit = plugin.getPremiumService().getHomeLimit(player);

        int rows = Math.min(6, Math.max(3, (homes.size() + 8) / 9 + 2));
        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, rows * 9, msg.getRaw("home.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        int[] slots = innerSlots(rows);
        for (int i = 0; i < homes.size() && i < slots.length; i++) {
            HomeManager.Home home = homes.get(i);
            inv.setItem(slots[i], GuiDesign.named(Material.RED_BED, "&f&l" + home.name(),
                    List.of(
                            msg.getRaw("home.gui-world").replace("%world%", home.world()),
                            msg.getRaw("home.gui-coords")
                                    .replace("%x%", String.valueOf((int) home.x()))
                                    .replace("%y%", String.valueOf((int) home.y()))
                                    .replace("%z%", String.valueOf((int) home.z())),
                            "",
                            msg.getRaw("home.gui-click-tp"),
                            msg.getRaw("home.gui-click-delete"))));
            holder.slots.put(slots[i], home.name());
        }

        // Info-Item: Anzahl/Limit + Hinweis zum Setzen
        inv.setItem(4, GuiDesign.named(Material.NETHER_STAR, msg.getRaw("home.gui-info-name"),
                List.of(
                        msg.getRaw("home.gui-info-count")
                                .replace("%count%", String.valueOf(homes.size()))
                                .replace("%limit%", String.valueOf(limit)),
                        msg.getRaw("home.gui-info-set"))));

        player.openInventory(inv);
    }

    private int[] innerSlots(int rows) {
        int inner = (rows - 2) * 7;
        int[] slots = new int[inner];
        int idx = 0;
        for (int row = 1; row <= rows - 2; row++) {
            for (int col = 1; col <= 7; col++) {
                slots[idx++] = row * 9 + col;
            }
        }
        return slots;
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder holder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        String name = holder.slots.get(event.getSlot());
        if (name == null) return;
        MessageManager msg = plugin.getMessageManager();

        // Shift-Klick = loeschen
        if (event.isShiftClick()) {
            if (plugin.getHomeManager().deleteHome(player.getUniqueId(), name)) {
                GuiDesign.soundSuccess(player);
                msg.send(player, "home.deleted", "%name%", name);
                open(player); // GUI neu aufbauen
            }
            return;
        }

        // normaler Klick = teleportieren
        var home = plugin.getHomeManager().getHome(player.getUniqueId(), name);
        if (home.isEmpty()) return;
        var loc = plugin.getHomeManager().toLocation(home.get());
        if (loc.isEmpty()) {
            GuiDesign.soundError(player);
            msg.send(player, "home.world-missing");
            return;
        }
        player.closeInventory();
        teleport(player, loc.get(), name);
    }

    /** Gemeinsame Teleport-Logik (auch vom Command genutzt). */
    public void teleport(Player player, Location loc, String name) {
        player.setFallDistance(0f);
        player.teleport(loc);
        GuiDesign.soundSuccess(player);
        plugin.getMessageManager().send(player, "home.teleported", "%name%", name);
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
