package eu.bieder.bigmc.drill;

import eu.bieder.bigmc.BigMC;
import org.bukkit.GameMode;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.Damageable;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.util.Vector;

/**
 * Baut mit der Drill-Spitzhacke einen 3x3-Bereich ab.
 *
 * Die Ebene des 3x3-Bereichs richtet sich nach der Blickrichtung des Spielers:
 * - Blick nach unten/oben (Y dominiert)  -> waagerechtes 3x3 = Loch nach unten
 * - Blick nach Norden/Sueden (Z dominiert) -> senkrechte Wand in X-Y
 * - Blick nach Osten/Westen (X dominiert)  -> senkrechte Wand in Y-Z
 */
public class DrillListener implements Listener {

    private final BigMC plugin;

    /** Schutz gegen Rekursion, falls das Brechen weitere Events ausloesen wuerde. */
    private boolean processing = false;

    public DrillListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler(ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        if (processing) return;

        Player player = event.getPlayer();
        // Nur im Ueberlebensmodus (im Kreativ bricht man ohnehin sofort)
        if (player.getGameMode() != GameMode.SURVIVAL) return;

        ItemStack tool = player.getInventory().getItemInMainHand();
        if (!plugin.getDrillManager().isDrill(tool)) return;

        // Ebene anhand der Blickrichtung bestimmen
        Vector dir = player.getEyeLocation().getDirection();
        double ax = Math.abs(dir.getX());
        double ay = Math.abs(dir.getY());
        double az = Math.abs(dir.getZ());

        Block center = event.getBlock();
        int broken = 0;

        processing = true;
        try {
            if (ay >= ax && ay >= az) {
                // Blick nach oben/unten -> waagerechtes 3x3 (Loch nach unten)
                for (int dx = -1; dx <= 1; dx++) {
                    for (int dz = -1; dz <= 1; dz++) {
                        if (dx == 0 && dz == 0) continue;
                        if (tryBreak(center.getRelative(dx, 0, dz), tool)) broken++;
                    }
                }
            } else if (az >= ax) {
                // Blick nach Norden/Sueden -> senkrechte Wand in X-Y
                for (int dx = -1; dx <= 1; dx++) {
                    for (int dy = -1; dy <= 1; dy++) {
                        if (dx == 0 && dy == 0) continue;
                        if (tryBreak(center.getRelative(dx, dy, 0), tool)) broken++;
                    }
                }
            } else {
                // Blick nach Osten/Westen -> senkrechte Wand in Y-Z
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dz = -1; dz <= 1; dz++) {
                        if (dy == 0 && dz == 0) continue;
                        if (tryBreak(center.getRelative(0, dy, dz), tool)) broken++;
                    }
                }
            }
        } finally {
            processing = false;
        }

        // Zusaetzlichen Werkzeug-Verschleiss anwenden
        if (broken > 0) {
            applyDurability(player, broken);
        }
    }

    /**
     * Bricht einen Block, sofern er sinnvoll abbaubar ist.
     * @return true, wenn der Block gebrochen wurde
     */
    private boolean tryBreak(Block block, ItemStack tool) {
        Material type = block.getType();
        if (type.isAir() || block.isLiquid()) return false;
        // Unzerstoerbare Bloecke (Bedrock etc.) haben eine Haerte < 0
        if (type.getHardness() < 0) return false;
        // Custom-Spawner NICHT per Drill brechen (wuerde die Datenbank umgehen)
        if (type == Material.SPAWNER) return false;

        // Bricht den Block "natuerlich" inkl. passender Drops fuer das Werkzeug.
        // breakNaturally loest KEIN BlockBreakEvent aus -> keine Rekursion.
        block.breakNaturally(tool);
        return true;
    }

    /**
     * Fuegt der Drill je gebrochenem Zusatzblock Verschleiss zu (config).
     * Bei 0 oder unzerbrechlichem Werkzeug passiert nichts.
     */
    private void applyDurability(Player player, int extraBlocks) {
        int perBlock = plugin.getDrillManager().getDurabilityPerBlock();
        if (perBlock <= 0) return;

        ItemStack tool = player.getInventory().getItemInMainHand();
        if (!(tool.getItemMeta() instanceof Damageable dmg) || dmg.isUnbreakable()) return;

        int max = tool.getType().getMaxDurability();
        if (max <= 0) return;

        int newDamage = dmg.getDamage() + extraBlocks * perBlock;
        if (newDamage >= max) {
            // Werkzeug ist verbraucht -> entfernen + Bruch-Geraeusch
            player.getInventory().setItemInMainHand(null);
            player.getWorld().playSound(player.getLocation(),
                    org.bukkit.Sound.ENTITY_ITEM_BREAK, 1f, 1f);
        } else {
            dmg.setDamage(newDamage);
            tool.setItemMeta((ItemMeta) dmg);
        }
    }
}
