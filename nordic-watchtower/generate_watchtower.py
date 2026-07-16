#!/usr/bin/env python3
"""
Weathered Nordic stone watchtower — procedural Blender generator.

Brief: three stories, circular base, wooden shingle roof, arched windows,
iron reinforcements, moss and ivy on the lower walls, stylized realistic,
PBR materials, clean quad topology, game-ready, neutral studio lighting,
isolated object, no background, no ground plane, full model visible.

Run either way:
    python3 generate_watchtower.py            # pip-installed bpy module
    blender --background --python generate_watchtower.py

Outputs (next to this script):
    exports/watchtower.blend   full scene: model + PBR materials + studio lights + camera
    exports/watchtower.glb     game-ready asset (textures embedded, no lights/camera)
    textures/*.png             generated PBR maps (baseColor / ORM / normal)
    renders/*.png              Cycles preview renders (transparent background)
"""

import math
import os
import random

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector, Euler

# ----------------------------------------------------------------------------
# config
# ----------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEX_DIR = os.path.join(BASE_DIR, "textures")
EXPORT_DIR = os.path.join(BASE_DIR, "exports")
RENDER_DIR = os.path.join(BASE_DIR, "renders")
for d in (TEX_DIR, EXPORT_DIR, RENDER_DIR):
    os.makedirs(d, exist_ok=True)

SEED = 7
rng = random.Random(SEED)

SEGMENTS = 24          # radial segments for all spun geometry
H_TOP = 9.45           # top of the stone wall (under the roof)

# tower silhouette, bottom to top: (radius, z)
PROFILE = [
    (3.05, 0.00), (3.05, 0.55), (2.92, 0.72),   # plinth
    (2.72, 0.85), (2.62, 3.05),                  # story 1
    (2.78, 3.18), (2.78, 3.42), (2.62, 3.52),    # string course 1
    (2.52, 3.62), (2.44, 5.95),                  # story 2
    (2.60, 6.08), (2.60, 6.30), (2.46, 6.40),    # string course 2
    (2.36, 6.50), (2.30, 8.75),                  # story 3
    (2.52, 8.92), (2.56, 9.45),                  # corbel under the roof
]
_PZ = np.array([p[1] for p in PROFILE])
_PR = np.array([p[0] for p in PROFILE])

BAND_ZS = [1.05, 5.68, 8.48]  # iron band heights

# roof cone: outer shell from (R, z) at the eave to near the apex
ROOF_R0, ROOF_Z0 = 3.05, 9.50
ROOF_R1, ROOF_Z1 = 0.10, 12.80


def wall_r(z):
    return float(np.interp(z, _PZ, _PR))


# ----------------------------------------------------------------------------
# fresh scene
# ----------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

COL = bpy.data.collections.new("NordicWatchtower")
scene.collection.children.link(COL)
ROOT = bpy.data.objects.new("Watchtower_Root", None)
COL.objects.link(ROOT)

# ----------------------------------------------------------------------------
# procedural PBR textures (numpy -> packed PNGs)
# ----------------------------------------------------------------------------


def _value_noise(shape, fx, fy, seed):
    """Tileable bilinear value noise, independent x/y frequency."""
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
    """arr: (H, W, 3) float in [0,1]; sRGB arrays are display-referred."""
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


def build_stone_textures(size=1024):
    """Coursed granite masonry; moss creeps up from the bottom of v.
    The tower's cylindrical UVs put v=0 at the plinth and v=1 under the roof,
    so the moss gradient in the texture lands on the lower walls."""
    sh = (size, size)
    V = ((np.arange(size) + 0.5) / size)[:, None]
    U = ((np.arange(size) + 0.5) / size)[None, :]
    rows, cols = 26, 16
    vv = V * rows
    rr = np.floor(vv).astype(int)
    fv = vv - rr
    uu = U * cols + (rr % 2) * 0.5
    cc = np.floor(uu).astype(int)
    fu = uu - cc
    rs = np.random.RandomState(11)
    b1 = rs.rand(rows, cols)[rr % rows, cc % cols]
    b2 = rs.rand(rows, cols)[rr % rows, cc % cols]
    b3 = rs.rand(rows, cols)[rr % rows, cc % cols]

    # distance to block edge, in meters (texture spans ~8 m x 9.45 m)
    du = np.minimum(fu, 1 - fu) * (8.0 / cols)
    dv = np.minimum(fv, 1 - fv) * (9.45 / rows)
    d = np.minimum(du, dv)
    hb = sstep((d - 0.012) / 0.035)

    n_fine = fbm(sh, 8, 8, 5, 21)
    n_soft = fbm(sh, 3, 3, 4, 22)
    height = hb * (0.82 + 0.28 * b2) + n_fine * 0.30 * hb + n_soft * 0.06
    hn = height / max(height.max(), 1e-6)

    gray = 0.50 + 0.24 * b1
    tint = b3 - 0.5
    col = np.stack([
        gray * (1 + 0.10 * tint) * 0.99,
        gray,
        gray * (1 - 0.08 * tint) * 1.03,
    ], axis=-1)
    col *= (0.90 + 0.20 * fbm(sh, 6, 6, 4, 23))[..., None]
    mortar = np.full_like(col, 0.38)
    mortar[..., 2] *= 0.96
    mm = sstep((d - 0.010) / 0.020)
    col = lerp(mortar, col, mm[..., None])
    col *= (0.84 + 0.16 * hn)[..., None]
    col *= (0.90 + 0.20 * n_soft)[..., None]

    # moss: dense at the base, patchy as it climbs, hugging recesses
    mz = np.clip((0.38 - V) / 0.32, 0, 1) ** 1.2
    mz = np.broadcast_to(mz, sh)
    mn = fbm(sh, 10, 10, 5, 31)
    mask = mz * sstep((mn - (0.22 + 0.40 * (1 - mz))) / 0.14)
    mask = sstep(np.clip(mask * (1 - 0.35 * hn) * 1.7, 0, 1) * 1.25)
    moss = np.stack([
        0.070 + 0.090 * mn,
        0.180 + 0.150 * mn,
        0.035 + 0.040 * mn,
    ], axis=-1)
    col = lerp(col, moss, mask[..., None])

    rough = lerp(0.72 + 0.16 * n_fine, 0.92, mask)
    occl = 0.62 + 0.38 * hn
    orm = np.stack([occl, rough, np.zeros(sh)], axis=-1)
    # moss only softens the block relief; puffing it up reads as sheen blobs
    h2 = height * (1 - mask * 0.35)
    return (
        make_image("watchtower_stone_col", col, "sRGB"),
        make_image("watchtower_stone_orm", orm, "Non-Color"),
        make_image("watchtower_stone_nrm", normal_map(h2, 2.0), "Non-Color"),
    )


def build_wood_textures(size=1024):
    sh = (size, size)
    grain = fbm(sh, 36, 5, 4, 41)
    streak = sstep((fbm(sh, 64, 7, 4, 42) - 0.60) / 0.12)
    base = np.array([0.42, 0.29, 0.165])
    col = base[None, None, :] * (0.78 + 0.45 * grain)[..., None]
    col *= (1 - 0.22 * streak)[..., None]
    rough = 0.50 + 0.28 * (1 - grain)
    orm = np.stack([np.full(sh, 0.9), rough, np.zeros(sh)], axis=-1)
    return (
        make_image("watchtower_wood_col", col, "sRGB"),
        make_image("watchtower_wood_orm", orm, "Non-Color"),
        make_image("watchtower_wood_nrm", normal_map(grain * 0.6 - streak * 0.2, 1.6), "Non-Color"),
    )


def build_shingle_textures(size=1024):
    sh = (size, size)
    weather = fbm(sh, 4, 4, 4, 51)
    grain = fbm(sh, 30, 4, 4, 52)
    col_a = np.array([0.37, 0.305, 0.235])
    col_b = np.array([0.54, 0.53, 0.50])
    col = lerp(col_a[None, None, :], col_b[None, None, :],
               (0.25 + 0.75 * weather)[..., None])
    col *= (0.82 + 0.32 * grain)[..., None]
    rough = 0.62 + 0.25 * weather
    orm = np.stack([np.full(sh, 0.9), rough, np.zeros(sh)], axis=-1)
    return (
        make_image("watchtower_shingle_col", col, "sRGB"),
        make_image("watchtower_shingle_orm", orm, "Non-Color"),
        make_image("watchtower_shingle_nrm", normal_map(grain * 0.5 + weather * 0.3, 1.5), "Non-Color"),
    )


def build_iron_textures(size=512):
    sh = (size, size)
    f1 = fbm(sh, 6, 6, 4, 61)
    rust_n = fbm(sh, 10, 10, 5, 62)
    gray = 0.075 + 0.060 * f1
    col = np.stack([gray, gray * 1.02, gray * 1.06], axis=-1)
    rust = np.clip((rust_n - 0.58) * 3.2, 0, 1) * 0.6
    col = lerp(col, np.array([0.155, 0.07, 0.03])[None, None, :], rust[..., None])
    rough = np.clip(0.45 + 0.28 * f1 + 0.22 * rust, 0, 0.95)
    metal = 0.85 - 0.45 * rust
    orm = np.stack([np.full(sh, 1.0), rough, metal], axis=-1)
    return (
        make_image("watchtower_iron_col", col, "sRGB"),
        make_image("watchtower_iron_orm", orm, "Non-Color"),
        make_image("watchtower_iron_nrm", normal_map(f1 * 0.35 + rust * 0.2, 1.2), "Non-Color"),
    )


print("Generating PBR textures ...")
stone_imgs = build_stone_textures()
wood_imgs = build_wood_textures()
shingle_imgs = build_shingle_textures()
iron_imgs = build_iron_textures()

# ----------------------------------------------------------------------------
# materials
# ----------------------------------------------------------------------------


def pbr_material(name, imgs=None, base=(0.8, 0.8, 0.8, 1.0), rough=0.6,
                 metal=0.0, nrm_strength=1.0, vcol=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if vcol:
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        vc.location = (-450, 300)
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    if imgs:
        col_img, orm_img, nrm_img = imgs
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = col_img
        t.location = (-560, 350)
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        t2 = nt.nodes.new("ShaderNodeTexImage")
        t2.image = orm_img
        t2.location = (-560, 40)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        sep.location = (-260, 40)
        nt.links.new(t2.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        t3 = nt.nodes.new("ShaderNodeTexImage")
        t3.image = nrm_img
        t3.location = (-560, -280)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.location = (-260, -280)
        nm.inputs["Strength"].default_value = nrm_strength
        nt.links.new(t3.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


MAT_STONE = pbr_material("WT_Stone", stone_imgs, base=(0.45, 0.45, 0.46, 1), rough=0.85)
MAT_WOOD = pbr_material("WT_Wood", wood_imgs, base=(0.28, 0.19, 0.11, 1), rough=0.6)
MAT_SHINGLE = pbr_material("WT_Shingles", shingle_imgs, base=(0.35, 0.31, 0.26, 1), rough=0.7)
MAT_IRON = pbr_material("WT_Iron", iron_imgs, base=(0.04, 0.04, 0.045, 1), rough=0.45, metal=1.0)
MAT_GLASS = pbr_material("WT_Glass", None, base=(0.015, 0.02, 0.025, 1), rough=0.5, metal=0.0)
MAT_IVY = pbr_material("WT_Ivy", None, base=(0.12, 0.22, 0.06, 1), rough=0.55, vcol=True)

# ----------------------------------------------------------------------------
# bmesh helpers
# ----------------------------------------------------------------------------


def spin(profile, segments=SEGMENTS, close=False):
    """Lathe a (r, z) profile around Z. Closed profiles give watertight tori."""
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
    """Quad-fill the open boundary ring sitting at z_level."""
    edges = [e for e in bm.edges
             if e.is_boundary and all(abs(v.co.z - z_level) < tol for v in e.verts)]
    if not edges:
        return
    try:
        bmesh.ops.grid_fill(bm, edges=edges, mat_nr=0, use_smooth=False)
    except RuntimeError:
        bmesh.ops.holes_fill(bm, edges=edges, sides=len(edges))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def add_box(bm, size, matrix):
    res = bmesh.ops.create_cube(bm, size=1.0)
    m = matrix @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    bmesh.ops.transform(bm, matrix=m, verts=res["verts"])
    return res["verts"]


def merge_into(acc, piece, matrix=None):
    """Append a piece bmesh into an accumulator bmesh (frees the piece)."""
    if matrix is not None:
        bmesh.ops.transform(piece, matrix=matrix, verts=piece.verts[:])
    tmp = bpy.data.meshes.new("_tmp")
    piece.to_mesh(tmp)
    piece.free()
    acc.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def place(theta, z, r_offset=0.0):
    """Matrix putting local origin on the wall at angle theta / height z,
    local +Y pointing outward, +Z up, +X tangent."""
    r = wall_r(z) + r_offset
    loc = Vector((r * math.cos(theta), r * math.sin(theta), z))
    return Matrix.Translation(loc) @ Matrix.Rotation(theta - math.pi / 2, 4, "Z")


def box_uv(bm, scale=0.35, offset=(0.0, 0.0)):
    uvl = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
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


def cyl_uv(bm, tiles_u=2.0, z0=0.0, z1=H_TOP):
    """Cylindrical unwrap: u wraps tiles_u times, v runs bottom->top."""
    uvl = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        if abs(f.normal.z) > 0.5:  # caps/ledges: planar map, avoids v smearing
            for l in f.loops:
                co = l.vert.co
                l[uvl].uv = (co.x * 0.04 + 0.4, co.y * 0.04 + 0.6)
            continue
        ths = [math.atan2(l.vert.co.y, l.vert.co.x) for l in f.loops]
        if max(ths) - min(ths) > math.pi:
            ths = [t + math.tau if t < 0 else t for t in ths]
        for l, t in zip(f.loops, ths):
            l[uvl].uv = (t / math.tau * tiles_u, (l.vert.co.z - z0) / (z1 - z0))


def finalize(name, bm, mats, smooth_angle=0.66):
    """Smooth shading with sharp edges by angle; link object under the root."""
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            try:
                if e.calc_face_angle() > smooth_angle:
                    e.smooth = False
            except ValueError:
                pass
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    if not isinstance(mats, (list, tuple)):
        mats = [mats]
    for m in mats:
        me.materials.append(m)
    ob.parent = ROOT
    return ob


# ----------------------------------------------------------------------------
# tower shell (stone)
# ----------------------------------------------------------------------------

print("Building tower ...")
tower_bm = spin(PROFILE)
cap_ring(tower_bm, 0.0)
cap_ring(tower_bm, H_TOP)
cyl_uv(tower_bm, tiles_u=2.0)
finalize("Watchtower_Stone", tower_bm, MAT_STONE)

# ----------------------------------------------------------------------------
# arched openings: door + windows
# ----------------------------------------------------------------------------


def arch_frame(w, h, t, depth, arc_segs=8):
    """Quad-only arched frame: a flat ribbon around the opening, extruded
    into the wall. Local origin: bottom-center of opening, +Y outward."""
    bm = bmesh.new()
    w2 = w / 2
    s = h - w2  # springline
    path = [(-w2, 0.0)]
    for k in range(arc_segs + 1):
        a = math.pi - math.pi * k / arc_segs
        path.append((w2 * math.cos(a), s + w2 * math.sin(a)))
    path.append((w2, 0.0))
    offs = []
    for i, (x, z) in enumerate(path):
        if i == 0 or i == len(path) - 1:
            offs.append((math.copysign(1.0, x), 0.0))
        else:
            dx, dz = x, z - s
            L = math.hypot(dx, dz)
            offs.append((dx / L, dz / L) if L > 1e-9 else (0.0, 1.0))
    inner = [bm.verts.new((x, 0.0, z)) for x, z in path]
    outer = [bm.verts.new((x + ox * t, 0.0, z + oz * t))
             for (x, z), (ox, oz) in zip(path, offs)]
    for i in range(len(path) - 1):
        bm.faces.new((inner[i], inner[i + 1], outer[i + 1], outer[i]))
    res = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    new_verts = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=new_verts, vec=(0.0, -depth, 0.0))
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=(0.0, 0.10, 0.0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def glass_pane(w, h, t):
    # sits just in front of the (uncut) wall shell, recessed behind the frame
    bm = bmesh.new()
    a = w / 2 + t * 0.4
    z0, z1 = -0.03, h + 0.02
    vs = [bm.verts.new(p) for p in
          ((-a, 0.02, z0), (-a, 0.02, z1), (a, 0.02, z1), (a, 0.02, z0))]
    bm.faces.new(vs)
    return bm


def window_sill(w, t):
    bm = bmesh.new()
    add_box(bm, (w + 2.4 * t, 0.36, 0.15), Matrix.Translation((0.0, 0.02, -0.075)))
    return bm


WOOD_ACC = bmesh.new()
GLASS_ACC = bmesh.new()
TRIM_ACC = bmesh.new()
IRON_ACC = bmesh.new()

DOOR_THETA = math.radians(-45)
WINDOWS = [  # (theta_deg, base_z, w, h, frame_t)
    *[(a, 1.60, 0.40, 0.80, 0.08) for a in (15, 115, -145)],       # story 1 slits
    *[(a, 4.22, 0.62, 1.15, 0.12) for a in (-45, 75, -165)],       # story 2
    *[(a, 6.95, 0.70, 1.30, 0.12) for a in (-45, 45, 135, -135)],  # story 3 lookout
]

def opening_matrix(theta, z_base, h):
    """Local frame for an opening. The reference radius is the wall's maximum
    over the opening's span so recessed content always sits in front of the
    (uncut) wall shell."""
    zs = np.linspace(z_base, z_base + h, 24)
    r0 = max(wall_r(float(z)) for z in zs) + 0.005
    loc = Vector((r0 * math.cos(theta), r0 * math.sin(theta), z_base))
    return Matrix.Translation(loc) @ Matrix.Rotation(theta - math.pi / 2, 4, "Z")


print("Building windows and door ...")
for a_deg, z_base, w, h, t in WINDOWS:
    theta = math.radians(a_deg)
    m = opening_matrix(theta, z_base, h)
    merge_into(WOOD_ACC, arch_frame(w, h, t, 0.34), m)
    merge_into(GLASS_ACC, glass_pane(w, h, t), m)
    merge_into(TRIM_ACC, window_sill(w, t), m)

# door (base above the plinth taper so the wall never bulges into the leaf)
DW, DH, DT = 1.25, 2.10, 0.14
DZ = 0.88
DOOR_M = opening_matrix(DOOR_THETA, DZ, DH)
door_frame = arch_frame(DW, DH, DT, 0.44)
bmesh.ops.translate(door_frame, verts=door_frame.verts[:], vec=(0, 0.06, 0))
merge_into(WOOD_ACC, door_frame, DOOR_M)  # frame front at +0.16

# door leaf: vertical planks stepped under the arch, dark backing board
# behind them so no gap looks through onto the wall
planks = bmesh.new()
add_box(planks, (DW + 0.06, 0.03, DH + 0.06),
        Matrix.Translation((0.0, 0.045, DH / 2)))
n_planks = 6
inner_w = DW - 0.05
pw = inner_w / n_planks
s_line = DH - DW / 2
for i in range(n_planks):
    xc = -inner_w / 2 + pw * (i + 0.5)
    edge = abs(xc) + pw * 0.45
    top = s_line + math.sqrt(max(0.0, (DW / 2 + 0.02) ** 2 - edge * edge))
    top = max(top, s_line + 0.10)
    jy = rng.uniform(-0.006, 0.006)
    add_box(planks, (pw * 0.96, 0.09, top - 0.005),
            Matrix.Translation((xc, 0.105 + jy, (top + 0.005) / 2)))
merge_into(WOOD_ACC, planks, DOOR_M)

# door ironwork: straps, studs, handle ring
door_iron = bmesh.new()
for sz in (0.55, 1.45):
    add_box(door_iron, (DW - 0.02, 0.04, 0.13), Matrix.Translation((0.0, 0.16, sz)))
    for k in range(5):
        sx = -DW / 2 + 0.12 + k * (DW - 0.24) / 4
        add_box(door_iron, (0.035, 0.05, 0.035), Matrix.Translation((sx, 0.185, sz)))
ring = spin([(0.065, -0.017), (0.105, -0.017), (0.105, 0.017), (0.065, 0.017)],
            segments=12, close=True)
bmesh.ops.transform(ring, matrix=Matrix.Rotation(math.pi / 2, 4, "X"), verts=ring.verts[:])
merge_into(door_iron, ring, Matrix.Translation((-DW * 0.22, 0.20, 1.15)))
add_box(door_iron, (0.03, 0.07, 0.03), Matrix.Translation((-DW * 0.22, 0.175, 1.265)))
merge_into(IRON_ACC, door_iron, DOOR_M)

# stone doorstep: tall enough to bridge down over the plinth ledge
step = bmesh.new()
add_box(step, (DW + 0.5, 0.85, 0.35), Matrix.Translation((0.0, 0.18, -0.16)))
merge_into(TRIM_ACC, step, DOOR_M)

# ----------------------------------------------------------------------------
# iron reinforcements: bands + wall anchors
# ----------------------------------------------------------------------------

print("Building ironwork ...")
for zb in BAND_ZS:
    r = wall_r(zb + 0.08)
    band = spin([(r - 0.02, zb), (r + 0.045, zb + 0.03),
                 (r + 0.045, zb + 0.13), (r - 0.02, zb + 0.16)], close=True)
    merge_into(IRON_ACC, band)

ANCHORS = [(15, 5.00), (-105, 5.00), (135, 5.00), (0, 7.60), (-90, 7.60)]
for a_deg, za in ANCHORS:
    theta = math.radians(a_deg)
    anchor = bmesh.new()
    for rot in (math.pi / 4, -math.pi / 4):
        add_box(anchor, (0.55, 0.05, 0.10), Matrix.Rotation(rot, 4, "Y"))
    merge_into(IRON_ACC, anchor, place(theta, za, r_offset=0.0))

# ----------------------------------------------------------------------------
# roof: underlayment cone + individual wooden shingles + iron finial
# ----------------------------------------------------------------------------

print("Building roof ...")
under = spin([(ROOF_R1, ROOF_Z1 + 0.02), (ROOF_R0, ROOF_Z0 + 0.02),
              (ROOF_R0, 9.30), (2.28, 9.30), (0.06, ROOF_Z1 - 0.08)], close=True)
box_uv(under, scale=0.4)
finalize("Watchtower_RoofBase", under, MAT_WOOD)

roof_bm = bmesh.new()
uvl = roof_bm.loops.layers.uv.new("UVMap")
DR, DZ_ = ROOF_R1 - ROOF_R0, ROOF_Z1 - ROOF_Z0
SLOPE_L = math.hypot(DR, DZ_)
u_slope = (DR / SLOPE_L, DZ_ / SLOPE_L)          # up-slope (r, z)
n_slope = (-u_slope[1] * -1, u_slope[0] * -1)     # placeholder, computed below
L_S = 0.78
row_i = 0
shingle_count = 0
while True:
    s_c = row_i * 0.55 + 0.21
    if s_c > SLOPE_L - 0.15:
        break
    t_c = s_c / SLOPE_L
    r_c = ROOF_R0 + DR * t_c
    z_c = ROOF_Z0 + DZ_ * t_c
    count = max(6, int(math.tau * r_c / 0.46))
    w_i = math.tau * (r_c + 0.02) / count * (1.05 + 0.15 * t_c)
    for j in range(count):
        theta = j * math.tau / count + (row_i % 2) * math.pi / count \
            + rng.uniform(-0.015, 0.015)
        o = Vector((math.cos(theta), math.sin(theta), 0.0))
        up = (o * (DR / SLOPE_L) + Vector((0, 0, DZ_ / SLOPE_L))).normalized()
        nrm = up.cross(Vector((-math.sin(theta), math.cos(theta), 0.0))).normalized()
        if nrm.dot(o) < 0:
            nrm = -nrm
        x_t = Vector((-math.sin(theta), math.cos(theta), 0.0))
        p = o * r_c + Vector((0, 0, z_c)) + nrm * (0.030 + rng.uniform(0, 0.012))
        basis = Matrix((
            (x_t.x, up.x, nrm.x, 0.0),
            (x_t.y, up.y, nrm.y, 0.0),
            (x_t.z, up.z, nrm.z, 0.0),
            (0.0, 0.0, 0.0, 1.0),
        ))
        jitter = Euler((rng.uniform(-0.03, 0.03), 0.0,
                        rng.uniform(-0.035, 0.035))).to_matrix().to_4x4()
        mat = Matrix.Translation(p) @ basis @ jitter
        verts = add_box(roof_bm, (w_i, L_S * rng.uniform(0.92, 1.05), 0.035), mat)
        faces = {f for v in verts for f in v.link_faces}
        uo, vo = rng.uniform(0, 1), rng.uniform(0, 1)
        for f in faces:
            nrm_f = f.normal
            ax = max(range(3), key=lambda i: abs(nrm_f[i]))
            for l in f.loops:
                co = l.vert.co
                uu_, vv_ = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y)
                l[uvl].uv = (uu_ * 0.5 + uo, vv_ * 0.5 + vo)
        shingle_count += 1
    row_i += 1
print(f"  shingles: {shingle_count}")
finalize("Watchtower_RoofShingles", roof_bm, MAT_SHINGLE)

finial = spin([(0.015, 13.75), (0.050, 13.30), (0.070, 13.15), (0.130, 13.00),
               (0.150, 12.93), (0.240, 12.88), (0.240, 12.70), (0.090, 12.63),
               (0.015, 12.60)], close=True)
merge_into(IRON_ACC, finial)

# ----------------------------------------------------------------------------
# ivy on the lower walls
# ----------------------------------------------------------------------------

print("Growing ivy ...")
ivy_bm = bmesh.new()
ivy_col = ivy_bm.loops.layers.float_color.new("Col")


def band_bump(z):
    b = 0.0
    for zb in BAND_ZS:
        b = max(b, 0.055 * max(0.0, 1 - abs(z - zb - 0.08) / 0.22))
    return b


def set_face_color(face, color):
    for l in face.loops:
        l[ivy_col] = (*color, 1.0)


VINES = [  # (theta0_deg, z_max, phase, drift)
    (-100, 3.35, 0.0, 1.0),
    (-5, 2.70, 2.1, -1.0),
    (130, 3.60, 4.0, 1.0),
    (200, 2.90, 1.2, -1.0),
]
for th0_deg, z_max, phase, drift in VINES:
    th0 = math.radians(th0_deg)
    n_pts = 26
    pts, nrms, sides = [], [], []
    door_lo, door_hi = math.radians(-63), math.radians(-27)
    for i in range(n_pts):
        t = i / (n_pts - 1)
        z = 0.06 + (z_max - 0.06) * t
        theta = th0 + 0.42 * math.sin(t * 4.5 + phase) + 0.25 * t * drift
        if z < 3.25 and door_lo < theta < door_hi:  # keep off the door opening
            theta = door_lo if theta - door_lo < door_hi - theta else door_hi
        r = wall_r(z) + 0.035 + band_bump(z)
        pts.append(Vector((r * math.cos(theta), r * math.sin(theta), z)))
        nrms.append(Vector((math.cos(theta), math.sin(theta), 0.0)))
    prev = None
    for i in range(n_pts):
        tang = (pts[min(i + 1, n_pts - 1)] - pts[max(i - 1, 0)]).normalized()
        side = nrms[i].cross(tang).normalized()
        hw = 0.055 * (1 - 0.6 * (i / (n_pts - 1))) / 2
        a = ivy_bm.verts.new(pts[i] - side * hw)
        b = ivy_bm.verts.new(pts[i] + side * hw)
        if prev:
            f = ivy_bm.faces.new((prev[0], prev[1], b, a))
            if f.normal.dot(nrms[i]) < 0:
                f.normal_flip()
            set_face_color(f, (0.13, 0.15, 0.06))
        prev = (a, b)
        # leaves
        if i > 0 and rng.random() < 0.85:
            for _ in range(rng.randint(1, 2)):
                s = 0.10 + 0.08 * rng.random()
                zl = (nrms[i] + Vector((rng.uniform(-0.6, 0.6),
                                        rng.uniform(-0.6, 0.6),
                                        rng.uniform(-0.3, 0.5)))).normalized()
                v = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1),
                            rng.uniform(-1.4, -0.2)))
                tip = (v - v.dot(zl) * zl).normalized()
                xl = tip.cross(zl).normalized()
                base = pts[i] + nrms[i] * 0.02 + side * rng.uniform(-0.03, 0.03) \
                    + Vector((0, 0, rng.uniform(-0.02, 0.02)))
                vs = [ivy_bm.verts.new(base),
                      ivy_bm.verts.new(base + xl * 0.42 * s + tip * 0.55 * s),
                      ivy_bm.verts.new(base + tip * 1.1 * s),
                      ivy_bm.verts.new(base - xl * 0.42 * s + tip * 0.55 * s)]
                f = ivy_bm.faces.new(vs)
                if f.normal.dot(nrms[i]) < 0:
                    f.normal_flip()
                r1, r2 = rng.random(), rng.random()
                set_face_color(f, (0.10 + 0.08 * r1, 0.20 + 0.12 * r2,
                                   0.05 + 0.04 * r1))

box_uv(ivy_bm, scale=0.5)
finalize("Watchtower_Ivy", ivy_bm, MAT_IVY)

# finalize accumulators
box_uv(WOOD_ACC, scale=0.5)
finalize("Watchtower_Woodwork", WOOD_ACC, MAT_WOOD)
box_uv(GLASS_ACC, scale=0.5)
finalize("Watchtower_Glass", GLASS_ACC, MAT_GLASS)
box_uv(TRIM_ACC, scale=0.06, offset=(0.35, 0.62))  # keeps trim out of the moss band
finalize("Watchtower_StoneTrim", TRIM_ACC, MAT_STONE)
box_uv(IRON_ACC, scale=0.6)
finalize("Watchtower_Ironwork", IRON_ACC, MAT_IRON)

# ----------------------------------------------------------------------------
# neutral studio lighting + camera (kept out of the asset collection)
# ----------------------------------------------------------------------------

print("Lighting and camera ...")


def aim(obj, target):
    d = (Vector(target) - obj.location).normalized()
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def add_area(name, loc, target, size, power):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = power
    ld.size = size
    ld.color = (1.0, 1.0, 1.0)
    lo = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(lo)
    lo.location = loc
    aim(lo, target)
    return lo


add_area("Studio_Key", (9.0, -7.5, 10.5), (0, 0, 5.5), 7.0, 4000)
add_area("Studio_Fill", (-10.0, -7.0, 4.5), (0, 0, 4.5), 10.0, 1400)
add_area("Studio_Rim", (-3.5, 10.0, 11.0), (0, 0, 7.0), 6.0, 2200)

world = bpy.data.worlds.new("Studio_World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
bg.inputs["Strength"].default_value = 0.12

cam_data = bpy.data.cameras.new("Camera_Hero")
cam_data.lens = 40
cam_data.clip_end = 200
cam = bpy.data.objects.new("Camera_Hero", cam_data)
scene.collection.objects.link(cam)
cam.location = (14.5, -14.5, 6.8)
aim(cam, (0, 0, 6.7))
scene.camera = cam

cam2_data = bpy.data.cameras.new("Camera_Detail")
cam2_data.lens = 40
cam2 = bpy.data.objects.new("Camera_Detail", cam2_data)
scene.collection.objects.link(cam2)
cam2.location = (8.2, -8.2, 3.0)
aim(cam2, (1.05, -1.05, 1.9))

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
scene.view_settings.exposure = 0.5

# ----------------------------------------------------------------------------
# topology stats
# ----------------------------------------------------------------------------

tot_q = tot_t = tot_n = 0
print("\nTopology:")
for ob in COL.objects:
    if ob.type != "MESH":
        continue
    q = sum(1 for p in ob.data.polygons if len(p.vertices) == 4)
    t = sum(1 for p in ob.data.polygons if len(p.vertices) == 3)
    n = sum(1 for p in ob.data.polygons if len(p.vertices) > 4)
    tot_q, tot_t, tot_n = tot_q + q, tot_t + t, tot_n + n
    print(f"  {ob.name:28s} quads={q:5d} tris={t:3d} ngons={n:3d}")
faces = tot_q + tot_t + tot_n
print(f"  TOTAL faces={faces} ({100.0 * tot_q / max(faces, 1):.1f}% quads, "
      f"~{tot_q * 2 + tot_t} tris when triangulated)\n")

# ----------------------------------------------------------------------------
# save, export, render
# ----------------------------------------------------------------------------

blend_path = os.path.join(EXPORT_DIR, "watchtower.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
print(f"Saved {blend_path}")

glb_path = os.path.join(EXPORT_DIR, "watchtower.glb")
bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB")
print(f"Exported {glb_path}")

if os.environ.get("WT_SKIP_RENDER") != "1":
    scene.render.resolution_x, scene.render.resolution_y = 1200, 1500
    scene.render.filepath = os.path.join(RENDER_DIR, "watchtower_hero.png")
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {scene.render.filepath}")

    scene.camera = cam2
    scene.render.resolution_x, scene.render.resolution_y = 1400, 1000
    scene.render.filepath = os.path.join(RENDER_DIR, "watchtower_detail.png")
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {scene.render.filepath}")
    scene.camera = cam

print("Done.")
