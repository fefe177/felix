package eu.bieder.bigmc.core;

import org.bukkit.inventory.ItemStack;
import org.bukkit.util.io.BukkitObjectInputStream;
import org.bukkit.util.io.BukkitObjectOutputStream;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Serialisiert ganze Inventar-Inhalte (ItemStack-Arrays) nach/aus Bytes.
 *
 * Leere Slots (null) bleiben erhalten, damit die Slot-Positionen exakt
 * wiederhergestellt werden (wichtig fuer die virtuelle Enderchest).
 */
public final class ItemSerializer {

    private ItemSerializer() {
    }

    /** Wandelt ein ItemStack-Array in Bytes (inkl. Laenge und leerer Slots). */
    public static byte[] toBytes(ItemStack[] items) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (BukkitObjectOutputStream oos = new BukkitObjectOutputStream(out)) {
            oos.writeInt(items.length);
            for (ItemStack item : items) {
                oos.writeObject(item);
            }
        }
        return out.toByteArray();
    }

    /** Liest ein ItemStack-Array aus Bytes zurueck. */
    public static ItemStack[] fromBytes(byte[] data) throws IOException, ClassNotFoundException {
        try (BukkitObjectInputStream ois = new BukkitObjectInputStream(new ByteArrayInputStream(data))) {
            int length = ois.readInt();
            ItemStack[] items = new ItemStack[length];
            for (int i = 0; i < length; i++) {
                items[i] = (ItemStack) ois.readObject();
            }
            return items;
        }
    }
}
