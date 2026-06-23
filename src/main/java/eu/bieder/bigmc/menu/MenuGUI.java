package eu.bieder.bigmc.menu;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.util.GuiDesign;
import org.bukkit.Bukkit;
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
 * Zentrales Hauptmenue (/menu): ein klickbares Icon je Feature. Ein Klick
 * fuehrt den passenden Befehl aus (der wiederum sein GUI oeffnet bzw. die
 * Aktion ausloest) - so ist jedes System mit der Maus erreichbar.
 */
public class MenuGUI implements Listener {

    /** Ein Menue-Eintrag: Icon, Anzeigename (messages-Key) und auszufuehrender Befehl. */
    private record Entry(Material icon, String key, String command) {
    }

    private static final int SLOT_CLOSE = 49;

    /** Reihenfolge der Eintraege im Menue (werden mittig in die Innenslots gelegt). */
    private static final List<Entry> ENTRIES = List.of(
            new Entry(Material.EMERALD,            "menu.shop",        "shop"),
            new Entry(Material.GOLD_INGOT,         "menu.ah",          "ah"),
            new Entry(Material.SPAWNER,            "menu.spawnershop", "spawnershop"),
            new Entry(Material.WRITABLE_BOOK,      "menu.quests",      "quests"),
            new Entry(Material.NETHER_STAR,        "menu.battlepass",  "battlepass"),
            new Entry(Material.CHEST,              "menu.crate",       "crate"),
            new Entry(Material.FIREWORK_ROCKET,    "menu.cosmetics",   "cosmetics"),
            new Entry(Material.EXPERIENCE_BOTTLE,  "menu.prestige",    "prestige"),
            new Entry(Material.WHITE_BANNER,       "menu.clan",        "clan"),
            new Entry(Material.OAK_SIGN,           "menu.leaderboard", "leaderboard"),
            new Entry(Material.SUNFLOWER,          "menu.dailyreward", "dailyreward"),
            new Entry(Material.BOOK,               "menu.stats",       "stats"),
            new Entry(Material.GOLDEN_HELMET,      "menu.ranks",       "ranks"),
            new Entry(Material.PAPER,              "menu.vote",        "vote"),
            new Entry(Material.COMPASS,            "menu.rtp",         "rtp"),
            new Entry(Material.RED_BED,            "menu.home",        "home"),
            new Entry(Material.ENDER_CHEST,        "menu.enderchest",  "ec"),
            new Entry(Material.LODESTONE,          "menu.spawn",       "spawn"),
            new Entry(Material.CLOCK,              "menu.afk",         "afk"),
            new Entry(Material.AMETHYST_SHARD,     "menu.shards",      "shards"),
            new Entry(Material.GOLD_NUGGET,        "menu.money",       "baltop"));

    public static class Holder implements InventoryHolder {
        private final Map<Integer, String> commands = new HashMap<>();
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public MenuGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player) {
        MessageManager msg = plugin.getMessageManager();
        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, 54, msg.getRaw("menu.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        int[] slots = innerSlots();
        for (int i = 0; i < ENTRIES.size() && i < slots.length; i++) {
            Entry e = ENTRIES.get(i);
            inv.setItem(slots[i], GuiDesign.named(e.icon(), msg.getRaw(e.key()),
                    List.of(msg.getRaw("menu.lore"))));
            holder.commands.put(slots[i], e.command());
        }

        inv.setItem(SLOT_CLOSE, GuiDesign.named(Material.BARRIER, msg.getRaw("menu.close"), List.of()));
        player.openInventory(inv);
    }

    /** Innenbereich (Reihen 1-4, Spalten 1-7) = 28 Slots. */
    private int[] innerSlots() {
        int[] slots = new int[28];
        int idx = 0;
        for (int row = 1; row <= 4; row++) {
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

        if (event.getSlot() == SLOT_CLOSE) {
            GuiDesign.soundClick(player);
            player.closeInventory();
            return;
        }
        String command = holder.commands.get(event.getSlot());
        if (command == null) return;
        GuiDesign.soundClick(player);
        player.closeInventory();
        // Der jeweilige Befehl oeffnet sein eigenes GUI bzw. fuehrt die Aktion aus.
        player.performCommand(command);
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
