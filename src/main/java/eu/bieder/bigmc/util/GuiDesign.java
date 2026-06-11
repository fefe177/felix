package eu.bieder.bigmc.util;

import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.inventory.meta.SkullMeta;

import java.util.List;

/**
 * Gemeinsame Design-Bausteine fuer alle Kisten-GUIs des Plugins.
 *
 * Einheitlicher Look:
 * - grauer Glasscheiben-Rahmen um jedes Fenster
 * - blaue Akzent-Scheiben in den Ecken
 * - Inhalte zentriert im Innenbereich
 */
public final class GuiDesign {

    /** Rahmen-Scheibe (grau, ohne sichtbaren Namen). */
    public static final Material FRAME = Material.GRAY_STAINED_GLASS_PANE;

    /** Akzent-Scheibe fuer Ecken (blau). */
    public static final Material ACCENT = Material.BLUE_STAINED_GLASS_PANE;

    private GuiDesign() {
    }

    /** Unsichtbar benannte Fueller-Scheibe. */
    public static ItemStack pane(Material material) {
        return named(material, " ", List.of());
    }

    /** Fuellt ALLE Slots eines Inventars mit der Rahmen-Scheibe. */
    public static void fillAll(Inventory inv) {
        ItemStack filler = pane(FRAME);
        for (int i = 0; i < inv.getSize(); i++) {
            inv.setItem(i, filler);
        }
    }

    /**
     * Fuellt nur den Rand (oberste/unterste Reihe + linke/rechte Spalte)
     * und setzt blaue Akzente in die vier Ecken.
     */
    public static void fillBorder(Inventory inv) {
        int size = inv.getSize();
        int rows = size / 9;
        ItemStack frame = pane(FRAME);
        ItemStack accent = pane(ACCENT);

        for (int i = 0; i < size; i++) {
            int row = i / 9;
            int col = i % 9;
            if (row == 0 || row == rows - 1 || col == 0 || col == 8) {
                inv.setItem(i, frame);
            }
        }
        // Ecken als Akzent
        inv.setItem(0, accent);
        inv.setItem(8, accent);
        inv.setItem(size - 9, accent);
        inv.setItem(size - 1, accent);

        // Zusaetzliche Akzente in der Mitte der Seitenraender (ab 4 Reihen)
        if (rows >= 4) {
            int midRow = rows / 2;
            inv.setItem(midRow * 9, accent);
            inv.setItem(midRow * 9 + 8, accent);
        }
    }

    /**
     * Spieler-Kopf mit Live-Kontostand (fuer Shop & Auktionshaus).
     */
    public static ItemStack balanceHead(Player player, String name, List<String> lore) {
        ItemStack head = new ItemStack(Material.PLAYER_HEAD);
        if (head.getItemMeta() instanceof SkullMeta meta) {
            meta.setOwningPlayer(player);
            meta.setDisplayName(MessageManager.color(name));
            if (lore != null && !lore.isEmpty()) meta.setLore(lore);
            head.setItemMeta(meta);
        }
        return head;
    }

    // ----- Sounds: einheitliches Klang-Feedback fuer alle GUIs -----

    /** Dezentes Klicken bei Navigation (Kategorie oeffnen, blaettern, zurueck). */
    public static void soundClick(Player player) {
        player.playSound(player.getLocation(), Sound.UI_BUTTON_CLICK, 0.4f, 1.0f);
    }

    /** Erfolgs-Sound bei Kauf/Verkauf/Abholen. */
    public static void soundSuccess(Player player) {
        player.playSound(player.getLocation(), Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 0.7f, 1.3f);
    }

    /** Fehler-Sound (zu wenig Geld, nichts zu verkaufen ...). */
    public static void soundError(Player player) {
        player.playSound(player.getLocation(), Sound.ENTITY_VILLAGER_NO, 0.8f, 1.0f);
    }

    /**
     * Gruener Fortschrittsbalken, z.B. fuer den Spawner-Speicher:
     * "▰▰▰▰▰▰▱▱▱▱ &e62%"
     */
    public static String progressBar(long value, long max) {
        int segments = 10;
        int filled = max > 0 ? (int) Math.round((double) value / max * segments) : 0;
        filled = Math.max(0, Math.min(segments, filled));
        int percent = max > 0 ? (int) Math.round((double) value / max * 100) : 0;
        StringBuilder sb = new StringBuilder("&a");
        for (int i = 0; i < filled; i++) sb.append('▰');
        sb.append("&8");
        for (int i = filled; i < segments; i++) sb.append('▱');
        sb.append(" &e").append(percent).append('%');
        return MessageManager.color(sb.toString());
    }

    /**
     * Liefert die mittig zentrierten Slots einer Reihe fuer "count" Elemente
     * (z.B. 3 Elemente in Reihe 1 -> Slots 12, 13, 14).
     */
    public static int[] centeredSlots(int row, int count) {
        count = Math.min(count, 7);
        int start = row * 9 + 1 + (7 - count) / 2;
        int[] slots = new int[count];
        for (int i = 0; i < count; i++) {
            slots[i] = start + i;
        }
        return slots;
    }

    /** ItemStack mit Name + Lore bauen (Farbcodes werden ersetzt). */
    public static ItemStack named(Material material, String name, List<String> lore) {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();
        if (meta != null) {
            if (name != null) meta.setDisplayName(MessageManager.color(name));
            if (lore != null && !lore.isEmpty()) meta.setLore(lore);
            stack.setItemMeta(meta);
        }
        return stack;
    }
}
