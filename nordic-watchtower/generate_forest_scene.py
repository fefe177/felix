#!/usr/bin/env python3
"""
Giant Nordic forest diorama — same style as the watchtower, which is
appended from exports/watchtower.blend and placed on a knoll at the end
of a winding path through the trees. A pond with a large weeping willow
sits beside the path halfway along.

Run either way:
    python3 generate_forest_scene.py          # pip-installed bpy module
    blender --background --python generate_forest_scene.py

Requires exports/watchtower.blend (run generate_watchtower.py first).

Outputs:
    exports/forest_watchtower.blend
    exports/forest_watchtower.glb
    textures/forest_*.png
    renders/forest_path.png, forest_pond.png, forest_aerial.png
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

SX, SY = 70.0, 46.0
TOWER_POS = Vector((25.0, 0.0, 0.0))
BASE_Z = -2.0  # diorama slab bottom

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


def instance(mesh, name, loc, rot, scale):
    ob = bpy.data.objects.new(name, mesh)
    COL.objects.link(ob)
    ob.parent = ROOT
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = scale
    return ob


# ----------------------------------------------------------------------------
# heightfield, path, pond
# ----------------------------------------------------------------------------

print("Computing terrain heightfield ...")
HW, HH = 2048, 1344
Xw = np.linspace(-SX / 2, SX / 2, HW)[None, :].repeat(HH, axis=0)
Yw = np.linspace(-SY / 2, SY / 2, HH)[:, None].repeat(HW, axis=1)

P_T = np.linspace(0.0, 1.0, 140)
P_X = -34.0 + (TOWER_POS.x + 2.0 - -34.0) * P_T
P_Y = (5.5 * np.sin(P_T * 3.4 + 0.4) - 1.2) * (1 - P_T ** 2.2)

d_path = np.full((HH, HW), 1e9)
for px, py in zip(P_X, P_Y):
    d_path = np.minimum(d_path, np.hypot(Xw - px, Yw - py))
w_path = sstep((2.1 - d_path) / 1.4)

# pond beside the path, halfway along; the giant willow stands on its shore
k_p = 77
p_dir = Vector((float(P_X[k_p + 1] - P_X[k_p - 1]), float(P_Y[k_p + 1] - P_Y[k_p - 1]), 0)).normalized()
p_norm = Vector((-p_dir.y, p_dir.x, 0.0))
if p_norm.y < 0:
    p_norm = -p_norm
POND = Vector((float(P_X[k_p]), float(P_Y[k_p]), 0.0)) + p_norm * 7.6
WILLOW_POS = POND - p_dir * 6.6
d_pond = np.hypot(Xw - POND.x, Yw - POND.y)

n_macro = fbm((HH, HW), 7, 5, 5, 71)
d_tower = np.hypot(Xw - TOWER_POS.x, Yw - TOWER_POS.y)
knoll = 1.8 * np.exp(-(d_tower ** 2) / (2 * 9.0 ** 2))
hill1 = 1.5 * np.exp(-((Xw + 20) ** 2 + (Yw - 15) ** 2) / (2 * 10.0 ** 2))
hill2 = 1.2 * np.exp(-((Xw - 4) ** 2 + (Yw + 17) ** 2) / (2 * 9.0 ** 2))
HF = (n_macro - 0.5) * 2.1 * (1 - 0.75 * w_path) + knoll + hill1 + hill2
edge = sstep((SX / 2 - np.abs(Xw) - 1.0) / 5.0) * sstep((SY / 2 - np.abs(Yw) - 1.0) / 5.0)
HF *= 0.25 + 0.75 * edge
HF -= 0.35 * w_path * edge  # sunken, worn path
pond_center_h = float(HF[np.argmin(np.abs(np.linspace(-SY / 2, SY / 2, HH) - POND.y)),
                        np.argmin(np.abs(np.linspace(-SX / 2, SX / 2, HW) - POND.x))])
HF -= 1.6 * np.exp(-(d_pond ** 2) / (2 * 4.4 ** 2))
WATER_Z = pond_center_h - 0.42


def h_at(x, y):
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
# placements (before texturing, so the forest floor knows where trees are)
# ----------------------------------------------------------------------------

print("Scattering placements ...")
TREE_KINDS = ["spruce_tall", "spruce_slim", "spruce_wide", "pine", "young", "birch", "snag"]
TREE_WEIGHTS = [0.24, 0.18, 0.14, 0.16, 0.10, 0.13, 0.05]
CAM3_POS = POND + Vector((12.5, -9.5, 0.0))  # looks back across the water at the willow


def clear_of(x, y, pts, r):
    return all((x - p[0]) ** 2 + (y - p[1]) ** 2 >= r * r for p in pts)


tree_places = []
attempts = 0
while len(tree_places) < 150 and attempts < 30000:
    attempts += 1
    x = rng.uniform(-SX / 2 + 2.5, SX / 2 - 2.5)
    y = rng.uniform(-SY / 2 + 2.5, SY / 2 - 2.5)
    if path_dist(x, y) < 4.2:  # canopies must not overhang the path
        continue
    if math.hypot(x - TOWER_POS.x, y - TOWER_POS.y) < 9.5:
        continue
    if math.hypot(x - POND.x, y - POND.y) < 7.6:
        continue
    if math.hypot(x - WILLOW_POS.x, y - WILLOW_POS.y) < 6.5:
        continue
    if math.hypot(x - CAM3_POS.x, y - CAM3_POS.y) < 5.0:
        continue
    if math.hypot(x - float(P_X[10]), y - float(P_Y[10])) < 6.0:  # path camera
        continue
    if not clear_of(x, y, tree_places, 2.2):
        continue
    kind = rng.choices(range(len(TREE_KINDS)), TREE_WEIGHTS)[0]
    tree_places.append((x, y, kind, rng.uniform(0.62, 1.12)))
print(f"  trees: {len(tree_places)}")

# canopy density map for the forest-floor texture
D = np.zeros((HH, HW))
sig_px = 2.3 / SX * HW
for x, y, kind, s in tree_places:
    if TREE_KINDS[kind] == "snag":
        continue
    cx = int((x + SX / 2) / SX * (HW - 1))
    cy = int((y + SY / 2) / SY * (HH - 1))
    r = int(sig_px * s * 2.6)
    x0, x1 = max(cx - r, 0), min(cx + r + 1, HW)
    y0, y1 = max(cy - r, 0), min(cy + r + 1, HH)
    gx = np.arange(x0, x1) - cx
    gy = np.arange(y0, y1) - cy
    D[y0:y1, x0:x1] += np.exp(-(gy[:, None] ** 2 + gx[None, :] ** 2) / (2 * (sig_px * s) ** 2))
D = np.clip(D, 0, 1.6) / 1.6


def scatter(n, min_path, min_tower, min_pond, min_edge, spacing=0.0, near_path=None):
    out = []
    tries = 0
    while len(out) < n and tries < 25000:
        tries += 1
        x = rng.uniform(-SX / 2 + min_edge, SX / 2 - min_edge)
        y = rng.uniform(-SY / 2 + min_edge, SY / 2 - min_edge)
        pd = path_dist(x, y)
        if pd < min_path or (near_path and pd > near_path):
            continue
        if math.hypot(x - TOWER_POS.x, y - TOWER_POS.y) < min_tower:
            continue
        if math.hypot(x - POND.x, y - POND.y) < min_pond:
            continue
        if spacing and not clear_of(x, y, out, spacing):
            continue
        out.append((x, y))
    return out


rock_places = scatter(24, 2.4, 6.0, 5.9, 2.0, spacing=2.5)
bush_places = scatter(45, 2.4, 7.0, 6.2, 2.0, spacing=1.6)
log_places = scatter(3, 3.2, 10.0, 7.0, 4.0, spacing=8.0, near_path=8.0)
stump_places = scatter(7, 2.8, 8.0, 6.5, 3.0, spacing=5.0)
tuft_places = scatter(380, 1.7, 4.0, 5.8, 1.5)
flower_places = scatter(80, 2.0, 5.0, 5.8, 1.5)

# ----------------------------------------------------------------------------
# textures
# ----------------------------------------------------------------------------

print("Generating forest textures ...")
sh = (HH, HW)
g_var = fbm(sh, 9, 6, 4, 72)
g_fine = fbm(sh, 60, 40, 4, 73)
grass = lerp(np.array([0.270, 0.400, 0.140])[None, None, :],
             np.array([0.460, 0.580, 0.230])[None, None, :],
             (0.25 + 0.75 * g_var)[..., None])
grass *= (0.84 + 0.28 * g_fine)[..., None]

# forest floor (needle litter) under the tree canopies
floor_col = lerp(np.array([0.300, 0.235, 0.150])[None, None, :],
                 np.array([0.440, 0.360, 0.230])[None, None, :],
                 (fbm(sh, 26, 17, 4, 77))[..., None])
canopy = sstep((D - 0.12) / 0.35)
ter_col = lerp(grass, floor_col, (canopy * 0.7)[..., None])

dirt = lerp(np.array([0.50, 0.385, 0.260])[None, None, :],
            np.array([0.62, 0.50, 0.35])[None, None, :],
            (fbm(sh, 20, 13, 4, 74))[..., None])
worn = sstep((3.6 - d_path) / 1.8) * (1 - w_path) * (1 - canopy)
ter_col = lerp(ter_col, np.array([0.44, 0.50, 0.22])[None, None, :], (worn * 0.2)[..., None])
pebbles = sstep((fbm(sh, 90, 60, 3, 75) - 0.62) / 0.06) * w_path
p_mask = sstep((w_path + (g_var - 0.5) * 0.35 - 0.35) / 0.25)
ter_col = lerp(ter_col, dirt, p_mask[..., None])
ter_col = lerp(ter_col, np.array([0.50, 0.49, 0.47])[None, None, :], pebbles[..., None] * 0.7)

gy_, gx_ = np.gradient(HF)
slope = np.hypot(gx_ * (HW / SX), gy_ * (HH / SY))
r_mask = sstep((slope - 0.30) / 0.20) * (1 - p_mask)
ter_col = lerp(ter_col, np.array([0.44, 0.435, 0.42])[None, None, :] *
               (0.75 + 0.45 * g_fine)[..., None], r_mask[..., None] * 0.8)

# pond shore: mud ring and dark sediment under water
uw = sstep((WATER_Z + 0.06 - HF) / 0.25)
shore = sstep((6.6 - d_pond) / 1.6) * (1 - uw)
ter_col = lerp(ter_col, np.array([0.46, 0.375, 0.255])[None, None, :]
               * (0.82 + 0.3 * g_fine)[..., None], (shore * 0.75)[..., None])
ter_col = lerp(ter_col, np.array([0.23, 0.20, 0.145])[None, None, :], uw[..., None])

ter_rough = 0.88 - 0.10 * p_mask + 0.05 * g_fine - 0.15 * uw
ter_orm = np.stack([np.full(sh, 0.85), ter_rough, np.zeros(sh)], axis=-1)
ter_h = g_fine * 0.5 + p_mask * -0.3 + fbm(sh, 130, 85, 2, 76) * 0.35 - canopy * 0.15
TER_IMGS = (
    make_image("forest_terrain_col", ter_col, "sRGB"),
    make_image("forest_terrain_orm", ter_orm, "Non-Color"),
    make_image("forest_terrain_nrm", normal_map(ter_h, 1.8), "Non-Color"),
)


def foliage_textures(name, col_a, col_b, seed):
    s2 = (512, 512)
    mottle = fbm(s2, 12, 12, 4, seed)
    fine = fbm(s2, 60, 60, 3, seed + 7)
    col = lerp(np.array(col_a)[None, None, :], np.array(col_b)[None, None, :],
               (0.15 + 0.85 * mottle)[..., None])
    col *= (0.80 + 0.38 * fine)[..., None]
    rough = 0.72 + 0.22 * mottle
    orm = np.stack([np.full(s2, 0.85), rough, np.zeros(s2)], axis=-1)
    return (
        make_image(name + "_col", col, "sRGB"),
        make_image(name + "_orm", orm, "Non-Color"),
        make_image(name + "_nrm", normal_map(mottle * 0.5 + fine * 0.4, 1.3), "Non-Color"),
    )


FOL_A = foliage_textures("forest_spruce", (0.200, 0.360, 0.190), (0.400, 0.570, 0.280), 81)
FOL_B = foliage_textures("forest_pine", (0.240, 0.400, 0.150), (0.460, 0.600, 0.230), 85)
LEAFY = foliage_textures("forest_leafy", (0.270, 0.430, 0.150), (0.520, 0.640, 0.260), 87)
WILLOW_FOL = foliage_textures("forest_willow", (0.320, 0.460, 0.170), (0.560, 0.640, 0.280), 89)

s3 = (256, 256)
bark_g = fbm(s3, 18, 4, 4, 91)
bark_col = np.array([0.38, 0.27, 0.18])[None, None, :] * (0.72 + 0.52 * bark_g)[..., None]
bark_orm = make_image("forest_bark_orm",
                      np.stack([np.full(s3, 0.9), 0.68 + 0.25 * bark_g, np.zeros(s3)], -1),
                      "Non-Color")
bark_nrm = make_image("forest_bark_nrm", normal_map(bark_g * 0.7, 1.8), "Non-Color")
BARK_IMGS = (make_image("forest_bark_col", bark_col, "sRGB"), bark_orm, bark_nrm)
gray_col = np.array([0.35, 0.34, 0.31])[None, None, :] * (0.68 + 0.55 * bark_g)[..., None]
GRAY_BARK_IMGS = (make_image("forest_graybark_col", gray_col, "sRGB"), bark_orm, bark_nrm)

# birch bark: white with dark horizontal lenticel dashes
bb_fine = fbm(s3, 20, 20, 3, 93)
bb_dash = sstep((fbm(s3, 4, 42, 3, 92) - 0.60) / 0.07)
birch_col = np.array([0.76, 0.74, 0.70])[None, None, :] * (0.88 + 0.18 * bb_fine)[..., None]
birch_col = lerp(birch_col, np.array([0.13, 0.11, 0.10])[None, None, :],
                 (bb_dash * 0.9)[..., None])
BIRCH_IMGS = (
    make_image("forest_birch_col", birch_col, "sRGB"),
    make_image("forest_birch_orm",
               np.stack([np.full(s3, 0.9), 0.55 + 0.25 * bb_fine, np.zeros(s3)], -1), "Non-Color"),
    make_image("forest_birch_nrm", normal_map(bb_dash * -0.5 + bb_fine * 0.3, 1.2), "Non-Color"),
)

rock_g = fbm(s3, 6, 6, 5, 95)
rock_col = np.stack([0.48 + 0.26 * rock_g, 0.48 + 0.26 * rock_g,
                     0.47 + 0.25 * rock_g], axis=-1)
rock_col *= (0.85 + 0.3 * fbm(s3, 20, 20, 3, 96))[..., None]
rock_moss = sstep((fbm(s3, 9, 9, 4, 97) - 0.55) / 0.15)
rock_col = lerp(rock_col, np.array([0.22, 0.34, 0.12])[None, None, :],
                (rock_moss * 0.55)[..., None])
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
MAT_LEAFY = pbr_material("F_LeafyFoliage", LEAFY, rough=0.78)
MAT_WILLOW = pbr_material("F_WillowFoliage", WILLOW_FOL, rough=0.78)
MAT_BARK = pbr_material("F_Bark", BARK_IMGS, rough=0.75)
MAT_GRAY = pbr_material("F_DeadWood", GRAY_BARK_IMGS, rough=0.8)
MAT_BIRCH = pbr_material("F_BirchBark", BIRCH_IMGS, rough=0.6)
MAT_ROCK = pbr_material("F_Rock", ROCK_IMGS, rough=0.8)
MAT_WATER = pbr_material("F_Water", None, base=(0.125, 0.175, 0.185, 1), rough=0.2)
MAT_TUFT = pbr_material("F_GrassTuft", None, base=(0.34, 0.50, 0.18, 1), rough=0.75)
MAT_FLOWER_W = pbr_material("F_FlowerWhite", None, base=(0.88, 0.87, 0.80, 1), rough=0.5)
MAT_FLOWER_P = pbr_material("F_FlowerPurple", None, base=(0.58, 0.38, 0.78, 1), rough=0.5)

# ----------------------------------------------------------------------------
# terrain mesh + pond water
# ----------------------------------------------------------------------------

print("Building terrain ...")
NX, NY = 84, 55
ter = bmesh.new()
grid = [[ter.verts.new((-SX / 2 + i * SX / NX, -SY / 2 + j * SY / NY,
                        h_at(-SX / 2 + i * SX / NX, -SY / 2 + j * SY / NY)))
         for i in range(NX + 1)] for j in range(NY + 1)]
top_faces = []
for j in range(NY):
    for i in range(NX):
        f = ter.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        top_faces.append(f)
loop = ([grid[0][i] for i in range(NX + 1)]
        + [grid[j][NX] for j in range(1, NY + 1)]
        + [grid[NY][i] for i in range(NX - 1, -1, -1)]
        + [grid[j][0] for j in range(NY - 1, 0, -1)])
bottom = [ter.verts.new((v.co.x, v.co.y, BASE_Z)) for v in loop]
for k in range(len(loop)):
    k2 = (k + 1) % len(loop)
    ter.faces.new((loop[k2], loop[k], bottom[k], bottom[k2]))
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

# flat quad disc via lathe (grid_fill can't seed a bare boundary loop)
water = spin([(0.03, 0.0), (1.4, 0.0), (2.8, 0.0), (4.2, 0.0), (5.5, 0.0)],
             segments=24)
bmesh.ops.transform(water, matrix=Matrix.Translation((POND.x, POND.y, WATER_Z)),
                    verts=water.verts[:])
for f in water.faces:
    if f.normal.z < 0:
        f.normal_flip()
box_uv(water, scale=0.1)
to_object("Forest_Pond", water, MAT_WATER)

# ----------------------------------------------------------------------------
# tree archetypes v2 (quad-only, 10-segment lathes, drooping jittered skirts)
# ----------------------------------------------------------------------------


def conifer_mesh(name, layers, trunk_top, tip, fol_mat, seed, droop=0.16):
    trng = random.Random(seed)
    bm = bmesh.new()
    trunk = spin([(0.30, -0.5), (0.22, 0.4), (0.16, trunk_top * 0.6), (0.11, trunk_top)],
                 segments=8)
    cap_ring(trunk, -0.5)
    merge_into(bm, trunk)
    trunk_faces = list(bm.faces)
    for z0, R, h in layers:
        d = droop * h
        prof = [(R, z0 - d), (R * 0.55, z0 + h * 0.52), (R * 0.20, z0 + h),
                (R * 0.14, z0 + h - 0.06), (R * 0.45, z0 + h * 0.46),
                (R * 0.82, z0 - d + 0.10)]
        layer = spin(prof, segments=10, close=True)
        rot = Matrix.Rotation(trng.uniform(0, math.tau), 4, "Z")
        bmesh.ops.transform(layer, matrix=rot, verts=layer.verts[:])
        merge_into(bm, layer)
    tz, tr, th = tip
    tip_bm = spin([(tr, tz), (0.035, tz + th)], segments=10)
    cap_ring(tip_bm, tz + th)
    cap_ring(tip_bm, tz)
    merge_into(bm, tip_bm)
    trunk_set = set(trunk_faces)
    for f in bm.faces:
        f.material_index = 0 if f in trunk_set else 1
    for v in bm.verts:
        if v.co.z > 0.4 and Vector((v.co.x, v.co.y)).length > 0.3:
            s = 1.0 + trng.uniform(-0.09, 0.09)
            v.co.x *= s
            v.co.y *= s
            v.co.z += trng.uniform(-0.07, 0.07)
    box_uv(bm, scale=0.4)
    return to_object(name, bm, [MAT_BARK, fol_mat], smooth_angle=0.6, link=False)


def blob(bm, center, radius, seed, squash=0.8):
    """Displaced cube-sphere leaf cluster (quads)."""
    piece = bmesh.new()
    bmesh.ops.create_cube(piece, size=1.0)
    bmesh.ops.subdivide_edges(piece, edges=piece.edges[:], cuts=3, use_grid_fill=True)
    brng = random.Random(seed)
    for v in piece.verts:
        d = v.co.normalized()
        n = brng.uniform(-0.14, 0.14) + 0.1 * math.sin(v.co.x * 9 + seed) \
            + 0.08 * math.sin(v.co.y * 7 + v.co.z * 8)
        v.co = d * (1.0 + n) * radius
    bmesh.ops.transform(piece, matrix=Matrix.Diagonal((1.0, 1.0, squash, 1.0)),
                        verts=piece.verts[:])
    merge_into(bm, piece, Matrix.Translation(center))


def birch_mesh(name, seed):
    brng = random.Random(seed)
    bm = bmesh.new()
    trunk = spin([(0.16, -0.4), (0.12, 2.0), (0.09, 4.0), (0.06, 5.6)], segments=8)
    cap_ring(trunk, -0.4)
    cap_ring(trunk, 5.6)
    merge_into(bm, trunk)
    trunk_faces = list(bm.faces)
    for k in range(brng.randint(3, 4)):
        a = brng.uniform(0, math.tau)
        r = brng.uniform(0.2, 0.9)
        blob(bm, (r * math.cos(a), r * math.sin(a), 4.6 + brng.uniform(0, 1.4)),
             brng.uniform(0.8, 1.3), seed * 7 + k)
    trunk_set = set(trunk_faces)
    for f in bm.faces:
        f.material_index = 0 if f in trunk_set else 1
    box_uv(bm, scale=0.5)
    return to_object(name, bm, [MAT_BIRCH, MAT_LEAFY], smooth_angle=0.7, link=False)


def snag_mesh(name, seed):
    srng = random.Random(seed)
    bm = bmesh.new()
    trunk = spin([(0.26, -0.4), (0.18, 2.5), (0.10, 5.0), (0.03, 6.8)], segments=8)
    cap_ring(trunk, -0.4)
    cap_ring(trunk, 6.8)
    merge_into(bm, trunk)
    for k in range(4):
        z = 2.0 + k * 1.2 + srng.uniform(-0.3, 0.3)
        a = srng.uniform(0, math.tau)
        L = srng.uniform(0.8, 1.6)
        br = spin([(0.055, 0.0), (0.014, L)], segments=6)
        cap_ring(br, L)
        cap_ring(br, 0.0)
        merge_into(bm, br, Matrix.Rotation(a, 4, "Z") @ Matrix.Translation((0.1, 0, z))
                   @ Matrix.Rotation(math.radians(srng.uniform(55, 80)), 4, "Y"))
    box_uv(bm, scale=0.5)
    return to_object(name, bm, MAT_GRAY, smooth_angle=0.7, link=False)


print("Building trees ...")
TREE_MESHES = {
    "spruce_tall": conifer_mesh("Tree_SpruceTall",
                                [(0.9, 2.35, 2.1), (2.3, 1.95, 1.9), (3.6, 1.55, 1.8),
                                 (4.8, 1.20, 1.6), (5.9, 0.90, 1.5), (6.9, 0.65, 1.3)],
                                2.0, (7.6, 0.50, 1.7), MAT_FOL_A, 101),
    "spruce_slim": conifer_mesh("Tree_SpruceSlim",
                                [(0.8, 1.55, 1.7), (2.0, 1.25, 1.6), (3.1, 1.00, 1.5),
                                 (4.1, 0.75, 1.4), (5.0, 0.55, 1.2)],
                                1.6, (5.7, 0.40, 1.5), MAT_FOL_A, 102),
    "spruce_wide": conifer_mesh("Tree_SpruceWide",
                                [(0.8, 2.75, 2.3), (2.4, 2.2, 2.0), (3.9, 1.65, 1.8),
                                 (5.2, 1.15, 1.6)],
                                1.7, (6.1, 0.75, 1.6), MAT_FOL_A, 103, droop=0.20),
    "pine": conifer_mesh("Tree_Pine",
                         [(2.2, 2.3, 1.9), (3.6, 1.75, 1.7), (4.8, 1.15, 1.5)],
                         3.0, (5.8, 0.75, 1.2), MAT_FOL_B, 104, droop=0.10),
    "young": conifer_mesh("Tree_Young",
                          [(0.5, 1.15, 1.3), (1.5, 0.85, 1.2), (2.4, 0.60, 1.0)],
                          1.1, (3.0, 0.40, 1.1), MAT_FOL_B, 105),
    "birch": birch_mesh("Tree_Birch", 106),
    "snag": snag_mesh("Tree_Snag", 107),
}

# ----------------------------------------------------------------------------
# props: rocks, bushes, logs, stumps, grass tufts, flowers, willow
# ----------------------------------------------------------------------------


def rock_mesh(name, seed):
    rrng = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
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


ROCKS = [rock_mesh(f"Rock_{i}", 110 + i) for i in range(3)]

bush_bm = bmesh.new()
blob(bush_bm, (0, 0, 0.35), 0.55, 131, squash=0.7)
blob(bush_bm, (0.45, 0.2, 0.25), 0.4, 132, squash=0.7)
blob(bush_bm, (-0.35, -0.25, 0.28), 0.45, 133, squash=0.7)
box_uv(bush_bm, scale=0.6)
BUSH = to_object("Bush", bush_bm, MAT_LEAFY, smooth_angle=0.7, link=False)


def log_mesh(name, seed):
    lrng = random.Random(seed)
    L = lrng.uniform(2.8, 4.2)
    bm = spin([(0.26, 0.0), (0.23, L * 0.5), (0.19, L)], segments=8)
    cap_ring(bm, 0.0)
    cap_ring(bm, L)
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.pi / 2, 4, "Y"), verts=bm.verts[:])
    box_uv(bm, scale=0.5)
    return to_object(name, bm, MAT_BARK, smooth_angle=0.7, link=False)


LOGS = [log_mesh(f"Log_{i}", 140 + i) for i in range(2)]

stump_bm = spin([(0.34, -0.2), (0.30, 0.25), (0.27, 0.55)], segments=8)
cap_ring(stump_bm, -0.2)
cap_ring(stump_bm, 0.55)
box_uv(stump_bm, scale=0.5)
STUMP = to_object("Stump", stump_bm, MAT_GRAY, smooth_angle=0.7, link=False)


def tuft_mesh(name, blades, seed, flower_mat=None):
    trng = random.Random(seed)
    bm = bmesh.new()
    for k in range(blades):
        a = k * math.tau / blades + trng.uniform(-0.3, 0.3)
        lean = trng.uniform(0.10, 0.30)
        h = trng.uniform(0.22, 0.38)
        w0, w1 = 0.055, 0.014
        da = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-math.sin(a), math.cos(a), 0))
        b0 = da * 0.03
        v = [bm.verts.new(b0 - side * w0 / 2),
             bm.verts.new(b0 + side * w0 / 2),
             bm.verts.new(b0 + da * lean + side * w1 / 2 + Vector((0, 0, h))),
             bm.verts.new(b0 + da * lean - side * w1 / 2 + Vector((0, 0, h)))]
        f = bm.faces.new(v)
        f.material_index = 0
    if flower_mat is not None:
        s = 0.085
        c = Vector((0, 0, 0.42))
        v = [bm.verts.new(c + Vector((-s, 0, 0))), bm.verts.new(c + Vector((0, -s, 0.02))),
             bm.verts.new(c + Vector((s, 0, 0))), bm.verts.new(c + Vector((0, s, 0.02)))]
        bm.faces.new(v).material_index = 1
        stem = [bm.verts.new(Vector((0.012, 0, 0))), bm.verts.new(Vector((-0.012, 0, 0))),
                bm.verts.new(Vector((-0.008, 0, 0.40))), bm.verts.new(Vector((0.008, 0, 0.40)))]
        bm.faces.new(stem).material_index = 0
    box_uv(bm, scale=1.0)
    mats = [MAT_TUFT] + ([flower_mat] if flower_mat else [])
    return to_object(name, bm, mats, smooth_angle=1.2, link=False)


TUFTS = [tuft_mesh(f"Tuft_{i}", 5, 150 + i) for i in range(2)]
FLOWERS = [tuft_mesh("FlowerWhite", 3, 160, MAT_FLOWER_W),
           tuft_mesh("FlowerPurple", 3, 161, MAT_FLOWER_P)]

# the giant weeping willow
print("Building willow ...")
wil = bmesh.new()
trunk = spin([(0.55, -0.4), (0.40, 1.6), (0.30, 3.6), (0.22, 5.4), (0.13, 7.0)], segments=10)
cap_ring(trunk, -0.4)
cap_ring(trunk, 7.0)
merge_into(wil, trunk)
wil_trunk_faces = list(wil.faces)
wrng = random.Random(171)
# two rounded, drooping canopy domes + a soft cap — reads as a weeping crown
for z0, R, droop in ((5.4, 4.0, 2.8), (6.6, 2.8, 2.0)):
    prof = [(0.20 * R, z0 + 0.55), (0.55 * R, z0 + 0.42), (0.85 * R, z0 + 0.18),
            (R, z0 - 0.20), (1.01 * R, z0 - droop), (0.92 * R, z0 - droop - 0.15),
            (0.80 * R, z0 - droop + 0.25), (0.48 * R, z0 - 0.05), (0.20 * R, z0 + 0.32)]
    tier = spin(prof, segments=12, close=True)
    bmesh.ops.transform(tier, matrix=Matrix.Rotation(wrng.uniform(0, math.tau), 4, "Z"),
                        verts=tier.verts[:])
    merge_into(wil, tier)
cap = spin([(0.03, 8.6), (0.90, 8.35), (1.50, 7.85), (1.75, 7.30),
            (1.20, 7.35), (0.03, 7.70)], segments=12, close=True)
merge_into(wil, cap)
# hanging strands around the outer dome
for k in range(36):
    a = k * math.tau / 36 + wrng.uniform(-0.05, 0.05)
    da = Vector((math.cos(a), math.sin(a), 0))
    side = Vector((-math.sin(a), math.cos(a), 0))
    r0 = 3.95 + wrng.uniform(-0.25, 0.2)
    top = da * r0 + Vector((0, 0, 5.4 - 2.8 + 0.5))
    length = wrng.uniform(2.0, 3.4)
    segs = 4
    w0 = 0.20
    prev = None
    for s_i in range(segs + 1):
        t = s_i / segs
        p = top + Vector((0, 0, -length * t)) + da * (-0.30 * t * t + 0.08 * math.sin(t * 9 + k))
        wl = w0 * (1 - 0.55 * t)
        v0 = wil.verts.new(p - side * wl / 2)
        v1 = wil.verts.new(p + side * wl / 2)
        if prev:
            f = wil.faces.new((prev[0], prev[1], v1, v0))
            if f.normal.dot(da) < 0:
                f.normal_flip()
        prev = (v0, v1)
wt_set = set(wil_trunk_faces)
for f in wil.faces:
    f.material_index = 0 if f in wt_set else 1
for v in wil.verts:
    if v.co.z > 2.0 and Vector((v.co.x, v.co.y)).length > 0.8:
        s = 1.0 + wrng.uniform(-0.08, 0.08)
        v.co.x *= s
        v.co.y *= s
        v.co.z += wrng.uniform(-0.09, 0.09)
box_uv(wil, scale=0.4)
willow_me = to_object("Tree_Willow", wil, [MAT_BARK, MAT_WILLOW], smooth_angle=0.7, link=False)
wz = h_at(WILLOW_POS.x, WILLOW_POS.y)
instance(willow_me, "Willow", (WILLOW_POS.x, WILLOW_POS.y, wz - 0.15),
         (0.02, -0.02, wrng.uniform(0, math.tau)), (1.0, 1.0, 1.0))

# ----------------------------------------------------------------------------
# instantiate all placements
# ----------------------------------------------------------------------------

print("Planting forest ...")
for idx, (x, y, kind, s) in enumerate(tree_places):
    mesh = TREE_MESHES[TREE_KINDS[kind]]
    instance(mesh, f"Tree.{idx:03d}", (x, y, h_at(x, y) - 0.15),
             (rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), rng.uniform(0, math.tau)),
             (s * rng.uniform(0.9, 1.1), s * rng.uniform(0.9, 1.1), s))
for idx, (x, y) in enumerate(rock_places):
    s = rng.uniform(0.35, 1.5)
    instance(ROCKS[idx % 3], f"Rock.{idx:03d}", (x, y, h_at(x, y) - 0.25 * s),
             (0, 0, rng.uniform(0, math.tau)),
             (s, s * rng.uniform(0.8, 1.2), s * rng.uniform(0.7, 1.1)))
for idx, (x, y) in enumerate(bush_places):
    s = rng.uniform(0.5, 1.2)
    instance(BUSH, f"Bush.{idx:03d}", (x, y, h_at(x, y) - 0.1 * s),
             (0, 0, rng.uniform(0, math.tau)), (s, s, s * rng.uniform(0.7, 0.9)))
for idx, (x, y) in enumerate(log_places):
    instance(LOGS[idx % 2], f"Log.{idx}", (x, y, h_at(x, y) + 0.05),
             (rng.uniform(-0.05, 0.05), 0, rng.uniform(0, math.tau)), (1, 1, 1))
for idx, (x, y) in enumerate(stump_places):
    s = rng.uniform(0.7, 1.2)
    instance(STUMP, f"Stump.{idx}", (x, y, h_at(x, y) - 0.05),
             (0, 0, rng.uniform(0, math.tau)), (s, s, s))
for idx, (x, y) in enumerate(tuft_places):
    s = rng.uniform(0.7, 1.6)
    instance(TUFTS[idx % 2], f"Tuft.{idx:03d}", (x, y, h_at(x, y) - 0.02),
             (0, 0, rng.uniform(0, math.tau)), (s, s, s))
for idx, (x, y) in enumerate(flower_places):
    s = rng.uniform(0.8, 1.3)
    instance(FLOWERS[idx % 2], f"Flower.{idx:03d}", (x, y, h_at(x, y) - 0.02),
             (0, 0, rng.uniform(0, math.tau)), (s, s, s))

# ----------------------------------------------------------------------------
# the watchtower at the end of the path
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
tower_root.rotation_euler = (0, 0, math.radians(225))  # door (local -45 deg) faces the path

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
add_sun("Studio_Fill", (-55, -25, 30), 1.4)
add_sun("Studio_Rim", (-10, 55, 45), 1.6)

world = bpy.data.worlds.new("Studio_World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
bg.inputs["Strength"].default_value = 0.25


def add_camera(name, loc, target, lens):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_end = 400
    ob = bpy.data.objects.new(name, cd)
    scene.collection.objects.link(ob)
    ob.location = loc
    aim(ob, target)
    return ob


px, py = float(P_X[10]), float(P_Y[10])
cam = add_camera("Camera_Path", (px, py, h_at(px, py) + 3.0),
                 (TOWER_POS.x, TOWER_POS.y, tz + 5.0), 36)
cam3 = add_camera("Camera_Pond", (CAM3_POS.x, CAM3_POS.y, h_at(CAM3_POS.x, CAM3_POS.y) + 3.4),
                  (WILLOW_POS.x, WILLOW_POS.y, WATER_Z + 3.2), 32)
cam2 = add_camera("Camera_Aerial", (-36, 32, 28), (6, -2, 1.5), 40)
scene.camera = cam

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
inst_count = 0
for ob in list(COL.objects) + list(tower_col.objects):
    if ob.type != "MESH":
        continue
    inst_count += 1
    uniq[ob.data.name] = ob.data
tot_q = tot_t = tot_n = 0
for me in uniq.values():
    tot_q += sum(1 for p in me.polygons if len(p.vertices) == 4)
    tot_t += sum(1 for p in me.polygons if len(p.vertices) == 3)
    tot_n += sum(1 for p in me.polygons if len(p.vertices) > 4)
faces = tot_q + tot_t + tot_n
print(f"\nTopology: {inst_count} mesh instances sharing {len(uniq)} unique meshes")
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
    for camera, fname, res in ((cam, "forest_path.png", (1600, 1000)),
                               (cam3, "forest_pond.png", (1600, 1000)),
                               (cam2, "forest_aerial.png", (1600, 1100))):
        scene.camera = camera
        scene.render.resolution_x, scene.render.resolution_y = res
        scene.render.filepath = os.path.join(RENDER_DIR, fname)
        bpy.ops.render.render(write_still=True)
        print(f"Rendered {scene.render.filepath}")
    scene.camera = cam

print("Done.")
