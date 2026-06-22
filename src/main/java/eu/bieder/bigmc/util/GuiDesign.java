package eu.bieder.bigmc.util;

import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.inventory.meta.SkullMeta;

import java.util.List;
import java.util.Locale;

/**
 * Gemeinsame Design-Bausteine fuer alle Kisten-GUIs (DonutSMP-/HugoSMP-Stil).
 *
 * Look & Feel:
 * - durchgehend schwarzer Glas-Rahmen (clean, kein bunter Akzent)
 * - alle Items "aufgeraeumt": keine Attribut-/Enchant-/Zusatz-Tooltips
 * - Glanz-Effekt (glow) fuer ausgewaehlte/aktive Eintraege
 * - kurze Zahlenformate (1.2k / 3.4m / 5.6b)
 * - einheitliche Klick-Sounds
 */
public final class GuiDesign {

    /** Rahmen-Scheibe (schwarz, ohne sichtbaren Namen). */
    public static final Material FRAME = Material.BLACK_STAINED_GLASS_PANE;

    /** Akzent-Scheibe (ebenfalls schwarz - cohesiver, ruhiger Look). */
    public static final Material ACCENT = Material.BLACK_STAINED_GLASS_PANE;

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
     * Fuellt nur den Rand (oberste/unterste Reihe + linke/rechte Spalte) mit
     * schwarzen Scheiben - der Innenbereich bleibt frei (cleaner Donut-Look).
     */
    public static void fillBorder(Inventory inv) {
        int size = inv.getSize();
        int rows = size / 9;
        ItemStack frame = pane(FRAME);
        for (int i = 0; i < size; i++) {
            int row = i / 9;
            int col = i % 9;
            if (row == 0 || row == rows - 1 || col == 0 || col == 8) {
                inv.setItem(i, frame);
            }
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
            applyCleanFlags(meta);
            head.setItemMeta(meta);
        }
        return head;
    }

    // ----- Sounds -----

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
     * Schlanker Fortschrittsbalken im Donut-Stil:
     * "&a❙❙❙❙❙❙&8❙❙❙❙ &7(62%)"
     */
    public static String progressBar(long value, long max) {
        int segments = 10;
        int filled = max > 0 ? (int) Math.round((double) value / max * segments) : 0;
        filled = Math.max(0, Math.min(segments, filled));
        int percent = max > 0 ? (int) Math.round((double) value / max * 100) : 0;
        StringBuilder sb = new StringBuilder("&a");
        for (int i = 0; i < filled; i++) sb.append('❙');
        sb.append("&8");
        for (int i = filled; i < segments; i++) sb.append('❙');
        sb.append(" &7(").append(percent).append("%)");
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

    /** ItemStack mit Name + Lore bauen (Farbcodes ersetzt, aufgeraeumte Tooltips). */
    public static ItemStack named(Material material, String name, List<String> lore) {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();
        if (meta != null) {
            if (name != null) meta.setDisplayName(MessageManager.color(name));
            if (lore != null && !lore.isEmpty()) meta.setLore(lore);
            applyCleanFlags(meta);
            stack.setItemMeta(meta);
        }
        return stack;
    }

    /**
     * Fuegt einem Item einen Glanz-Effekt hinzu (ohne sichtbaren Enchant-Text)
     * - fuer ausgewaehlte/aktive Eintraege (z.B. ausgeruestetes Cosmetic).
     */
    public static ItemStack glow(ItemStack item) {
        if (item == null) return null;
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            meta.addEnchant(Enchantment.UNBREAKING, 1, true);
            meta.addItemFlags(ItemFlag.HIDE_ENCHANTS);
            item.setItemMeta(meta);
        }
        return item;
    }

    /** Versteckt alle Attribut-/Enchant-/Zusatz-Tooltips fuer einen cleanen Look. */
    private static void applyCleanFlags(ItemMeta meta) {
        meta.addItemFlags(
                ItemFlag.HIDE_ATTRIBUTES,
                ItemFlag.HIDE_ENCHANTS,
                ItemFlag.HIDE_UNBREAKABLE,
                ItemFlag.HIDE_DYE,
                ItemFlag.HIDE_ADDITIONAL_TOOLTIP);
    }

    /**
     * Kuerzt grosse Zahlen DonutSMP-typisch ab: 1.2k, 3.4m, 5.6b, 7.8t.
     */
    public static String shortNumber(double value) {
        double abs = Math.abs(value);
        String[] suffix = {"", "k", "m", "b", "t"};
        int idx = 0;
        while (abs >= 1000 && idx < suffix.length - 1) {
            abs /= 1000;
            idx++;
        }
        String num;
        if (idx == 0) {
            num = String.valueOf(Math.round(abs));
        } else {
            num = String.format(Locale.US, "%.1f", abs);
            if (num.endsWith(".0")) num = num.substring(0, num.length() - 2);
        }
        return (value < 0 ? "-" : "") + num + suffix[idx];
    }
}
