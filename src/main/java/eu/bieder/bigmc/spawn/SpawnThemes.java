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
                    .build(),

            // 6) Pilz-Insel
            SpawnTheme.builder("mushroom", "&d&lPilz-Insel", Material.RED_MUSHROOM_BLOCK)
                    .desc("&7Myzel, riesige Pilze und", "&7leuchtende Pilzlichter.")
                    .floor(Material.MYCELIUM, Material.MOSS_BLOCK, Material.PODZOL)
                    .path(Material.MOSS_BLOCK, Material.PODZOL)
                    .ring(Material.MUSHROOM_STEM).foundation(Material.DIRT)
                    .wall(Material.MUSHROOM_STEM, Material.RED_MUSHROOM_BLOCK, Material.MUSHROOM_STEM, Material.SHROOMLIGHT)
                    .center(Material.WATER, Material.SHROOMLIGHT)
                    .house(Material.BROWN_MUSHROOM_BLOCK, Material.MUSHROOM_STEM, Material.SPRUCE_PLANKS,
                            Material.SPRUCE_STAIRS, Material.RED_MUSHROOM_BLOCK, Material.SPRUCE_DOOR)
                    .lamp(Material.MUSHROOM_STEM)
                    .stalls(Material.RED_MUSHROOM_BLOCK, Material.BROWN_MUSHROOM_BLOCK, Material.GREEN_WOOL, Material.PINK_WOOL)
                    .build(),

            // 7) Deepslate-Tiefenstadt
            SpawnTheme.builder("deepslate", "&8&lTiefenstadt", Material.DEEPSLATE_BRICKS)
                    .desc("&7Dunkle Deepslate-Ziegel", "&7und Seelenlaternen.")
                    .floor(Material.DEEPSLATE_BRICKS, Material.DEEPSLATE_TILES, Material.COBBLED_DEEPSLATE)
                    .path(Material.POLISHED_DEEPSLATE, Material.DEEPSLATE_BRICKS)
                    .ring(Material.CHISELED_DEEPSLATE).foundation(Material.COBBLED_DEEPSLATE)
                    .wall(Material.DEEPSLATE_BRICKS, Material.DEEPSLATE_BRICK_WALL, Material.DEEPSLATE_BRICKS, Material.SOUL_LANTERN)
                    .center(Material.WATER, Material.SOUL_LANTERN)
                    .house(Material.DEEPSLATE_BRICKS, Material.POLISHED_DEEPSLATE, Material.DEEPSLATE_TILES,
                            Material.DEEPSLATE_BRICK_STAIRS, Material.DEEPSLATE_BRICKS, Material.DARK_OAK_DOOR)
                    .lamp(Material.DEEPSLATE_BRICK_WALL)
                    .stalls(Material.CYAN_WOOL, Material.BLUE_WOOL, Material.BLACK_WOOL, Material.LIGHT_BLUE_WOOL)
                    .build(),

            // 8) Kirschblueten-Garten
            SpawnTheme.builder("cherry", "&d&lKirschblüten-Garten", Material.CHERRY_SAPLING)
                    .desc("&7Rosa Kirschholz, Moos", "&7und blühende Hecken.")
                    .floor(Material.CHERRY_PLANKS, Material.MOSS_BLOCK, Material.STONE_BRICKS)
                    .path(Material.CHERRY_PLANKS, Material.PINK_TERRACOTTA)
                    .ring(Material.PINK_TERRACOTTA).foundation(Material.STONE)
                    .wall(Material.CHERRY_LOG, Material.CHERRY_LEAVES, Material.CHERRY_LOG, Material.LANTERN)
                    .center(Material.WATER, Material.SEA_LANTERN)
                    .house(Material.CHERRY_PLANKS, Material.CHERRY_LOG, Material.CHERRY_PLANKS,
                            Material.CHERRY_STAIRS, Material.CHERRY_PLANKS, Material.CHERRY_DOOR)
                    .lamp(Material.CHERRY_FENCE)
                    .stalls(Material.PINK_WOOL, Material.MAGENTA_WOOL, Material.WHITE_WOOL, Material.LIGHT_GRAY_WOOL)
                    .build(),

            // 9) Ozean-Tempel (Prismarin)
            SpawnTheme.builder("ocean", "&3&lOzean-Tempel", Material.PRISMARINE)
                    .desc("&7Prismarin, dunkle Ziegel", "&7und Seelaternen.")
                    .floor(Material.PRISMARINE, Material.PRISMARINE_BRICKS, Material.DARK_PRISMARINE)
                    .path(Material.PRISMARINE_BRICKS, Material.DARK_PRISMARINE)
                    .ring(Material.DARK_PRISMARINE).foundation(Material.PRISMARINE)
                    .wall(Material.PRISMARINE_BRICKS, Material.PRISMARINE_WALL, Material.DARK_PRISMARINE, Material.SEA_LANTERN)
                    .center(Material.WATER, Material.SEA_LANTERN)
                    .house(Material.PRISMARINE_BRICKS, Material.DARK_PRISMARINE, Material.PRISMARINE,
                            Material.PRISMARINE_BRICK_STAIRS, Material.DARK_PRISMARINE, Material.WARPED_DOOR)
                    .lamp(Material.PRISMARINE_WALL)
                    .stalls(Material.CYAN_WOOL, Material.LIGHT_BLUE_WOOL, Material.BLUE_WOOL, Material.WHITE_WOOL)
                    .build(),

            // 10) Dschungel-Ruine
            SpawnTheme.builder("jungle", "&2&lDschungel-Ruine", Material.JUNGLE_SAPLING)
                    .desc("&7Bemooster Stein, Jungle-", "&7holz und Blätterdächer.")
                    .floor(Material.MOSSY_COBBLESTONE, Material.COBBLESTONE, Material.MOSS_BLOCK)
                    .path(Material.JUNGLE_PLANKS, Material.MOSSY_COBBLESTONE)
                    .ring(Material.CHISELED_STONE_BRICKS).foundation(Material.COBBLESTONE)
                    .wall(Material.MOSSY_COBBLESTONE, Material.MOSSY_COBBLESTONE_WALL, Material.JUNGLE_LOG, Material.LANTERN)
                    .center(Material.WATER, Material.SEA_LANTERN)
                    .house(Material.JUNGLE_PLANKS, Material.JUNGLE_LOG, Material.JUNGLE_PLANKS,
                            Material.JUNGLE_STAIRS, Material.JUNGLE_LEAVES, Material.JUNGLE_DOOR)
                    .lamp(Material.JUNGLE_FENCE)
                    .stalls(Material.GREEN_WOOL, Material.LIME_WOOL, Material.YELLOW_WOOL, Material.BROWN_WOOL)
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
