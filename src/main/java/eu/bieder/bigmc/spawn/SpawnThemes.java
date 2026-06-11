package eu.bieder.bigmc.spawn;

import org.bukkit.Material;

import java.util.List;
import java.util.Optional;

/**
 * Definiert die 5 auswaehlbaren Spawn-Designs.
 */
public final class SpawnThemes {

    private static final List<SpawnTheme> THEMES = List.of(

            // 1) Mittelalterlicher Markt
            SpawnTheme.builder("medieval", "&6&lMittelalterlicher Markt", Material.OAK_DOOR)
                    .desc("&7Fachwerkhaeuser, Kopfstein-", "&7pflaster und ein Brunnen.")
                    .floor(Material.COBBLESTONE, Material.MOSSY_COBBLESTONE, Material.STONE_BRICKS)
                    .path(Material.COBBLESTONE, Material.GRAVEL)
                    .ring(Material.STONE_BRICKS).foundation(Material.COBBLESTONE)
                    .wall(Material.STONE_BRICKS, Material.STONE_BRICK_WALL, Material.STONE_BRICKS, Material.LANTERN)
                    .center(Material.WATER, Material.SEA_LANTERN)
                    .house(Material.WHITE_TERRACOTTA, Material.DARK_OAK_LOG, Material.SPRUCE_PLANKS,
                            Material.SPRUCE_STAIRS, Material.SPRUCE_PLANKS, Material.SPRUCE_DOOR)
                    .lamp(Material.COBBLESTONE_WALL)
                    .stalls(Material.RED_WOOL, Material.YELLOW_WOOL, Material.BLUE_WOOL, Material.GREEN_WOOL)
                    .build(),

            // 2) Wuesten-Oase
            SpawnTheme.builder("desert", "&e&lWuesten-Oase", Material.SANDSTONE)
                    .desc("&7Sandstein, Akazienholz und", "&7ein kuehlendes Wasserbecken.")
                    .floor(Material.SMOOTH_SANDSTONE, Material.SANDSTONE, Material.CUT_SANDSTONE)
                    .path(Material.CUT_SANDSTONE, Material.SMOOTH_SANDSTONE)
                    .ring(Material.CHISELED_SANDSTONE).foundation(Material.SANDSTONE)
                    .wall(Material.CUT_SANDSTONE, Material.SANDSTONE_WALL, Material.SANDSTONE, Material.LANTERN)
                    .center(Material.WATER, Material.SEA_LANTERN)
                    .house(Material.SMOOTH_SANDSTONE, Material.CUT_SANDSTONE, Material.SANDSTONE,
                            Material.SANDSTONE_STAIRS, Material.SMOOTH_SANDSTONE, Material.ACACIA_DOOR)
                    .lamp(Material.SANDSTONE_WALL)
                    .stalls(Material.ORANGE_WOOL, Material.YELLOW_WOOL, Material.RED_WOOL, Material.WHITE_WOOL)
                    .build(),

            // 3) Verschneites Dorf
            SpawnTheme.builder("snowy", "&b&lVerschneites Dorf", Material.SNOW_BLOCK)
                    .desc("&7Fichtenholz, Schnee und", "&7glitzerndes Packeis.")
                    .floor(Material.SNOW_BLOCK, Material.STONE_BRICKS, Material.PACKED_ICE)
                    .path(Material.SNOW_BLOCK, Material.STONE_BRICKS)
                    .ring(Material.PACKED_ICE).foundation(Material.STONE_BRICKS)
                    .wall(Material.STONE_BRICKS, Material.STONE_BRICK_WALL, Material.STONE_BRICKS, Material.LANTERN)
                    .center(Material.WATER, Material.SEA_LANTERN)
                    .house(Material.SPRUCE_PLANKS, Material.SPRUCE_LOG, Material.SPRUCE_PLANKS,
                            Material.SPRUCE_STAIRS, Material.SPRUCE_PLANKS, Material.SPRUCE_DOOR)
                    .lamp(Material.SPRUCE_FENCE)
                    .stalls(Material.WHITE_WOOL, Material.LIGHT_BLUE_WOOL, Material.CYAN_WOOL, Material.BLUE_WOOL)
                    .build(),

            // 4) Nether-Festung
            SpawnTheme.builder("nether", "&c&lNether-Festung", Material.NETHER_BRICKS)
                    .desc("&7Netherziegel, Blackstone", "&7und ein Lava-Brunnen.")
                    .floor(Material.NETHER_BRICKS, Material.RED_NETHER_BRICKS, Material.BLACKSTONE)
                    .path(Material.BLACKSTONE, Material.POLISHED_BLACKSTONE)
                    .ring(Material.CHISELED_NETHER_BRICKS).foundation(Material.NETHER_BRICKS)
                    .wall(Material.NETHER_BRICKS, Material.NETHER_BRICK_WALL, Material.NETHER_BRICKS, Material.SOUL_LANTERN)
                    .center(Material.LAVA, Material.SHROOMLIGHT)
                    .house(Material.NETHER_BRICKS, Material.POLISHED_BLACKSTONE, Material.BLACKSTONE,
                            Material.NETHER_BRICK_STAIRS, Material.NETHER_BRICKS, Material.CRIMSON_DOOR)
                    .lamp(Material.NETHER_BRICK_FENCE)
                    .stalls(Material.NETHER_WART_BLOCK, Material.WARPED_WART_BLOCK, Material.RED_WOOL, Material.BLACK_WOOL)
                    .build(),

            // 5) End-/Himmelsinsel
            SpawnTheme.builder("end", "&5&lEnd-Insel", Material.END_STONE_BRICKS)
                    .desc("&7Endstein, Purpur und", "&7leuchtende Seelaternen.")
                    .floor(Material.END_STONE_BRICKS, Material.END_STONE, Material.PURPUR_BLOCK)
                    .path(Material.PURPUR_BLOCK, Material.END_STONE_BRICKS)
                    .ring(Material.PURPUR_PILLAR).foundation(Material.END_STONE)
                    .wall(Material.END_STONE_BRICKS, Material.END_STONE_BRICK_WALL, Material.PURPUR_PILLAR, Material.SEA_LANTERN)
                    .center(null, Material.SEA_LANTERN)
                    .house(Material.END_STONE_BRICKS, Material.PURPUR_PILLAR, Material.END_STONE_BRICKS,
                            Material.PURPUR_STAIRS, Material.PURPUR_BLOCK, Material.WARPED_DOOR)
                    .lamp(Material.END_STONE_BRICK_WALL)
                    .stalls(Material.MAGENTA_WOOL, Material.PURPLE_WOOL, Material.PINK_WOOL, Material.WHITE_WOOL)
                    .build()
    );

    private SpawnThemes() {
    }

    public static List<SpawnTheme> all() {
        return THEMES;
    }

    public static Optional<SpawnTheme> byId(String id) {
        return THEMES.stream().filter(t -> t.id.equalsIgnoreCase(id)).findFirst();
    }
}
