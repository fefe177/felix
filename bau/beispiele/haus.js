// Beispiel: kleines Fachwerkhaus mit Satteldach, Veranda und Garten.
// Vorderseite = Süden (großes z). Innen: x 1..9, z 1..7.

// Fundament und Boden
b.fill(0, -1, 0, 10, -1, 8, 'cobblestone')
b.fill(1, -1, 1, 9, -1, 7, 'spruce_planks')

// Sockel aus Bruchstein, darüber Wände aus Eichenbrettern
b.walls(0, 0, 0, 10, 0, 8, 'cobblestone')
b.walls(0, 1, 0, 10, 3, 8, 'oak_planks')

// Fachwerk: Eckbalken und ein Querbalken aus Stämmen
for (const [x, z] of [[0, 0], [10, 0], [0, 8], [10, 8]]) b.fill(x, 0, z, x, 4, z, 'spruce_log')
b.walls(0, 4, 0, 10, 4, 8, 'spruce_log[axis=x]')
for (const z of [0, 8]) b.fill(1, 4, z, 9, 4, z, 'spruce_log[axis=x]')
for (const x of [0, 10]) b.fill(x, 4, 1, x, 4, 7, 'spruce_log[axis=z]')
for (const x of [0, 10]) b.fill(x, 0, 4, x, 3, 4, 'spruce_log')

// Fenster
for (const x of [2, 3, 7, 8]) b.fill(x, 2, 8, x, 2, 8, 'glass_pane')
for (const x of [3, 4, 6, 7]) b.set(x, 2, 0, 'glass_pane')
for (const z of [2, 6]) { b.set(0, 2, z, 'glass_pane'); b.set(10, 2, z, 'glass_pane') }

// Tür vorne in der Mitte, Laternen daneben
b.door(5, 0, 8, 'spruce_door', 'north')
b.set(4, 2, 9, 'wall_torch[facing=south]')
b.set(6, 2, 9, 'wall_torch[facing=south]')

// Dach
b.gableRoof(0, 0, 10, 8, 5, 'dark_oak_stairs', { axis: 'x', overhang: 1, gable: 'oak_planks' })

// Innen: Bett, Werkbank, Ofen, Kisten, Licht
b.bed(8, 0, 2, 'red_bed', 'north')
b.set(1, 0, 1, 'crafting_table')
b.set(2, 0, 1, 'furnace[facing=south]')
b.set(3, 0, 1, 'chest[facing=south]')
b.set(1, 0, 7, 'bookshelf'); b.set(1, 1, 7, 'bookshelf')
b.set(5, 3, 4, 'lantern[hanging=true]')

// Weg und Garten
b.fill(5, -1, 9, 5, -1, 13, 'dirt_path')
for (const z of [10, 12]) { b.set(3, 0, z, 'poppy'); b.set(7, 0, z, 'dandelion') }
b.fill(1, 0, 9, 1, 0, 13, 'oak_fence')
b.fill(9, 0, 9, 9, 0, 13, 'oak_fence')
b.fill(2, 0, 13, 4, 0, 13, 'oak_fence')
b.fill(6, 0, 13, 8, 0, 13, 'oak_fence')
b.set(5, 0, 13, 'oak_fence_gate[facing=south]')
