#!/usr/bin/env python3
"""
Giant Nordic forest diorama — same style as the watchtower, which is
appended from exports/watchtower.blend and placed on a knoll at the end
of a winding path through the trees.

Run either way:
    python3 generate_forest_scene.py          # pip-installed bpy module
    blender --background --python generate_forest_scene.py

Requires exports/watchtower.blend (run generate_watchtower.py first).

Outputs:
    exports/forest_watchtower.blend
    exports/forest_watchtower.glb
    textures/forest_*.png
    renders/forest_path.png, renders/forest_aerial.png
"""

import math
import os
import random

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEX_DIR = os.path.join(BASE_DIR, "textures")
EXPORT_DIR = os.path.join(BASE_DIR, "exports")
RENDER_DIR = os.path.join(BASE_DIR, "renders")
TOWER_BLEND = os.path.join(EXPORT_DIR, "watchtower.blend")
for d in (TEX_DIR, EXPORT_DIR, RENDER_DIR):
    os.makedirs(d, exist_ok=True)

rng = random.Random(21)

# island footprint (meters) and world layout
SX, SY = 70.0, 46.0
TOWER_POS = Vector((25.0, 0.0, 0.0))
BASE_Z = -1.6  # diorama slab bottom

# ----------------------------------------------------------------------------
# fresh scene
# ----------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

COL = bpy.data.collections.new("NordicForest")
scene.collection.children.link(COL)
ROOT = bpy.data.objects.new("Forest_Root", None)
COL.objects.link(ROOT)

# ----------------------------------------------------------------------------
# shared helpers (same pipeline as generate_watchtower.py)
# ----------------------------------------------------------------------------


def _value_noise(shape, fx, fy, seed):
    rs = np.random.RandomState(seed)
    fx, fy = max(1, int(fx)), max(1, int(fy))
    g = rs.rand(fy, fx)
    h, w = shape
    y = np.linspace(0, fy, h, endpoint=False)
    x = np.linspace(0, fx, w, endpoint=False)
    yi = np.floor(y).astype(int)
    xi = np.floor(x).astype(int)
    yf = (y - yi)[:, None]
    xf = (x - xi)[None, :]
    ys = yf * yf * (3 - 2 * yf)
    xs = xf * xf * (3 - 2 * xf)
    g00 = g[np.ix_(yi % fy, xi % fx)]
    g10 = g[np.ix_((yi + 1) % fy, xi % fx)]
    g01 = g[np.ix_(yi % fy, (xi + 1) % fx)]
    g11 = g[np.ix_((yi + 1) % fy, (xi + 1) % fx)]
    return g00 * (1 - xs) * (1 - ys) + g01 * xs * (1 - ys) + g10 * (1 - xs) * ys + g11 * xs * ys


def fbm(shape, fx, fy, octaves, seed, gain=0.5):
    total = np.zeros(shape)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        total += amp * _value_noise(shape, fx * 2 ** o, fy * 2 ** o, seed + o * 101)
        norm += amp
        amp *= gain
    return total / norm


def sstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def lerp(a, b, t):
    return a + (b - a) * t


def _srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def make_image(name, arr, colorspace):
    h, w = arr.shape[:2]
    arr = np.clip(arr, 0.0, 1.0)
    buf = _srgb_to_linear(arr) if colorspace == "sRGB" else arr
    rgba = np.concatenate([buf, np.ones((h, w, 1))], axis=-1).astype(np.float32)
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(TEX_DIR, name + ".png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def normal_map(height, strength):
    gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5
    gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5
    nx, ny = -gx * strength, -gy * strength
    nz = np.ones_like(height)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx * inv, ny * inv, nz * inv], axis=-1) * 0.5 + 0.5


def pbr_material(name, imgs=None, base=(0.8, 0.8, 0.8, 1.0), rough=0.6,
                 metal=0.0, nrm_strength=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if imgs:
        col_img, orm_img, nrm_img = imgs
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = col_img
        t.location = (-560, 350)
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        if orm_img is not None:
            t2 = nt.nodes.new("ShaderNodeTexImage")
            t2.image = orm_img
            t2.location = (-560, 40)
            sep = nt.nodes.new("ShaderNodeSeparateColor")
            sep.location = (-260, 40)
            nt.links.new(t2.outputs["Color"], sep.inputs["Color"])
            nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
            nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        if nrm_img is not None:
            t3 = nt.nodes.new("ShaderNodeTexImage")
            t3.image = nrm_img
            t3.location = (-560, -280)
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nm.location = (-260, -280)
            nm.inputs["Strength"].default_value = nrm_strength
            nt.links.new(t3.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def spin(profile, segments=8, close=False):
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    if close:
        edges.append(bm.edges.new((verts[-1], verts[0])))
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1),
                   dvec=(0, 0, 0), angle=math.tau, steps=segments, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def cap_ring(bm, z_level, tol=1e-4):
    edges = [e for e in bm.edges
             if e.is_boundary and all(abs(v.co.z - z_level) < tol for v in e.verts)]
    if not edges:
        return
    try:
        bmesh.ops.grid_fill(bm, edges=edges, mat_nr=0, use_smooth=False)
    except RuntimeError:
        bmesh.ops.holes_fill(bm, edges=edges, sides=len(edges))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def merge_into(acc, piece, matrix=None):
    if matrix is not None:
        bmesh.ops.transform(piece, matrix=matrix, verts=piece.verts[:])
    tmp = bpy.data.meshes.new("_tmp")
    piece.to_mesh(tmp)
    piece.free()
    acc.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def box_uv(bm, scale=0.35, offset=(0.0, 0.0), faces=None):
    uvl = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    for f in (faces if faces is not None else bm.faces):
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            co = l.vert.co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            l[uvl].uv = (u * scale + offset[0], v * scale + offset[1])


def apply_shading(bm, smooth_angle=0.66):
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            try:
                if e.calc_face_angle() > smooth_angle:
                    e.smooth = False
            except ValueError:
                pass


def to_object(name, bm, mats, smooth_angle=0.66, link=True):
    apply_shading(bm, smooth_angle)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if not isinstance(mats, (list, tuple)):
        mats = [mats]
    for m in mats:
        me.materials.append(m)
    if link:
        ob = bpy.data.objects.new(name, me)
        COL.objects.link(ob)
        ob.parent = ROOT
        return ob
    return me


# ----------------------------------------------------------------------------
# heightfield + winding path
# ----------------------------------------------------------------------------

print("Computing terrain heightfield ...")
HW, HH = 1024, 672  # heightfield/texture resolution over the island
Xw = np.linspace(-SX / 2, SX / 2, HW)[None, :].repeat(HH, axis=0)
Yw = np.linspace(-SY / 2, SY / 2, HH)[:, None].repeat(HW, axis=1)

# path polyline: winds from the front edge to the tower knoll
P_T = np.linspace(0.0, 1.0, 140)
P_X = -34.0 + (TOWER_POS.x + 2.0 - -34.0) * P_T
P_Y = (5.5 * np.sin(P_T * 3.4 + 0.4) - 1.2) * (1 - P_T ** 2.2)

d_path = np.full((HH, HW), 1e9)
for px, py in zip(P_X, P_Y):
    d_path = np.minimum(d_path, np.hypot(Xw - px, Yw - py))
w_path = sstep((2.1 - d_path) / 1.4)

n_macro = fbm((HH, HW), 7, 5, 4, 71)
d_tower = np.hypot(Xw - TOWER_POS.x, Yw - TOWER_POS.y)
knoll = 1.8 * np.exp(-(d_tower ** 2) / (2 * 9.0 ** 2))
HF = (n_macro - 0.5) * 1.7 * (1 - 0.75 * w_path) + knoll
edge = sstep((SX / 2 - np.abs(Xw) - 1.0) / 5.0) * sstep((SY / 2 - np.abs(Yw) - 1.0) / 5.0)
HF *= 0.25 + 0.75 * edge


def h_at(x, y):
    """Bilinear sample of the heightfield at world (x, y)."""
    u = (x + SX / 2) / SX * (HW - 1)
    v = (y + SY / 2) / SY * (HH - 1)
    u = min(max(u, 0.0), HW - 1.001)
    v = min(max(v, 0.0), HH - 1.001)
    i, j = int(u), int(v)
    fu, fv = u - i, v - j
    return float(HF[j, i] * (1 - fu) * (1 - fv) + HF[j, i + 1] * fu * (1 - fv)
                 + HF[j + 1, i] * (1 - fu) * fv + HF[j + 1, i + 1] * fu * fv)


def path_dist(x, y):
    return float(np.min(np.hypot(P_X - x, P_Y - y)))


# ----------------------------------------------------------------------------
# forest textures
# ----------------------------------------------------------------------------

print("Generating forest textures ...")
sh = (HH, HW)
g_var = fbm(sh, 9, 6, 4, 72)
g_fine = fbm(sh, 40, 26, 3, 73)
grass = lerp(np.array([0.270, 0.400, 0.140])[None, None, :],
             np.array([0.460, 0.580, 0.230])[None, None, :],
             (0.25 + 0.75 * g_var)[..., None])
grass *= (0.86 + 0.24 * g_fine)[..., None]

dirt = lerp(np.array([0.50, 0.385, 0.260])[None, None, :],
            np.array([0.62, 0.50, 0.35])[None, None, :],
            (fbm(sh, 20, 13, 4, 74))[..., None])
pebbles = sstep((fbm(sh, 60, 40, 3, 75) - 0.62) / 0.06) * w_path
p_mask = sstep((w_path + (g_var - 0.5) * 0.35 - 0.35) / 0.25)
ter_col = lerp(grass, dirt, p_mask[..., None])
ter_col = lerp(ter_col, np.array([0.50, 0.49, 0.47])[None, None, :], pebbles[..., None] * 0.7)

gy, gx = np.gradient(HF)
slope = np.hypot(gx * (HW / SX), gy * (HH / SY))
r_mask = sstep((slope - 0.30) / 0.20) * (1 - p_mask)
ter_col = lerp(ter_col, np.array([0.44, 0.435, 0.42])[None, None, :] *
               (0.75 + 0.45 * g_fine)[..., None], r_mask[..., None] * 0.8)

ter_rough = 0.88 - 0.10 * p_mask + 0.05 * g_fine
ter_orm = np.stack([np.full(sh, 0.85), ter_rough, np.zeros(sh)], axis=-1)
ter_h = g_fine * 0.5 + p_mask * -0.3 + fbm(sh, 90, 60, 2, 76) * 0.3
TER_IMGS = (
    make_image("forest_terrain_col", ter_col, "sRGB"),
    make_image("forest_terrain_orm", ter_orm, "Non-Color"),
    make_image("forest_terrain_nrm", normal_map(ter_h, 1.6), "Non-Color"),
)


def foliage_textures(name, col_a, col_b, seed):
    s2 = (512, 512)
    mottle = fbm(s2, 8, 8, 4, seed)
    fine = fbm(s2, 30, 30, 3, seed + 7)
    col = lerp(np.array(col_a)[None, None, :], np.array(col_b)[None, None, :],
               (0.2 + 0.8 * mottle)[..., None])
    col *= (0.86 + 0.26 * fine)[..., None]
    rough = 0.72 + 0.22 * mottle
    orm = np.stack([np.full(s2, 0.85), rough, np.zeros(s2)], axis=-1)
    return (
        make_image(name + "_col", col, "sRGB"),
        make_image(name + "_orm", orm, "Non-Color"),
        make_image(name + "_nrm", normal_map(mottle * 0.5 + fine * 0.4, 1.3), "Non-Color"),
    )


FOL_A = foliage_textures("forest_spruce", (0.200, 0.360, 0.190), (0.400, 0.570, 0.280), 81)
FOL_B = foliage_textures("forest_pine", (0.240, 0.400, 0.150), (0.460, 0.600, 0.230), 85)

s3 = (256, 256)
bark_g = fbm(s3, 18, 4, 4, 91)
bark_col = np.array([0.38, 0.27, 0.18])[None, None, :] * (0.72 + 0.52 * bark_g)[..., None]
BARK_IMGS = (
    make_image("forest_bark_col", bark_col, "sRGB"),
    make_image("forest_bark_orm",
               np.stack([np.full(s3, 0.9), 0.68 + 0.25 * bark_g, np.zeros(s3)], -1), "Non-Color"),
    make_image("forest_bark_nrm", normal_map(bark_g * 0.7, 1.8), "Non-Color"),
)

rock_g = fbm(s3, 6, 6, 5, 95)
rock_col = np.stack([0.48 + 0.26 * rock_g, 0.48 + 0.26 * rock_g,
                     0.47 + 0.25 * rock_g], axis=-1)
rock_col *= (0.85 + 0.3 * fbm(s3, 20, 20, 3, 96))[..., None]
ROCK_IMGS = (
    make_image("forest_rock_col", rock_col, "sRGB"),
    make_image("forest_rock_orm",
               np.stack([np.full(s3, 0.85), 0.74 + 0.18 * rock_g, np.zeros(s3)], -1), "Non-Color"),
    make_image("forest_rock_nrm", normal_map(rock_g, 2.2), "Non-Color"),
)

MAT_TERRAIN = pbr_material("F_Terrain", TER_IMGS, rough=0.88)
MAT_BASE = pbr_material("F_DioramaBase", None, base=(0.11, 0.095, 0.082, 1), rough=0.9)
MAT_FOL_A = pbr_material("F_SpruceFoliage", FOL_A, rough=0.8)
MAT_FOL_B = pbr_material("F_PineFoliage", FOL_B, rough=0.8)
MAT_BARK = pbr_material("F_Bark", BARK_IMGS, rough=0.75)
MAT_ROCK = pbr_material("F_Rock", ROCK_IMGS, rough=0.8)

# ----------------------------------------------------------------------------
# terrain mesh: displaced grid + skirt + capped bottom (all quads)
# ----------------------------------------------------------------------------

print("Building terrain ...")
NX, NY = 70, 46
ter = bmesh.new()
grid = [[ter.verts.new((-SX / 2 + i * SX / NX, -SY / 2 + j * SY / NY,
                        h_at(-SX / 2 + i * SX / NX, -SY / 2 + j * SY / NY)))
         for i in range(NX + 1)] for j in range(NY + 1)]
top_faces = []
for j in range(NY):
    for i in range(NX):
        f = ter.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        top_faces.append(f)

# ordered boundary loop, counter-clockwise
loop = ([grid[0][i] for i in range(NX + 1)]
        + [grid[j][NX] for j in range(1, NY + 1)]
        + [grid[NY][i] for i in range(NX - 1, -1, -1)]
        + [grid[j][0] for j in range(NY - 1, 0, -1)])
bottom = [ter.verts.new((v.co.x, v.co.y, BASE_Z)) for v in loop]
skirt_faces = []
for k in range(len(loop)):
    k2 = (k + 1) % len(loop)
    skirt_faces.append(ter.faces.new((loop[k2], loop[k], bottom[k], bottom[k2])))
cap_ring(ter, BASE_Z)
bmesh.ops.recalc_face_normals(ter, faces=ter.faces[:])

uvl = ter.loops.layers.uv.new("UVMap")
top_set = set(top_faces)
for f in ter.faces:
    if f in top_set:
        f.material_index = 0
        for l in f.loops:
            co = l.vert.co
            l[uvl].uv = ((co.x + SX / 2) / SX, (co.y + SY / 2) / SY)
    else:
        f.material_index = 1
        for l in f.loops:
            l[uvl].uv = (l.vert.co.x * 0.02, l.vert.co.z * 0.02)
to_object("Forest_Terrain", ter, [MAT_TERRAIN, MAT_BASE], smooth_angle=0.9)

# ----------------------------------------------------------------------------
# tree archetypes (quad-only: lathed trunk, layered foliage skirts)
# ----------------------------------------------------------------------------


def build_tree_mesh(name, layers, trunk_h, tip, fol_mat, seed):
    """layers: list of (base_z, radius, height). All-quad lathed parts."""
    trng = random.Random(seed)
    bm = bmesh.new()
    # trunk (material 0)
    trunk = spin([(0.20, -0.4), (0.16, trunk_h * 0.4), (0.11, trunk_h)], segments=8)
    cap_ring(trunk, -0.4)
    merge_into(bm, trunk)
    trunk_faces = list(bm.faces)
    # foliage skirts (material 1)
    for z0, R, h in layers:
        prof = [(R, z0), (R * 0.55, z0 + h * 0.55), (R * 0.20, z0 + h),
                (R * 0.14, z0 + h - 0.06), (R * 0.45, z0 + h * 0.5),
                (R * 0.80, z0 + 0.10)]
        merge_into(bm, spin(prof, segments=8, close=True))
    tz, tr, th = tip
    tip_bm = spin([(tr, tz), (0.035, tz + th)], segments=8)
    cap_ring(tip_bm, tz + th)
    cap_ring(tip_bm, tz)
    merge_into(bm, tip_bm)
    trunk_set = set(trunk_faces)
    for f in bm.faces:
        f.material_index = 0 if f in trunk_set else 1
    # organic jitter on foliage verts
    for v in bm.verts:
        if v.co.z > trunk_h * 0.3 or v.co.xy.length > 0.3:
            s = 1.0 + trng.uniform(-0.06, 0.06)
            v.co.x *= s
            v.co.y *= s
            v.co.z += trng.uniform(-0.05, 0.05)
    box_uv(bm, scale=0.4)
    return to_object(name, bm, [MAT_BARK, fol_mat], smooth_angle=0.6, link=False)


print("Building trees ...")
TREES = [
    build_tree_mesh("Tree_SpruceTall",
                    [(1.0, 2.3, 2.2), (2.6, 1.85, 2.0), (4.0, 1.45, 1.8),
                     (5.3, 1.05, 1.6), (6.4, 0.75, 1.4)],
                    2.0, (7.3, 0.55, 1.6), MAT_FOL_A, 101),
    build_tree_mesh("Tree_SpruceSlim",
                    [(0.8, 1.6, 1.8), (2.1, 1.25, 1.7), (3.3, 0.95, 1.5),
                     (4.4, 0.65, 1.3)],
                    1.6, (5.2, 0.45, 1.4), MAT_FOL_A, 102),
    build_tree_mesh("Tree_PineRound",
                    [(1.8, 2.4, 2.1), (3.3, 1.8, 1.9), (4.6, 1.2, 1.7)],
                    2.6, (5.7, 0.8, 1.3), MAT_FOL_B, 103),
    build_tree_mesh("Tree_Young",
                    [(0.5, 1.15, 1.4), (1.5, 0.85, 1.3), (2.4, 0.6, 1.1)],
                    1.1, (3.1, 0.4, 1.1), MAT_FOL_B, 104),
]

# rocks: subdivided cube, sphere-ified and noised (quads)


def build_rock_mesh(name, seed):
    rrng = random.Random(seed)
    bm = bmesh.new()
    res = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    for v in bm.verts:
        d = v.co.normalized()
        n = rrng.uniform(-0.16, 0.16) + 0.1 * math.sin(v.co.x * 7 + seed) \
            + 0.08 * math.sin(v.co.y * 9 + v.co.z * 6)
        v.co = d * (0.5 + n * 0.5) * 2.0
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((1.3, 1.0, 0.72, 1.0)), verts=bm.verts[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    box_uv(bm, scale=0.5)
    return to_object(name, bm, MAT_ROCK, smooth_angle=0.8, link=False)


ROCKS = [build_rock_mesh(f"Rock_{i}", 110 + i) for i in range(3)]
BUSH = build_rock_mesh("Bush", 130)  # same generator, foliage material + squash
BUSH.materials.clear()
BUSH.materials.append(MAT_FOL_B)

# ----------------------------------------------------------------------------
# scatter: trees, rocks, bushes, stepping stones
# ----------------------------------------------------------------------------

print("Scattering forest ...")


def instance(mesh, name, loc, rot_z, scale):
    ob = bpy.data.objects.new(name, mesh)
    COL.objects.link(ob)
    ob.parent = ROOT
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    ob.scale = scale
    return ob


placed = []
n_trees = 0
attempts = 0
while n_trees < 130 and attempts < 12000:
    attempts += 1
    x = rng.uniform(-SX / 2 + 2.5, SX / 2 - 2.5)
    y = rng.uniform(-SY / 2 + 2.5, SY / 2 - 2.5)
    if path_dist(x, y) < 3.0:
        continue
    if math.hypot(x - TOWER_POS.x, y - TOWER_POS.y) < 9.5:
        continue
    if any((x - px) ** 2 + (y - py) ** 2 < 2.4 ** 2 for px, py in placed):
        continue
    placed.append((x, y))
    mesh = TREES[rng.randrange(len(TREES))]
    s = rng.uniform(0.75, 1.35)
    instance(mesh, f"Tree.{n_trees:03d}", (x, y, h_at(x, y) - 0.12),
             rng.uniform(0, math.tau), (s * rng.uniform(0.9, 1.1), s * rng.uniform(0.9, 1.1), s))
    n_trees += 1
print(f"  trees: {n_trees}")

n_rocks = 0
tries = 0
while n_rocks < 22 and tries < 4000:
    tries += 1
    x = rng.uniform(-SX / 2 + 2, SX / 2 - 2)
    y = rng.uniform(-SY / 2 + 2, SY / 2 - 2)
    if path_dist(x, y) < 2.4 or math.hypot(x - TOWER_POS.x, y - TOWER_POS.y) < 6.0:
        continue
    s = rng.uniform(0.35, 1.5)
    instance(ROCKS[rng.randrange(3)], f"Rock.{n_rocks:03d}",
             (x, y, h_at(x, y) - 0.25 * s), rng.uniform(0, math.tau),
             (s, s * rng.uniform(0.8, 1.2), s * rng.uniform(0.7, 1.1)))
    n_rocks += 1

n_bush = 0
tries = 0
while n_bush < 40 and tries < 4000:
    tries += 1
    x = rng.uniform(-SX / 2 + 2, SX / 2 - 2)
    y = rng.uniform(-SY / 2 + 2, SY / 2 - 2)
    if path_dist(x, y) < 2.6 or math.hypot(x - TOWER_POS.x, y - TOWER_POS.y) < 8.0:
        continue
    s = rng.uniform(0.35, 0.85)
    instance(BUSH, f"Bush.{n_bush:03d}", (x, y, h_at(x, y) - 0.15 * s),
             rng.uniform(0, math.tau), (s, s, s * 0.6))
    n_bush += 1

# stepping stones along the path
for k in range(6, len(P_X) - 10, 9):
    x = float(P_X[k]) + rng.uniform(-0.3, 0.3)
    y = float(P_Y[k]) + rng.uniform(-0.3, 0.3)
    instance(ROCKS[k % 3], f"PathStone.{k}", (x, y, h_at(x, y) - 0.28),
             rng.uniform(0, math.tau), (0.55, 0.45, 0.16))

# ----------------------------------------------------------------------------
# the watchtower, appended at the end of the path
# ----------------------------------------------------------------------------

print("Appending watchtower ...")
if not os.path.exists(TOWER_BLEND):
    raise SystemExit("exports/watchtower.blend missing - run generate_watchtower.py first")
with bpy.data.libraries.load(TOWER_BLEND, link=False) as (src, dst):
    dst.collections = ["NordicWatchtower"]
tower_col = dst.collections[0]
scene.collection.children.link(tower_col)
tz = h_at(TOWER_POS.x, TOWER_POS.y)
tower_root = tower_col.objects["Watchtower_Root"]
tower_root.location = (TOWER_POS.x, TOWER_POS.y, tz - 0.10)
tower_root.rotation_euler = (0, 0, math.radians(225))  # door (local -45°) faces the path (-X)

# ----------------------------------------------------------------------------
# neutral lighting + cameras
# ----------------------------------------------------------------------------

print("Lighting and cameras ...")


def aim(obj, target):
    d = (Vector(target) - obj.location).normalized()
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def add_sun(name, loc, energy):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = energy
    ld.angle = math.radians(4)
    lo = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(lo)
    lo.location = loc
    aim(lo, (0, 0, 0))
    return lo


add_sun("Studio_Key", (45, -35, 60), 3.2)
add_sun("Studio_Fill", (-55, -25, 30), 1.1)
add_sun("Studio_Rim", (-10, 55, 45), 1.6)

world = bpy.data.worlds.new("Studio_World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
bg.inputs["Strength"].default_value = 0.25

cam_data = bpy.data.cameras.new("Camera_Path")
cam_data.lens = 40
cam_data.clip_end = 400
cam = bpy.data.objects.new("Camera_Path", cam_data)
scene.collection.objects.link(cam)
px, py = float(P_X[6]), float(P_Y[6])
cam.location = (px, py, h_at(px, py) + 3.4)
aim(cam, (TOWER_POS.x, TOWER_POS.y, tz + 6.0))
scene.camera = cam

cam2_data = bpy.data.cameras.new("Camera_Aerial")
cam2_data.lens = 40
cam2_data.clip_end = 400
cam2 = bpy.data.objects.new("Camera_Aerial", cam2_data)
scene.collection.objects.link(cam2)
cam2.location = (-36, 32, 28)
aim(cam2, (6, -2, 1.5))

# ----------------------------------------------------------------------------
# render / export settings
# ----------------------------------------------------------------------------

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 96
scene.cycles.use_denoising = True
try:
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
except TypeError:
    pass
scene.render.film_transparent = True
scene.render.image_settings.color_mode = "RGBA"
for vt in ("Filmic", "AgX", "Standard"):
    try:
        scene.view_settings.view_transform = vt
        break
    except TypeError:
        continue
if scene.view_settings.view_transform == "Filmic":
    try:
        scene.view_settings.look = "Medium High Contrast"
    except TypeError:
        pass
scene.view_settings.exposure = 0.4

# ----------------------------------------------------------------------------
# stats
# ----------------------------------------------------------------------------

uniq = {}
inst = 0
for ob in list(COL.objects) + list(tower_col.objects):
    if ob.type != "MESH":
        continue
    inst += 1
    uniq[ob.data.name] = ob.data
tot_q = tot_t = tot_n = 0
for me in uniq.values():
    tot_q += sum(1 for p in me.polygons if len(p.vertices) == 4)
    tot_t += sum(1 for p in me.polygons if len(p.vertices) == 3)
    tot_n += sum(1 for p in me.polygons if len(p.vertices) > 4)
faces = tot_q + tot_t + tot_n
print(f"\nTopology: {inst} mesh instances sharing {len(uniq)} unique meshes")
print(f"  unique faces={faces} ({100.0 * tot_q / max(faces, 1):.1f}% quads, "
      f"{tot_t} tris, {tot_n} ngons)\n")

# ----------------------------------------------------------------------------
# save, export, render
# ----------------------------------------------------------------------------

blend_path = os.path.join(EXPORT_DIR, "forest_watchtower.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
print(f"Saved {blend_path}")

glb_path = os.path.join(EXPORT_DIR, "forest_watchtower.glb")
bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB")
print(f"Exported {glb_path}")

if os.environ.get("WT_SKIP_RENDER") != "1":
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    scene.render.filepath = os.path.join(RENDER_DIR, "forest_path.png")
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {scene.render.filepath}")

    scene.camera = cam2
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1100
    scene.render.filepath = os.path.join(RENDER_DIR, "forest_aerial.png")
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {scene.render.filepath}")
    scene.camera = cam

print("Done.")
