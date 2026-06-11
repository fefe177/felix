package eu.bieder.bigmc.spawn;

import org.bukkit.Material;

import java.util.List;

/**
 * Eine Material-Palette + Beschreibung fuer ein Spawn-Design.
 *
 * Alle 5 Spawn-Themes teilen sich dasselbe detailreiche Layout
 * (Plaza, Mittelpunkt, 4 Haeuser, 4 Staende, Lampen, Mauer mit Toren) -
 * der SpawnAreaBuilder setzt nur jeweils die hier definierten Bloecke.
 *
 * Erstellt wird ein Theme ueber den {@link Builder} (gut lesbar).
 */
public class SpawnTheme {

    public final String id;
    public final String name;
    public final Material icon;
    public final List<String> description;

    // Boden / Plaza
    public final Material floor1, floor2, floor3, pathA, pathB, ring, foundation;
    // Stadtmauer + Beleuchtung
    public final Material wallBase, wallTop, wallPillar, light;
    // Mittelpunkt (liquid == null -> fester Block statt Wasser/Lava)
    public final Material liquid, centerTop;
    // Haeuser
    public final Material houseFill, houseBeam, houseFloor, roofStair, roofFill, door;
    // Lampenpfosten
    public final Material lampPost;
    // Marktstand-Markisen
    public final Material stall1, stall2, stall3, stall4;

    private SpawnTheme(Builder b) {
        this.id = b.id; this.name = b.name; this.icon = b.icon; this.description = b.description;
        this.floor1 = b.floor1; this.floor2 = b.floor2; this.floor3 = b.floor3;
        this.pathA = b.pathA; this.pathB = b.pathB; this.ring = b.ring; this.foundation = b.foundation;
        this.wallBase = b.wallBase; this.wallTop = b.wallTop; this.wallPillar = b.wallPillar; this.light = b.light;
        this.liquid = b.liquid; this.centerTop = b.centerTop;
        this.houseFill = b.houseFill; this.houseBeam = b.houseBeam; this.houseFloor = b.houseFloor;
        this.roofStair = b.roofStair; this.roofFill = b.roofFill; this.door = b.door;
        this.lampPost = b.lampPost;
        this.stall1 = b.stall1; this.stall2 = b.stall2; this.stall3 = b.stall3; this.stall4 = b.stall4;
    }

    public static Builder builder(String id, String name, Material icon) {
        return new Builder(id, name, icon);
    }

    /** Fluent-Builder fuer gut lesbare Theme-Definitionen. */
    public static class Builder {
        private final String id, name;
        private final Material icon;
        private List<String> description = List.of();
        private Material floor1, floor2, floor3, pathA, pathB, ring, foundation;
        private Material wallBase, wallTop, wallPillar, light;
        private Material liquid, centerTop;
        private Material houseFill, houseBeam, houseFloor, roofStair, roofFill, door;
        private Material lampPost;
        private Material stall1, stall2, stall3, stall4;

        private Builder(String id, String name, Material icon) {
            this.id = id; this.name = name; this.icon = icon;
        }

        public Builder desc(String... lines) { this.description = List.of(lines); return this; }
        public Builder floor(Material a, Material b, Material c) { floor1 = a; floor2 = b; floor3 = c; return this; }
        public Builder path(Material a, Material b) { pathA = a; pathB = b; return this; }
        public Builder ring(Material m) { ring = m; return this; }
        public Builder foundation(Material m) { foundation = m; return this; }
        public Builder wall(Material base, Material top, Material pillar, Material lightMat) {
            wallBase = base; wallTop = top; wallPillar = pillar; light = lightMat; return this;
        }
        public Builder center(Material liquidOrNull, Material top) { liquid = liquidOrNull; centerTop = top; return this; }
        public Builder house(Material fill, Material beam, Material floorMat, Material stair, Material fillRoof, Material doorMat) {
            houseFill = fill; houseBeam = beam; houseFloor = floorMat; roofStair = stair; roofFill = fillRoof; door = doorMat; return this;
        }
        public Builder lamp(Material post) { lampPost = post; return this; }
        public Builder stalls(Material a, Material b, Material c, Material d) { stall1 = a; stall2 = b; stall3 = c; stall4 = d; return this; }

        public SpawnTheme build() { return new SpawnTheme(this); }
    }
}
