#!/usr/bin/env python3
"""Nordic landscape around the stone watchtower.

Builds an environment for the watchtower asset and renders it in context:
  - procedural terrain: a farmland basin around the tower's knoll, forested
    foothills, and snow-capped mountains ringing the horizon
  - patchwork farmland whose field partition is computed in Python and painted
    onto the terrain as vertex colours, so hedgerow bushes can stand exactly on
    the boundaries the material draws
  - spruce and birch built from dozens of tapered foliage spurs, instanced from
    shared mesh datablocks with distance-based level of detail, plus hedgerow
    bushes, foreground grass tufts and boulders
  - physical sky with a matching sun, and depth-based aerial haze

The tower itself is built by `watchtower.py`, so the two stay in sync.

Run either way:
    python3 environment.py           (requires `pip install bpy`)
    blender --background --python environment.py
Optional flags:  --preview (fast low-res render)   --no-render

Outputs (next to this script):
    assets/environment.blend, renders/environment.png
"""

import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector, noise

import watchtower as wt

RND = random.Random(11)
HERE = os.path.dirname(os.path.abspath(__file__))
_nodes, _ramp = wt._nodes, wt._ramp

# ---------------------------------------------------------------- dimensions
# The terrain is a radial grid rather than a square one: ring spacing grows
# geometrically outward, so the ground near the tower is finely detailed while
# the mountain range 2 km away costs almost nothing.
THETA_SEGS = 384
R_INNER, R_OUTER = 3.0, 2600.0
R_DENSE, DENSE_STEP = 290.0, 3.4   # fine uniform rings over the farmland
PAD_INNER, PAD_OUTER = 8.0, 22.0    # flat pad the tower stands on
KNOLL_R, KNOLL_H = 46.0, 18.0
TREELINE = 190.0
SNOW_LINE = 168.0
FIELD_MAX_ALT = 34.0         # fields only in the basin ...
FIELD_MIN_FLAT = 0.950       # ... and only where the ground is near level
FIELD_INNER, FIELD_OUTER = 30.0, 215.0
FOREST_RADIUS = 620.0
TREE_SPACING = 9.0
BOULDER_COUNT = 260


def smoothstep(a, b, x):
    if abs(b - a) < 1e-9:
        return 0.0 if x < a else 1.0
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def clamp01(x):
    return min(1.0, max(0.0, x))


# ------------------------------------------------------------------- terrain
def _raw_height(x, y):
    """Three layers: a rolling farmland basin, forested foothills, and a
    distant mountain range whose peak height and distance are tuned so the
    range reads on the skyline without overshooting the camera's frame."""
    d = math.hypot(x, y)
    rolling = noise.fractal(Vector((x * 0.0045, y * 0.0045, 0.0)),
                            1.0, 2.0, 5) * 12.0
    knoll = KNOLL_H * math.exp(-(d / KNOLL_R) ** 2)
    hills = noise.fractal(Vector((x * 0.0021, y * 0.0021, 11.0)),
                          1.0, 2.0, 5) * 44.0 * smoothstep(110.0, 380.0, d)
    alpine = smoothstep(450.0, 1250.0, d)
    ridge = noise.ridged_multi_fractal(
        Vector((x * 0.00085, y * 0.00085, 3.0)), 1.0, 2.2, 7, 0.9, 2.1)
    return rolling + knoll + hills + ridge * ridge * 125.0 * alpine


_H0 = _raw_height(0.0, 0.0)


def terrain_height(x, y):
    """Terrain with a level pad blended in under the tower."""
    t = smoothstep(PAD_INNER, PAD_OUTER, math.hypot(x, y))
    return _H0 + (_raw_height(x, y) - _H0) * t


def terrain_normal(x, y):
    """Finite-difference normal at roughly the mesh's own local resolution
    (which grows with radius), so it agrees with the shader's normal."""
    e = max(2.0, 0.05 * math.hypot(x, y))
    hx = (terrain_height(x + e, y) - terrain_height(x - e, y)) / (2 * e)
    hy = (terrain_height(x, y + e) - terrain_height(x, y - e)) / (2 * e)
    return Vector((-hx, -hy, 1.0)).normalized()


def is_field(h, nz, d):
    """Ground the plough can work."""
    return (h < FIELD_MAX_ALT and nz > FIELD_MIN_FLAT
            and FIELD_INNER < d < FIELD_OUTER)


# --- field partition -------------------------------------------------------
# The field layout lives in Python rather than in a shader Voronoi, because the
# hedgerow bushes have to stand exactly on the boundaries the material paints.
# Seeds sit on a jittered grid, so the nearest few cells can be found by index
# instead of testing every seed.
FIELD_STEP = 34.0
FIELD_SPAN = FIELD_OUTER + 70.0
CROP_COLOURS = [
    (0.045, 0.105, 0.025),    # pasture
    (0.255, 0.190, 0.055),    # ripe barley
    (0.105, 0.062, 0.038),    # ploughed earth
    (0.300, 0.245, 0.045),    # rapeseed
    (0.215, 0.175, 0.075),    # stubble
    (0.065, 0.135, 0.032),    # young shoots
]
_FIELD_GRID = None


def _field_grid():
    global _FIELD_GRID
    if _FIELD_GRID is None:
        rnd = random.Random(7)
        n = int(2 * FIELD_SPAN / FIELD_STEP) + 3
        _FIELD_GRID = {
            (i, j): (-FIELD_SPAN + (i + rnd.random()) * FIELD_STEP,
                     -FIELD_SPAN + (j + rnd.random()) * FIELD_STEP,
                     rnd.randrange(len(CROP_COLOURS)))
            for j in range(-2, n) for i in range(-2, n)}
    return _FIELD_GRID


def field_lookup(x, y):
    """(crop index, edge, nearest key, second key). `edge` is the gap between
    the nearest and second-nearest seed normalised by the cell step, so it goes
    to zero on a boundary; the two keys identify which fields meet there."""
    g = _field_grid()
    gi = int((x + FIELD_SPAN) / FIELD_STEP)
    gj = int((y + FIELD_SPAN) / FIELD_STEP)
    best = second = 1e18
    crop = 0
    k1 = k2 = (0, 0)
    for dj in (-2, -1, 0, 1, 2):
        for di in (-2, -1, 0, 1, 2):
            key = (gi + di, gj + dj)
            s = g.get(key)
            if s is None:
                continue
            dd = (s[0] - x) ** 2 + (s[1] - y) ** 2
            if dd < best:
                second, k2 = best, k1
                best, k1, crop = dd, key, s[2]
            elif dd < second:
                second, k2 = dd, key
    if second > 1e17:
        return crop, 1.0, k1, k2
    return crop, (math.sqrt(second) - math.sqrt(best)) / FIELD_STEP, k1, k2


def field_edge(x, y):
    return field_lookup(x, y)[1]


def hedged_boundary(x, y, edge_width=0.05, share=0.55):
    """True on a boundary that carries a hedge. Only some boundaries do — a
    hedge on every one reads as random scatter rather than field margins, so
    the decision is hashed from the pair of fields that meet there and is
    therefore stable along the whole length of that boundary."""
    _crop, edge, k1, k2 = field_lookup(x, y)
    if edge > edge_width:
        return False
    a, b = sorted((k1, k2))
    h = (a[0] * 73856093) ^ (a[1] * 19349663) ^ \
        (b[0] * 83492791) ^ (b[1] * 2971215073)
    return (h % 1000) < share * 1000


def _terrain_radii():
    """Uniform fine rings across the farmland belt so the painted field
    boundaries stay crisp, then geometric growth out to the mountains."""
    radii, r = [], R_INNER
    while r < R_DENSE:
        radii.append(r)
        r += DENSE_STEP
    growth = 1.052
    while r < R_OUTER:
        radii.append(r)
        r *= growth
    radii.append(R_OUTER)
    return radii


def build_terrain(material, col):
    radii = _terrain_radii()

    verts = [(0.0, 0.0, terrain_height(0.0, 0.0))]
    crop_col, edge_col = [], []

    def sample(x, y, z):
        nz = terrain_normal(x, y).z
        d = math.hypot(x, y)
        crop, edge, _k1, _k2 = field_lookup(x, y)
        mask = 1.0 if is_field(z, nz, d) else 0.0
        crop_col.extend((*CROP_COLOURS[crop], mask))
        e = clamp01(edge / 0.10)
        edge_col.extend((e, e, e, 1.0))

    sample(0.0, 0.0, verts[0][2])
    for r in radii:
        for j in range(THETA_SEGS):
            a = math.tau * j / THETA_SEGS
            x, y = r * math.cos(a), r * math.sin(a)
            z = terrain_height(x, y)
            verts.append((x, y, z))
            sample(x, y, z)

    # Everything is quads except a small triangle fan closing the very centre,
    # which sits under the tower's footprint and is never visible.
    faces = [(0, 1 + j, 1 + (j + 1) % THETA_SEGS) for j in range(THETA_SEGS)]
    for k in range(len(radii) - 1):
        b0 = 1 + k * THETA_SEGS
        b1 = b0 + THETA_SEGS
        for j in range(THETA_SEGS):
            jn = (j + 1) % THETA_SEGS
            faces.append((b0 + j, b1 + j, b1 + jn, b0 + jn))

    me = bpy.data.meshes.new("Terrain")
    me.from_pydata(verts, [], faces)
    me.update()
    for name, data in (("crop", crop_col), ("edge", edge_col)):
        attr = me.color_attributes.new(name=name, type='FLOAT_COLOR',
                                       domain='POINT')
        attr.data.foreach_set("color", data)
    me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new("Terrain", me)
    col.objects.link(obj)
    print(f"  terrain: {len(radii)} rings, {len(faces)} faces")
    return obj


# ------------------------------------------------------- instancing helpers
def template_from_bmesh(bm):
    """Freeze a bmesh into plain vertex/face/material lists so thousands of
    copies can be stamped out with from_pydata instead of bmesh ops."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    verts = [v.co.copy() for v in bm.verts]
    faces = [[v.index for v in f.verts] for f in bm.faces]
    mats = [f.material_index for f in bm.faces]
    bm.free()
    return verts, faces, mats


def instance_mesh(name, templates, placements, materials, col):
    verts, faces, mat_idx = [], [], []
    for ti, mtx in placements:
        tv, tf, tm = templates[ti]
        base = len(verts)
        verts.extend(mtx @ co for co in tv)
        faces.extend([i + base for i in f] for f in tf)
        mat_idx.extend(tm)

    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.polygons.foreach_set("material_index", mat_idx)
    me.update()
    for m in materials:
        me.materials.append(m)
    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    return obj


def _ring(bm, radius, z, segs, wobble=0.0):
    out = []
    for j in range(segs):
        a = math.tau * j / segs
        r = radius * (1.0 + wobble * math.sin(a * 3.0 + z))
        out.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
    return out


def lerp(a, b, t):
    return a + (b - a) * t


def _spike(bm, origin, direction, length, width, mat, taper=0.10):
    """A tapered four-sided spur — the building block for foliage. Dozens of
    these give a broken, bushy silhouette, where a single smooth cone reads as
    a low-poly toy no matter how finely it is subdivided."""
    d = Vector(direction).normalized()
    side = d.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-5 else Vector((1, 0, 0))
    other = d.cross(side).normalized()
    rings = []
    for f, w in ((0.0, width), (1.0, width * taper)):
        c = Vector(origin) + d * (length * f)
        rings.append([bm.verts.new(c + side * (sx * w * 0.5) +
                                   other * (sy * w * 0.5))
                      for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    wt.bridge_rings(bm, rings, mat_index=mat)
    wt.cap_quad_ring(bm, rings[0], True, mat)
    wt.cap_quad_ring(bm, rings[-1], False, mat)


def _taper_tube(bm, pts, radii, segs, mat):
    """Tube swept along a polyline — trunks and limbs."""
    rings = []
    n = len(pts)
    for i, (p, r) in enumerate(zip(pts, radii)):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        side = t.cross(Vector((0, 0, 1)))
        side = side.normalized() if side.length > 1e-5 else Vector((1, 0, 0))
        up = side.cross(t).normalized()
        rings.append([bm.verts.new(p + (side * math.cos(a) + up * math.sin(a)) * r)
                      for a in (math.tau * j / segs for j in range(segs))])
    wt.bridge_rings(bm, rings, mat_index=mat)
    wt.grid_cap(bm, rings[0], mat_index=mat)
    wt.grid_cap(bm, rings[-1], mat_index=mat)


def conifer_mesh(seed, height=12.0, sprigs=130, lod=1):
    """Spruce: a leaning tapered trunk carrying whorls of foliage spurs that
    angle up near the crown and droop toward the ground."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    lean = Vector((rnd.uniform(-0.035, 0.035), rnd.uniform(-0.035, 0.035), 0))

    pts, radii = [], []
    for i in range(7):
        t = i / 6
        pts.append(Vector((0, 0, t * height)) + lean * (t * t * height))
        radii.append(height * 0.017 * (1.0 - 0.85 * t) + 0.02)
    _taper_tube(bm, pts, radii, 6, 0)

    def trunk_at(t):
        return Vector((0, 0, t * height)) + lean * (t * t * height)

    count = sprigs if lod else max(48, sprigs // 2)
    for i in range(count):
        t = 0.11 + 0.88 * (i / count) ** 0.82
        crown = height * 0.28 * (1.0 - t) ** 0.80 + height * 0.022
        ang = rnd.uniform(0.0, math.tau)
        droop = math.radians(lerp(-34.0, 24.0, t) + rnd.uniform(-9.0, 9.0))
        d = Vector((math.cos(ang) * math.cos(droop),
                    math.sin(ang) * math.cos(droop), math.sin(droop)))
        length = crown * rnd.uniform(0.80, 1.20)
        _spike(bm, trunk_at(t) + d * (height * 0.010), d, length,
               length * rnd.uniform(0.26, 0.38), 1)

    _spike(bm, trunk_at(0.97), Vector((0, 0, 1)), height * 0.10,
           height * 0.022, 1)                        # leader
    return bm


def birch_mesh(seed, height=9.0, clusters=230, lod=1):
    """Birch: pale trunk, a few rising limbs, and a canopy built from blobby
    leaf clumps distributed through an ellipsoid."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    fork = height * 0.42
    lean = Vector((rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), 0))

    pts, radii = [], []
    for i in range(5):
        t = i / 4
        pts.append(Vector((0, 0, t * fork)) + lean * (t * fork))
        radii.append(height * 0.014 * (1.0 - 0.35 * t))
    _taper_tube(bm, pts, radii, 6, 2)

    limbs = 3 if lod else 2
    for k in range(limbs):
        a = math.tau * k / limbs + rnd.uniform(-0.4, 0.4)
        tip = Vector((math.cos(a), math.sin(a), 0)) * height * 0.22 + \
            Vector((0, 0, height * 0.85))
        base = pts[-1]
        _taper_tube(bm, [base, base.lerp(tip, 0.55), tip],
                    [height * 0.010, height * 0.007, height * 0.004], 4, 2)

    count = clusters if lod else max(40, clusters // 4)
    cz, rx, rz = height * 0.74, height * 0.30, height * 0.27
    for _ in range(count):
        u = rnd.uniform(0, math.tau)
        v = math.acos(rnd.uniform(-1, 1))
        rr = rnd.uniform(0.35, 1.0) ** 0.5
        p = Vector((rx * rr * math.sin(v) * math.cos(u),
                    rx * rr * math.sin(v) * math.sin(u),
                    cz + rz * rr * math.cos(v)))
        d = (p - Vector((0, 0, cz))).normalized() + Vector((0, 0, -0.25))
        size = height * rnd.uniform(0.017, 0.032)
        _spike(bm, p, d, size * 2.2, size * 1.15, 3, taper=0.32)
    return bm


def shrub_mesh(seed, size=1.8):
    """Low bush for hedgerows and field margins."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    for _ in range(34):
        u = rnd.uniform(0, math.tau)
        lift = rnd.uniform(0.15, 1.0)
        d = Vector((math.cos(u) * rnd.uniform(0.4, 1.0),
                    math.sin(u) * rnd.uniform(0.4, 1.0), lift))
        origin = Vector((math.cos(u) * rnd.uniform(0.0, 0.28) * size,
                         math.sin(u) * rnd.uniform(0.0, 0.28) * size,
                         size * rnd.uniform(0.05, 0.35)))
        _spike(bm, origin, d, size * rnd.uniform(0.45, 0.85),
               size * rnd.uniform(0.14, 0.24), 1, taper=0.30)
    return bm


def grass_tuft_template(seed, size=0.5):
    """Small crossed blades — merged rather than instanced, since each tuft is
    only a handful of faces and there are thousands of them."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    for _ in range(5):
        u = rnd.uniform(0, math.tau)
        d = Vector((math.cos(u) * rnd.uniform(0.15, 0.55),
                    math.sin(u) * rnd.uniform(0.15, 0.55),
                    rnd.uniform(0.8, 1.3)))
        _spike(bm, Vector((0, 0, 0)), d, size * rnd.uniform(0.7, 1.4),
               size * rnd.uniform(0.10, 0.18), 0, taper=0.05)
    return template_from_bmesh(bm)


def mesh_datablock(name, bm, materials):
    """Freeze a template bmesh into a Mesh datablock. Objects sharing one
    datablock are true instances in Cycles, so a detailed tree costs its
    geometry once no matter how many stand in the forest."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in materials:
        me.materials.append(m)
    return me


def boulder_template(seed):
    rnd = random.Random(seed)
    bm = bmesh.new()
    rings = []
    lat = 6
    for i in range(1, lat):
        phi = math.pi * i / lat
        rings.append(_ring(bm, math.sin(phi) * rnd.uniform(0.88, 1.12),
                           math.cos(phi) * 0.72, 10,
                           wobble=rnd.uniform(0.06, 0.16)))
    wt.bridge_rings(bm, rings, mat_index=0)
    wt.grid_cap(bm, rings[0], mat_index=0)
    wt.grid_cap(bm, rings[-1], mat_index=0)
    return template_from_bmesh(bm)


# ------------------------------------------------------------------ scatter
def forest_density(x, y, h, nz, d):
    if h > TREELINE or d < 34.0:
        return 0.0
    n = noise.fractal(Vector((x * 0.0032, y * 0.0032, 7.0)), 1.0, 2.0, 4)
    far = smoothstep(150.0, 300.0, d)
    steep = smoothstep(0.972, 0.90, nz)     # ground too steep to plough
    dens = 0.70 * far + 0.55 * steep + 1.5 * n
    dens *= 1.0 - smoothstep(TREELINE - 50.0, TREELINE, h)
    return clamp01(dens)


def link_instance(mesh, mtx, col, name):
    obj = bpy.data.objects.new(name, mesh)
    obj.matrix_world = mtx
    col.objects.link(obj)
    return obj


def scatter_forest(meshes, col, cam_pos, lod_dist=300.0):
    """Place trees as instances of shared mesh datablocks. Trees nearer the
    camera than `lod_dist` get the detailed template; the rest get a reduced
    one, so the detail budget goes where it is actually resolvable."""
    conifers_near, conifers_far, birches_near, birches_far = meshes
    counts = [0, 0]
    steps = int(2 * FOREST_RADIUS / TREE_SPACING)
    for j in range(steps):
        for i in range(steps):
            x = -FOREST_RADIUS + (i + RND.random()) * TREE_SPACING
            y = -FOREST_RADIUS + (j + RND.random()) * TREE_SPACING
            d = math.hypot(x, y)
            if d > FOREST_RADIUS:
                continue
            h = terrain_height(x, y)
            nz = terrain_normal(x, y).z
            if is_field(h, nz, d):
                continue
            if RND.random() > forest_density(x, y, h, nz, d) * 0.85:
                continue

            near = (Vector((x, y, h)) - cam_pos).length < lod_dist
            # birch keeps to the sheltered lower ground, spruce takes the rest
            birch = h < 70.0 and RND.random() < 0.28
            pool = ((birches_near if near else birches_far) if birch
                    else (conifers_near if near else conifers_far))
            mesh = pool[RND.randrange(len(pool))]
            counts[0 if near else 1] += 1

            scale = RND.uniform(0.68, 1.35)
            mtx = (Matrix.Translation(Vector((x, y, h - 0.2))) @
                   Matrix.Rotation(RND.uniform(0, math.tau), 4, 'Z') @
                   Matrix.Diagonal((scale * RND.uniform(0.88, 1.12), scale,
                                    scale * RND.uniform(0.9, 1.2), 1.0)))
            link_instance(mesh, mtx, col, "Tree")
    print(f"  scattered {sum(counts)} trees ({counts[0]} detailed, "
          f"{counts[1]} reduced)")


def scatter_hedgerows(meshes, col, cam_pos, trees_near=None,
                      trees_far=None, lod_dist=300.0):
    """Bushes and field trees along the boundaries between fields — the single
    strongest cue that the patchwork is farmland and not coloured ground."""
    placed = 0
    step = 1.7
    steps = int(2 * FIELD_OUTER / step)
    for j in range(steps):
        for i in range(steps):
            x = -FIELD_OUTER + (i + RND.random()) * step
            y = -FIELD_OUTER + (j + RND.random()) * step
            d = math.hypot(x, y)
            h = terrain_height(x, y)
            nz = terrain_normal(x, y).z
            if not is_field(h, nz, d):
                continue
            if field_edge(x, y) > 0.055 or RND.random() > 0.42:
                continue
            if (Vector((x, y, h)) - cam_pos).length > 420.0:
                continue
            near = (Vector((x, y, h)) - cam_pos).length < lod_dist
            if trees_near and RND.random() < 0.08:
                pool = trees_near if near else trees_far
                scale = RND.uniform(0.55, 0.95)
            else:
                pool = meshes
                scale = RND.uniform(0.7, 1.15)
            mtx = (Matrix.Translation(Vector((x, y, h - 0.15))) @
                   Matrix.Rotation(RND.uniform(0, math.tau), 4, 'Z') @
                   Matrix.Diagonal((scale, scale, scale * RND.uniform(0.8, 1.2),
                                    1.0)))
            link_instance(pool[RND.randrange(len(pool))], mtx, col, "Hedge")
            placed += 1
    print(f"  scattered {placed} hedgerow bushes")


def scatter_grass(template, col, materials, cam_pos, radius=135.0, step=1.5):
    """Dense tufts near the camera so the foreground is not a bare colour
    field. Merged into one mesh — each tuft is only a few faces."""
    placements = []
    steps = int(2 * radius / step)
    origin = Vector((cam_pos.x, cam_pos.y, 0.0))
    for j in range(steps):
        for i in range(steps):
            x = origin.x - radius + (i + RND.random()) * step
            y = origin.y - radius + (j + RND.random()) * step
            flat = math.hypot(x - cam_pos.x, y - cam_pos.y)
            if flat > radius:
                continue
            fade = 1.0 - smoothstep(radius * 0.45, radius, flat)
            if RND.random() > 0.85 * fade:
                continue
            h = terrain_height(x, y)
            nz = terrain_normal(x, y).z
            d = math.hypot(x, y)
            if h > FIELD_MAX_ALT + 30.0 or nz < 0.80:
                continue
            if is_field(h, nz, d) and field_edge(x, y) > 0.05:
                continue          # keep tufts out of the ploughed crop itself
            s = RND.uniform(0.7, 1.6)
            mtx = (Matrix.Translation(Vector((x, y, h - 0.05))) @
                   Matrix.Rotation(RND.uniform(0, math.tau), 4, 'Z') @
                   Matrix.Diagonal((s, s, s * RND.uniform(0.8, 1.5), 1.0)))
            placements.append((0, mtx))
    print(f"  scattered {len(placements)} grass tufts")
    return instance_mesh("Grass", [template], placements, materials, col)


def scatter_boulders(templates, col, materials):
    placements = []
    tries = 0
    while len(placements) < BOULDER_COUNT and tries < BOULDER_COUNT * 60:
        tries += 1
        x = RND.uniform(-FOREST_RADIUS, FOREST_RADIUS)
        y = RND.uniform(-FOREST_RADIUS, FOREST_RADIUS)
        d = math.hypot(x, y)
        if d < 40.0 or d > FOREST_RADIUS:
            continue
        h = terrain_height(x, y)
        nz = terrain_normal(x, y).z
        if is_field(h, nz, d) or nz > 0.985:
            continue
        s = RND.uniform(0.5, 1.9) * (1.0 + smoothstep(80.0, 220.0, h) * 1.1)
        mtx = (Matrix.Translation(Vector((x, y, h - s * 0.25))) @
               Matrix.Rotation(RND.uniform(0, math.tau), 4, 'Z') @
               Matrix.Rotation(RND.uniform(-0.3, 0.3), 4, 'X') @
               Matrix.Diagonal((s, s * RND.uniform(0.8, 1.2),
                                s * RND.uniform(0.6, 0.9), 1.0)))
        placements.append((RND.randrange(len(templates)), mtx))
    print(f"  scattered {len(placements)} boulders")
    return instance_mesh("Boulders", templates, placements, materials, col)


# ---------------------------------------------------------------- materials
def add_haze(nt, color_socket, bsdf):
    """Fake aerial perspective: wash distant surfaces toward the sky colour.
    Cheap stand-in for atmospheric volumetrics, which would dominate render
    time on a landscape this size."""
    cam = nt.nodes.new("ShaderNodeCameraData")
    depth = nt.nodes.new("ShaderNodeMapRange")
    depth.inputs["From Min"].default_value = 220.0
    depth.inputs["From Max"].default_value = 2200.0
    depth.inputs["To Min"].default_value = 0.0
    depth.inputs["To Max"].default_value = 0.62
    depth.clamp = True
    nt.links.new(cam.outputs["View Z Depth"], depth.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.inputs["Color2"].default_value = (0.32, 0.41, 0.55, 1.0)
    nt.links.new(depth.outputs["Result"], mix.inputs["Fac"])
    nt.links.new(color_socket, mix.inputs["Color1"])
    nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])


def _field_inputs(nt, geo):
    """Field data is painted onto the terrain in Python (see field_lookup), so
    the material and the hedgerow geometry agree on exactly where each field
    begins and ends."""
    ln = nt.links
    crop = nt.nodes.new("ShaderNodeAttribute")
    crop.attribute_name = "crop"
    edge = nt.nodes.new("ShaderNodeAttribute")
    edge.attribute_name = "edge"
    sep_p = nt.nodes.new("ShaderNodeSeparateXYZ")
    ln.new(geo.outputs["Position"], sep_p.inputs["Vector"])
    sep_n = nt.nodes.new("ShaderNodeSeparateXYZ")
    ln.new(geo.outputs["Normal"], sep_n.inputs["Vector"])
    return crop, edge, sep_p, sep_n


def make_terrain_material():
    m, nt, bsdf = _nodes("ENV_Terrain")
    ln = nt.links
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    crop_attr, edge_attr, sep_p, sep_n = _field_inputs(nt, geo)
    mask = crop_attr.outputs["Alpha"]

    # --- meadow / rough grass base
    gnoise = nt.nodes.new("ShaderNodeTexNoise")
    gnoise.inputs["Scale"].default_value = 0.045
    gnoise.inputs["Detail"].default_value = 8.0
    ln.new(geo.outputs["Position"], gnoise.inputs["Vector"])
    gfine = nt.nodes.new("ShaderNodeTexNoise")     # close-up breakup
    gfine.inputs["Scale"].default_value = 0.55
    gfine.inputs["Detail"].default_value = 6.0
    ln.new(geo.outputs["Position"], gfine.inputs["Vector"])
    gmix = nt.nodes.new("ShaderNodeMixRGB")
    gmix.inputs["Fac"].default_value = 0.38
    ln.new(gnoise.outputs["Fac"], gmix.inputs["Color1"])
    ln.new(gfine.outputs["Fac"], gmix.inputs["Color2"])
    grass = _ramp(nt, [(0.30, (0.024, 0.050, 0.014, 1)),
                       (0.55, (0.044, 0.084, 0.024, 1)),
                       (0.80, (0.072, 0.115, 0.038, 1))])
    ln.new(gmix.outputs["Color"], grass.inputs["Fac"])

    # --- farmland: crop colour from the painted attribute, furrows rotated
    # per field by the same value, and a grassy margin toward the hedgerows
    crop_bw = nt.nodes.new("ShaderNodeRGBToBW")
    ln.new(crop_attr.outputs["Color"], crop_bw.inputs["Color"])
    angle = nt.nodes.new("ShaderNodeMath")
    angle.operation = 'MULTIPLY'
    angle.inputs[1].default_value = math.pi * 3.0
    ln.new(crop_bw.outputs["Val"], angle.inputs[0])
    rot_vec = nt.nodes.new("ShaderNodeCombineXYZ")
    ln.new(angle.outputs["Value"], rot_vec.inputs["Z"])
    furrow_map = nt.nodes.new("ShaderNodeMapping")
    ln.new(geo.outputs["Position"], furrow_map.inputs["Vector"])
    ln.new(rot_vec.outputs["Vector"], furrow_map.inputs["Rotation"])

    furrow = nt.nodes.new("ShaderNodeTexWave")
    furrow.inputs["Scale"].default_value = 0.62
    furrow.inputs["Distortion"].default_value = 1.5
    ln.new(furrow_map.outputs["Vector"], furrow.inputs["Vector"])
    furrow_ramp = _ramp(nt, [(0.32, (0.74, 0.74, 0.74, 1)),
                             (0.68, (1.10, 1.10, 1.10, 1))])
    ln.new(furrow.outputs["Fac"], furrow_ramp.inputs["Fac"])
    ploughed = nt.nodes.new("ShaderNodeMixRGB")
    ploughed.blend_type = 'MULTIPLY'
    ploughed.inputs["Fac"].default_value = 0.55
    ln.new(crop_attr.outputs["Color"], ploughed.inputs["Color1"])
    ln.new(furrow_ramp.outputs["Color"], ploughed.inputs["Color2"])

    fwear = nt.nodes.new("ShaderNodeTexNoise")
    fwear.inputs["Scale"].default_value = 0.14
    fwear.inputs["Detail"].default_value = 7.0
    ln.new(geo.outputs["Position"], fwear.inputs["Vector"])
    fwear_ramp = _ramp(nt, [(0.25, (0.80, 0.80, 0.80, 1)),
                            (0.75, (1.16, 1.16, 1.16, 1))])
    ln.new(fwear.outputs["Fac"], fwear_ramp.inputs["Fac"])
    worn = nt.nodes.new("ShaderNodeMixRGB")
    worn.blend_type = 'MULTIPLY'
    worn.inputs["Fac"].default_value = 1.0
    ln.new(ploughed.outputs["Color"], worn.inputs["Color1"])
    ln.new(fwear_ramp.outputs["Color"], worn.inputs["Color2"])

    margin = _ramp(nt, [(0.0, (0.0, 0.0, 0.0, 1)), (0.45, (1.0, 1.0, 1.0, 1))])
    ln.new(edge_attr.outputs["Color"], margin.inputs["Fac"])
    farmland = nt.nodes.new("ShaderNodeMixRGB")
    ln.new(margin.outputs["Color"], farmland.inputs["Fac"])
    ln.new(grass.outputs["Color"], farmland.inputs["Color1"])
    ln.new(worn.outputs["Color"], farmland.inputs["Color2"])

    ground = nt.nodes.new("ShaderNodeMixRGB")
    ln.new(mask, ground.inputs["Fac"])
    ln.new(grass.outputs["Color"], ground.inputs["Color1"])
    ln.new(farmland.outputs["Color"], ground.inputs["Color2"])

    broad = nt.nodes.new("ShaderNodeTexNoise")
    broad.inputs["Scale"].default_value = 0.012
    broad.inputs["Detail"].default_value = 6.0
    ln.new(geo.outputs["Position"], broad.inputs["Vector"])
    broad_ramp = _ramp(nt, [(0.25, (0.74, 0.74, 0.74, 1)),
                            (0.75, (1.20, 1.20, 1.20, 1))])
    ln.new(broad.outputs["Fac"], broad_ramp.inputs["Fac"])
    varied = nt.nodes.new("ShaderNodeMixRGB")
    varied.blend_type = 'MULTIPLY'
    varied.inputs["Fac"].default_value = 1.0
    ln.new(ground.outputs["Color"], varied.inputs["Color1"])
    ln.new(broad_ramp.outputs["Color"], varied.inputs["Color2"])

    # --- rock on steep ground, snow on the high tops
    rnoise = nt.nodes.new("ShaderNodeTexNoise")
    rnoise.inputs["Scale"].default_value = 0.09
    rnoise.inputs["Detail"].default_value = 9.0
    ln.new(geo.outputs["Position"], rnoise.inputs["Vector"])
    rock = _ramp(nt, [(0.35, (0.038, 0.036, 0.034, 1)),
                      (0.70, (0.098, 0.092, 0.086, 1))])
    ln.new(rnoise.outputs["Fac"], rock.inputs["Fac"])
    steep = nt.nodes.new("ShaderNodeMapRange")
    steep.inputs["From Min"].default_value = 0.90
    steep.inputs["From Max"].default_value = 0.74
    steep.clamp = True
    ln.new(sep_n.outputs["Z"], steep.inputs["Value"])
    rocky = nt.nodes.new("ShaderNodeMixRGB")
    ln.new(steep.outputs["Result"], rocky.inputs["Fac"])
    ln.new(varied.outputs["Color"], rocky.inputs["Color1"])
    ln.new(rock.outputs["Color"], rocky.inputs["Color2"])

    alt = nt.nodes.new("ShaderNodeMapRange")
    alt.inputs["From Min"].default_value = SNOW_LINE
    alt.inputs["From Max"].default_value = SNOW_LINE + 80.0
    alt.clamp = True
    ln.new(sep_p.outputs["Z"], alt.inputs["Value"])
    hold = nt.nodes.new("ShaderNodeMapRange")     # snow slides off cliffs
    hold.inputs["From Min"].default_value = 0.74
    hold.inputs["From Max"].default_value = 0.90
    hold.clamp = True
    ln.new(sep_n.outputs["Z"], hold.inputs["Value"])
    snow_fac = nt.nodes.new("ShaderNodeMath")
    snow_fac.operation = 'MULTIPLY'
    ln.new(alt.outputs["Result"], snow_fac.inputs[0])
    ln.new(hold.outputs["Result"], snow_fac.inputs[1])
    snowy = nt.nodes.new("ShaderNodeMixRGB")
    snowy.inputs["Color2"].default_value = (0.72, 0.76, 0.85, 1.0)
    ln.new(snow_fac.outputs["Value"], snowy.inputs["Fac"])
    ln.new(rocky.outputs["Color"], snowy.inputs["Color1"])

    bsdf.inputs["Roughness"].default_value = 0.94
    # Soil, crops and grass are almost purely diffuse. Left at the default,
    # the Principled's grazing-angle Fresnel mirrors the bright sky across the
    # whole ground plane and washes the landscape out to pastel.
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    add_haze(nt, snowy.outputs["Color"], bsdf)
    return m


def make_foliage_material(name, cols, rough=0.78, var_scale=0.09):
    """Per-tree tint variation from a noise sized to a few tree widths."""
    m, nt, bsdf = _nodes(name)
    ln = nt.links
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = var_scale
    n.inputs["Detail"].default_value = 4.0
    ln.new(geo.outputs["Position"], n.inputs["Vector"])
    ramp = _ramp(nt, cols)
    ln.new(n.outputs["Fac"], ramp.inputs["Fac"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Specular IOR Level"].default_value = 0.0
    add_haze(nt, ramp.outputs["Color"], bsdf)
    return m


# ------------------------------------------------------------ scene and sky
def setup_sky(scene, sun_elev_deg=30.0, sun_rot_deg=196.0):
    world = bpy.data.worlds.new("Sky")
    world.use_nodes = True
    nt = world.node_tree
    ln = nt.links
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_elevation = math.radians(sun_elev_deg)
    sky.sun_rotation = math.radians(sun_rot_deg)
    sky.altitude = 450
    sky.air_density = 1.1
    sky.ozone_density = 1.6
    sky.sun_disc = False          # the Sun lamp below is the light source

    # A full-strength sky floods the scene with ambient fill and flattens the
    # sun's shadows away. Show the bright sky to camera rays, but let it light
    # the landscape at reduced strength so the sun still carries the shading.
    bg_cam = nt.nodes["Background"]
    bg_cam.inputs["Strength"].default_value = 1.0
    ln.new(sky.outputs["Color"], bg_cam.inputs["Color"])
    bg_fill = nt.nodes.new("ShaderNodeBackground")
    bg_fill.inputs["Strength"].default_value = 0.42
    ln.new(sky.outputs["Color"], bg_fill.inputs["Color"])

    path = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    ln.new(path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    ln.new(bg_fill.outputs["Background"], mix.inputs[1])
    ln.new(bg_cam.outputs["Background"], mix.inputs[2])
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_WORLD')
    ln.new(mix.outputs["Shader"], out.inputs["Surface"])
    scene.world = world

    data = bpy.data.lights.new("Sun", 'SUN')
    data.energy = 7.0
    data.angle = math.radians(1.4)
    data.color = (1.0, 0.855, 0.655)
    sun = bpy.data.objects.new("Sun", data)
    e, r = math.radians(sun_elev_deg), math.radians(sun_rot_deg)
    to_sun = Vector((math.cos(e) * math.cos(r), math.cos(e) * math.sin(r),
                     math.sin(e)))
    sun.rotation_euler = to_sun.to_track_quat('Z', 'Y').to_euler()
    scene.collection.objects.link(sun)
    return sun


def camera_position(base_z):
    """Shared so the scatter passes can bias detail toward the camera before
    the camera object itself exists."""
    return Vector((50.0, -60.0, base_z + 17.0))


def setup_camera(scene, base_z):
    data = bpy.data.cameras.new("Camera")
    data.lens = 35
    data.clip_end = 6000.0
    cam = bpy.data.objects.new("Camera", data)
    cam.location = camera_position(base_z)
    scene.collection.objects.link(cam)
    # aim to one side of the tower so it sits off-centre
    wt.look_at(cam, Vector((9.0, 10.0, base_z + 12.0)))
    scene.camera = cam
    return cam


def main():
    preview = "--preview" in sys.argv
    do_render = "--no-render" not in sys.argv

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    col = bpy.data.collections.new("Landscape")
    scene.collection.children.link(col)

    print(f"terrain pad height: {_H0:.2f}")
    build_terrain(make_terrain_material(), col)

    needles = make_foliage_material("ENV_Needles", [
        (0.30, (0.010, 0.030, 0.012, 1)),
        (0.55, (0.018, 0.048, 0.018, 1)),
        (0.80, (0.032, 0.072, 0.024, 1))])
    bark = make_foliage_material("ENV_Bark", [
        (0.3, (0.030, 0.022, 0.015, 1)),
        (0.8, (0.055, 0.042, 0.030, 1))], rough=0.9)
    birch_bark = make_foliage_material("ENV_BirchBark", [
        (0.3, (0.290, 0.285, 0.265, 1)),
        (0.8, (0.420, 0.415, 0.395, 1))], rough=0.85)
    birch_leaf = make_foliage_material("ENV_BirchLeaf", [
        (0.3, (0.055, 0.095, 0.022, 1)),
        (0.8, (0.095, 0.140, 0.035, 1))])
    rockmat = make_foliage_material("ENV_Rock", [
        (0.3, (0.042, 0.040, 0.038, 1)),
        (0.8, (0.098, 0.092, 0.084, 1))], rough=0.95, var_scale=0.5)

    grassmat = make_foliage_material("ENV_GrassBlade", [
        (0.3, (0.030, 0.058, 0.014, 1)),
        (0.8, (0.070, 0.105, 0.030, 1))], rough=0.86, var_scale=0.35)

    tree_mats = [bark, needles, birch_bark, birch_leaf]
    conifers_near = [mesh_datablock(f"Conifer{s}", conifer_mesh(
        s, height=RND.uniform(10.5, 15.0), lod=1), tree_mats)
        for s in range(4)]
    conifers_far = [mesh_datablock(f"ConiferLod{s}", conifer_mesh(
        s, height=RND.uniform(10.5, 15.0), lod=0), tree_mats)
        for s in range(3)]
    birches_near = [mesh_datablock(f"Birch{s}", birch_mesh(
        20 + s, height=RND.uniform(7.5, 10.5), lod=1), tree_mats)
        for s in range(3)]
    birches_far = [mesh_datablock(f"BirchLod{s}", birch_mesh(
        20 + s, height=RND.uniform(7.5, 10.5), lod=0), tree_mats)
        for s in range(2)]
    bushes = [mesh_datablock(f"Shrub{s}", shrub_mesh(40 + s,
                                                     size=RND.uniform(1.6, 2.8)),
                             tree_mats) for s in range(4)]
    unique = sum(len(m.polygons) for m in
                 conifers_near + conifers_far + birches_near + birches_far +
                 bushes)

    cam_pos = camera_position(_H0)
    print("scattering:")
    scatter_forest([conifers_near, conifers_far, birches_near, birches_far],
                   col, cam_pos)
    scatter_hedgerows(bushes, col, cam_pos, trees_near=birches_near,
                      trees_far=birches_far)
    scatter_grass(grass_tuft_template(3), col, [grassmat], cam_pos)
    scatter_boulders([boulder_template(s) for s in range(4)], col, [rockmat])

    tower = wt.build_watchtower(col)
    for obj in tower:
        obj.location.z = _H0
    print(f"tower objects placed at z={_H0:.2f}")

    # instanced objects share mesh data, so unique geometry is what Cycles
    # actually stores; the evaluated total is much larger
    evaluated = sum(len(o.data.polygons) for o in col.objects
                    if o.type == 'MESH')
    print(f"unique vegetation faces: {unique}   evaluated scene: {evaluated}")

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16 if preview else 72
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 960 if preview else 1920
    scene.render.resolution_y = 540 if preview else 1080
    # A landscape spans a far wider dynamic range than the isolated asset
    # render: AgX rolls off the sky instead of flattening everything to pastel.
    scene.view_settings.view_transform = 'AgX'
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue

    setup_sky(scene)
    setup_camera(scene, _H0)

    if do_render:
        path = os.path.join(HERE, "renders", "environment.png")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print(f"rendered: {path}")

    assets = os.path.join(HERE, "assets")
    os.makedirs(assets, exist_ok=True)
    blend_path = os.path.join(assets, "environment.blend")
    # compressed: the forest mesh alone is several MB of instanced geometry
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    print(f"saved: {blend_path}")


if __name__ == "__main__":
    main()
