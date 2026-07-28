#!/usr/bin/env python3
"""Convert the watchtower into a Minecraft Java build.

Voxelises the tower mesh and writes a vanilla **structure NBT**, so no mods are
needed — a structure block loads it directly. A `.mcfunction` of `setblock`
lines is written too, as a route that needs neither a structure block nor
creative-mode block placement.

Which block a voxel becomes is decided by the material of the nearest surface,
so the stone body, shingle roof, ironwork and ivy each map to their own block,
and the dark window recesses map to *air* — the arched openings stay open.

Run either way:
    python3 minecraft.py            (requires `pip install bpy`)
    blender --background --python minecraft.py
Optional flags:
    --scale N     blocks per Blender unit (default 3.0)
    --solid       fill the interior instead of leaving the tower hollow

Outputs (next to this script):
    minecraft/watchtower.nbt
    minecraft/watchtower.mcfunction
    minecraft/watchtower_datapack/...
"""

import gzip
import math
import os
import random
import struct
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import watchtower as wt

HERE = os.path.dirname(os.path.abspath(__file__))
RND = random.Random(23)

# A structure block loads at most 48x48x48, so the default scale is the largest
# that keeps the whole tower inside a single structure.
DEFAULT_SCALE = 3.0
STRUCTURE_LIMIT = 48
# 1.20.1. Minecraft upgrades structures saved by older versions, so a
# conservative value loads in every later release too.
DATA_VERSION = 3465


# ------------------------------------------------------------- NBT (writing)
# Minecraft structure files are gzipped NBT. The subset needed here is small
# enough to emit directly rather than take on a dependency.
def _nbt_str(text):
    raw = text.encode("utf-8")
    return struct.pack(">H", len(raw)) + raw


def _nbt_compound(entries):
    """entries: list of (name, tag_id, payload bytes)."""
    out = b"".join(bytes([tid]) + _nbt_str(name) + payload
                   for name, tid, payload in entries)
    return out + b"\x00"                      # TAG_End


def _nbt_list(tag_id, payloads):
    return bytes([tag_id]) + struct.pack(">i", len(payloads)) + b"".join(payloads)


def _nbt_int(value):
    return struct.pack(">i", value)


def write_structure(path, size, palette, blocks):
    """palette: list of (block name, properties dict or None).
    blocks: list of (palette index, (x, y, z))."""
    palette_payloads = []
    for name, props in palette:
        entries = [("Name", 8, _nbt_str(f"minecraft:{name}"))]
        if props:
            entries.insert(0, ("Properties", 10, _nbt_compound(
                [(k, 8, _nbt_str(v)) for k, v in sorted(props.items())])))
        palette_payloads.append(_nbt_compound(entries))

    block_payloads = [
        _nbt_compound([
            ("pos", 9, _nbt_list(3, [_nbt_int(c) for c in pos])),
            ("state", 3, _nbt_int(state)),
        ])
        for state, pos in blocks
    ]

    root = _nbt_compound([
        ("DataVersion", 3, _nbt_int(DATA_VERSION)),
        ("size", 9, _nbt_list(3, [_nbt_int(c) for c in size])),
        ("palette", 9, _nbt_list(10, palette_payloads)),
        ("blocks", 9, _nbt_list(10, block_payloads)),
        ("entities", 9, _nbt_list(10, [])),
    ])
    data = bytes([10]) + _nbt_str("") + root
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with gzip.open(path, "wb") as fh:
        fh.write(data)


# ---------------------------------------------------------------- block map
def clamp01(x):
    return min(1.0, max(0.0, x))


def moss_chance(z):
    """Mirrors the shader's height-masked moss so the voxel build weathers the
    same way the render does: heavy at the base, gone above the first story."""
    return clamp01((wt.MOSS_TOP - z) / (wt.MOSS_TOP - 0.2)) * 0.8


def block_for(material, world):
    """Block for a voxel, given the material of the nearest surface.
    Returning None leaves the voxel empty."""
    z = world.z
    if material == "WT_Recess":
        return None                      # keep the arched openings open
    if material == "WT_Stone":
        if RND.random() < moss_chance(z):
            return ("mossy_cobblestone", None)
        roll = RND.random()
        if roll < 0.10:
            return ("stone_bricks", None)
        if roll < 0.16:
            return ("cracked_stone_bricks", None)
        if roll < 0.20:
            return ("mossy_stone_bricks", None)
        return ("cobblestone", None)
    if material == "WT_WoodShingle":
        # the same material carries the roof and the plank door
        return (("dark_oak_planks", None) if z > wt.EAVE_Z - 0.4
                else ("spruce_planks", None))
    if material == "WT_Iron":
        return ("polished_blackstone", None)
    if material in ("WT_Ivy", "WT_IvyStem"):
        # persistent, or Minecraft decays leaves with no log nearby
        return ("oak_leaves", {"persistent": "true", "distance": "7"})
    return ("cobblestone", None)


# --------------------------------------------------------------- voxelising
def voxelise(objects, scale, solid=False):
    """Mark every voxel whose centre lies within half a voxel of a surface.
    That yields a hollow shell — which is what a building wants — with walls
    coming out two blocks thick wherever the model's own walls are thicker
    than a voxel."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    trees, meshes = [], []
    for obj in objects:
        trees.append(BVHTree.FromObject(obj, depsgraph))
        meshes.append(obj.data)

    corners = [obj.matrix_world @ Vector(c)
               for obj in objects for c in obj.bound_box]
    lo = Vector((min(p[i] for p in corners) for i in range(3)))
    hi = Vector((max(p[i] for p in corners) for i in range(3)))

    dims = [int(math.ceil((hi[i] - lo[i]) * scale)) + 1 for i in range(3)]
    reach = 0.72 / scale          # half a voxel, plus a little, in world units

    filled = {}
    for ix in range(dims[0]):
        for iy in range(dims[1]):
            for iz in range(dims[2]):
                p = Vector((lo.x + (ix + 0.5) / scale,
                            lo.y + (iy + 0.5) / scale,
                            lo.z + (iz + 0.5) / scale))
                best, best_obj, best_poly = reach, -1, -1
                for oi, tree in enumerate(trees):
                    hit = tree.find_nearest(p, best)
                    if hit[0] is not None and hit[3] < best:
                        best, best_obj, best_poly = hit[3], oi, hit[2]
                if best_obj < 0:
                    continue
                mesh = meshes[best_obj]
                slot = mesh.polygons[best_poly].material_index
                material = (mesh.materials[slot].name
                            if slot < len(mesh.materials) and mesh.materials[slot]
                            else "")
                block = block_for(material, p)
                if block is not None:
                    filled[(ix, iy, iz)] = block

    if solid:
        filled = _fill_interior(filled, dims)
    return filled, dims, lo


def _fill_interior(filled, dims):
    """Flood the outside from the bounding box, then treat everything that was
    not reached as interior and make it stone."""
    outside = set()
    stack = []
    for ix in range(dims[0]):
        for iy in range(dims[1]):
            for iz in (0, dims[2] - 1):
                stack.append((ix, iy, iz))
    for ix in range(dims[0]):
        for iz in range(dims[2]):
            for iy in (0, dims[1] - 1):
                stack.append((ix, iy, iz))
    for iy in range(dims[1]):
        for iz in range(dims[2]):
            for ix in (0, dims[0] - 1):
                stack.append((ix, iy, iz))

    while stack:
        cell = stack.pop()
        if cell in outside or cell in filled:
            continue
        x, y, z = cell
        if not (0 <= x < dims[0] and 0 <= y < dims[1] and 0 <= z < dims[2]):
            continue
        outside.add(cell)
        stack.extend([(x + 1, y, z), (x - 1, y, z), (x, y + 1, z),
                      (x, y - 1, z), (x, y, z + 1), (x, y, z - 1)])

    for ix in range(dims[0]):
        for iy in range(dims[1]):
            for iz in range(dims[2]):
                cell = (ix, iy, iz)
                if cell not in filled and cell not in outside:
                    filled[cell] = ("cobblestone", None)
    return filled


def to_minecraft_axes(filled, dims):
    """Blender is Z-up, Minecraft is Y-up. Mapping (x, y, z) to (x, z, -y) is a
    rotation rather than an axis swap, so the build is not mirrored."""
    blocks = {}
    for (ix, iy, iz), block in filled.items():
        blocks[(ix, iz, dims[1] - 1 - iy)] = block
    size = (dims[0], dims[2], dims[1])
    return blocks, size


# ------------------------------------------------------------------ outputs
def write_mcfunction(path, blocks, size):
    """setblock lines relative to the player, for a datapack function."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lines = ["# Watchtower — run from the north-west bottom corner.",
             "# /function watchtower:watchtower"]
    for (x, y, z), (name, props) in sorted(blocks.items()):
        state = name
        if props:
            state += "[" + ",".join(f"{k}={v}" for k, v in sorted(props.items())) + "]"
        lines.append(f"setblock ~{x} ~{y} ~{z} minecraft:{state}")
    with open(path, "w") as fh:
        fh.write("\n".join(lines) + "\n")


def write_datapack(root, nbt_path, function_path):
    """Minimal datapack so the structure loads as `watchtower:watchtower`
    without copying anything into a world's generated folder.

    1.21 renamed the datapack folders from plural to singular
    (`structures` -> `structure`, `functions` -> `function`). Both spellings
    are written so the pack works either side of that change; the unused one
    is simply ignored."""
    with open(nbt_path, "rb") as fh:
        structure = fh.read()
    with open(function_path) as fh:
        function = fh.read()

    for folder, payload, name in (("structures", structure, "watchtower.nbt"),
                                  ("structure", structure, "watchtower.nbt"),
                                  ("functions", function, "watchtower.mcfunction"),
                                  ("function", function, "watchtower.mcfunction")):
        target = os.path.join(root, "data", "watchtower", folder)
        os.makedirs(target, exist_ok=True)
        mode = "wb" if isinstance(payload, bytes) else "w"
        with open(os.path.join(target, name), mode) as fh:
            fh.write(payload)

    with open(os.path.join(root, "pack.mcmeta"), "w") as fh:
        fh.write('{\n  "pack": {\n    "pack_format": 15,\n'
                 '    "description": "Nordic stone watchtower"\n  }\n}\n')


def main():
    scale = DEFAULT_SCALE
    if "--scale" in sys.argv:
        scale = float(sys.argv[sys.argv.index("--scale") + 1])
    solid = "--solid" in sys.argv

    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.data.collections.new("Watchtower")
    bpy.context.scene.collection.children.link(col)
    objects = wt.build_watchtower(col)

    print(f"voxelising at {scale} blocks per unit ...")
    filled, dims, _lo = voxelise(objects, scale, solid)
    blocks, size = to_minecraft_axes(filled, dims)
    print(f"  grid {size[0]} x {size[1]} x {size[2]} (X, Y, Z)  "
          f"{len(blocks)} blocks")
    if max(size) > STRUCTURE_LIMIT:
        print(f"  WARNING: {max(size)} exceeds the {STRUCTURE_LIMIT}-block "
              f"structure limit — lower --scale or split it up")

    tally = {}
    for name, props in blocks.values():
        tally[name] = tally.get(name, 0) + 1
    for name, count in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"    {name:24s} {count}")

    palette, index = [], {}
    entries = []
    for pos, block in sorted(blocks.items()):
        key = (block[0], tuple(sorted(block[1].items())) if block[1] else ())
        if key not in index:
            index[key] = len(palette)
            palette.append(block)
        entries.append((index[key], pos))

    out = os.path.join(HERE, "minecraft")
    nbt_path = os.path.join(out, "watchtower.nbt")
    write_structure(nbt_path, size, palette, entries)
    print(f"wrote: {nbt_path}")

    fn_path = os.path.join(out, "watchtower.mcfunction")
    write_mcfunction(fn_path, blocks, size)
    print(f"wrote: {fn_path}")

    pack = os.path.join(out, "watchtower_datapack")
    write_datapack(pack, nbt_path, fn_path)
    print(f"wrote: {pack}/")


if __name__ == "__main__":
    main()
