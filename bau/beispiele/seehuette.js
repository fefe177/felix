// Beispiel (von Claude bei einem Testauftrag entworfen): "bau eine kleine gemütliche Holzhütte am See"
// Kleine gemütliche Holzhütte am See.
// Vorderseite = Süden (größtes z, Tür + Weg). Der See liegt hinten im Norden mit kleinem Steg.
// Haus: x 0..7, z 0..6. Innen: x 1..6, z 1..5.

// Fundament und Boden
b.fill(0, -1, 0, 7, -1, 6, 'cobblestone')
b.fill(1, -1, 1, 6, -1, 5, 'spruce_planks')

// Sockel aus Bruchstein, Wände aus Fichtenbrettern
b.walls(0, 0, 0, 7, 0, 6, 'cobblestone')
b.walls(0, 1, 0, 7, 3, 6, 'spruce_planks')

// Eckbalken und Querbalken aus Stämmen (Fachwerk-Look)
for (const [x, z] of [[0, 0], [7, 0], [0, 6], [7, 6]]) b.fill(x, 0, z, x, 4, z, 'spruce_log')
b.walls(0, 2, 0, 7, 2, 6, 'spruce_log[axis=x]')
for (const x of [0, 7]) b.fill(x, 2, 1, x, 2, 5, 'spruce_log[axis=z]')
b.walls(0, 4, 0, 7, 4, 6, 'spruce_log[axis=x]')
for (const z of [0, 6]) b.fill(1, 4, z, 6, 4, z, 'spruce_log[axis=x]')
for (const x of [0, 7]) b.fill(x, 4, 1, x, 4, 5, 'spruce_log[axis=z]')

// Fenster: Nordwand mit Seeblick, Ost-/Westwand, Südwand neben der Tür
for (const x of [2, 5]) b.fill(x, 1, 0, x, 2, 0, 'glass_pane')
for (const z of [2, 4]) { b.set(0, 1, z, 'glass_pane'); b.set(7, 1, z, 'glass_pane') }
for (const x of [1, 6]) b.fill(x, 1, 6, x, 2, 6, 'glass_pane')

// Haustür vorne (Süden) mit Laternen
b.door(3, 0, 6, 'spruce_door', 'north')
b.set(2, 2, 7, 'wall_torch[facing=south]')
b.set(4, 2, 7, 'wall_torch[facing=south]')

// Dach
b.gableRoof(0, 0, 7, 6, 5, 'spruce_stairs', { axis: 'x', overhang: 1, gable: 'spruce_planks' })

// Innen: Bett, Werkbank, Ofen, Kiste, Bücherregal, kleiner Tisch
b.bed(2, 0, 4, 'red_bed', 'west')
b.set(5, 0, 1, 'furnace[facing=north]')
b.set(6, 0, 1, 'chest[facing=north]')
b.set(1, 0, 1, 'crafting_table')
b.set(1, 0, 5, 'bookshelf'); b.set(1, 1, 5, 'bookshelf')
b.set(4, 0, 3, 'oak_fence'); b.set(4, 1, 3, 'oak_pressure_plate')
b.set(5, 0, 3, 'lantern')

// Weg zur Tür (vorne, Süden) mit Blumen
b.fill(3, -1, 7, 3, -1, 9, 'dirt_path')
b.set(2, 0, 8, 'poppy'); b.set(5, 0, 8, 'dandelion')
b.fill(1, 0, 9, 2, 0, 9, 'oak_fence')
b.fill(5, 0, 9, 6, 0, 9, 'oak_fence')

// Der See hinten (Norden) mit Ufer und Steg
b.fill(-2, -1, -2, 9, -1, -1, 'sand')
b.fill(-2, -1, -10, 9, -1, -3, 'water')
b.fill(3, 0, -8, 3, 0, -1, 'spruce_planks')
b.fill(2, 1, -8, 2, 1, -1, 'oak_fence')
b.fill(4, 1, -8, 4, 1, -1, 'oak_fence')
b.set(2, 2, -8, 'torch'); b.set(4, 2, -8, 'torch')
b.set(1, 0, -4, 'lily_pad'); b.set(6, 0, -6, 'lily_pad'); b.set(-1, 0, -3, 'lily_pad')
b.set(-1, 0, -1, 'sugar_cane'); b.set(8, 0, -1, 'sugar_cane')
