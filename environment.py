#!/usr/bin/env python3
"""Nordic landscape around the stone watchtower.

Builds an environment for the watchtower asset and renders it in context:
  - procedural terrain: a farmland basin around the tower's knoll, forested
    foothills, and snow-capped mountains ringing the horizon
  - patchwork farmland (Voronoi fields, crop palette, furrows, hedgerow lines)
    driven by the same slope/altitude rules the tree scatter obeys, so fields
    and forest never fight over the same ground
  - low-poly spruce and birch forest plus boulders, scattered on terrain the
    plough could not work
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
THETA_SEGS = 224
RING_COUNT = 150
R_INNER, R_OUTER = 3.0, 2600.0
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
    """Ground the plough can work — mirrored by the shader's field mask."""
    return (h < FIELD_MAX_ALT and nz > FIELD_MIN_FLAT
            and FIELD_INNER < d < FIELD_OUTER)


def build_terrain(material, col):
    growth = (R_OUTER / R_INNER) ** (1.0 / (RING_COUNT - 1))
    radii = [R_INNER * growth ** k for k in range(RING_COUNT)]

    verts = [(0.0, 0.0, terrain_height(0.0, 0.0))]
    for r in radii:
        for j in range(THETA_SEGS):
            a = math.tau * j / THETA_SEGS
            x, y = r * math.cos(a), r * math.sin(a)
            verts.append((x, y, terrain_height(x, y)))

    # Everything is quads except a small triangle fan closing the very centre,
    # which sits under the tower's footprint and is never visible.
    faces = [(0, 1 + j, 1 + (j + 1) % THETA_SEGS) for j in range(THETA_SEGS)]
    for k in range(RING_COUNT - 1):
        b0 = 1 + k * THETA_SEGS
        b1 = b0 + THETA_SEGS
        for j in range(THETA_SEGS):
            jn = (j + 1) % THETA_SEGS
            faces.append((b0 + j, b1 + j, b1 + jn, b0 + jn))

    me = bpy.data.meshes.new("Terrain")
    me.from_pydata(verts, [], faces)
    me.update()
    me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new("Terrain", me)
    col.objects.link(obj)
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


def spruce_template(tiers=3, segs=8, height=9.0):
    bm = bmesh.new()
    trunk_h = height * 0.20
    rings = [_ring(bm, 0.17, 0.0, 6), _ring(bm, 0.12, trunk_h * 1.6, 6)]
    wt.bridge_rings(bm, rings, mat_index=0)
    wt.grid_cap(bm, rings[0], mat_index=0)

    z = trunk_h
    span = (height - trunk_h) / tiers
    for i in range(tiers):
        f = i / max(1, tiers - 1)
        r_bot = 2.05 * (1.0 - 0.55 * f)
        low = _ring(bm, r_bot, z, segs)
        high = _ring(bm, r_bot * 0.22, z + span * 1.35, segs)
        wt.bridge_rings(bm, [low, high], mat_index=1)
        wt.grid_cap(bm, low, mat_index=1)
        if i == tiers - 1:
            wt.grid_cap(bm, high, mat_index=1)
        z += span
    return template_from_bmesh(bm)


def birch_template(segs=8, height=7.5):
    bm = bmesh.new()
    trunk_h = height * 0.45
    rings = [_ring(bm, 0.13, 0.0, 6), _ring(bm, 0.09, trunk_h, 6)]
    wt.bridge_rings(bm, rings, mat_index=2)
    wt.grid_cap(bm, rings[0], mat_index=2)

    canopy = [
        _ring(bm, 0.55, trunk_h * 0.85, segs),
        _ring(bm, 1.45, trunk_h + height * 0.20, segs),
        _ring(bm, 1.30, trunk_h + height * 0.40, segs),
        _ring(bm, 0.45, height * 1.05, segs),
    ]
    wt.bridge_rings(bm, canopy, mat_index=3)
    wt.grid_cap(bm, canopy[0], mat_index=3)
    wt.grid_cap(bm, canopy[-1], mat_index=3)
    return template_from_bmesh(bm)


def boulder_template(seed):
    rnd = random.Random(seed)
    bm = bmesh.new()
    rings = []
    lat = 4
    for i in range(1, lat):
        phi = math.pi * i / lat
        rings.append(_ring(bm, math.sin(phi) * rnd.uniform(0.85, 1.15),
                           math.cos(phi) * 0.7, 8,
                           wobble=rnd.uniform(0.08, 0.22)))
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


def scatter_forest(templates, col, materials):
    placements = []
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
            # birch keeps to the sheltered lower ground, spruce takes the rest
            birch = h < 60.0 and RND.random() < 0.30
            scale = RND.uniform(0.72, 1.35) * (0.85 if birch else 1.0)
            mtx = (Matrix.Translation(Vector((x, y, h - 0.25))) @
                   Matrix.Rotation(RND.uniform(0, math.tau), 4, 'Z') @
                   Matrix.Diagonal((scale * RND.uniform(0.85, 1.1), scale,
                                    scale * RND.uniform(0.9, 1.25), 1.0)))
            placements.append((1 if birch else 0, mtx))
    print(f"  scattered {len(placements)} trees")
    return instance_mesh("Forest", templates, placements, materials, col)


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
        s = RND.uniform(0.8, 3.4) * (1.0 + smoothstep(80.0, 220.0, h) * 1.8)
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


def _field_mask(nt, geo):
    """Rebuild `is_field` in shader nodes so the painted fields land exactly
    where the tree scatter left room for them."""
    ln = nt.links
    sep_p = nt.nodes.new("ShaderNodeSeparateXYZ")
    ln.new(geo.outputs["Position"], sep_p.inputs["Vector"])
    sep_n = nt.nodes.new("ShaderNodeSeparateXYZ")
    ln.new(geo.outputs["Normal"], sep_n.inputs["Vector"])

    flat = nt.nodes.new("ShaderNodeMapRange")     # nz > FIELD_MIN_FLAT
    flat.inputs["From Min"].default_value = FIELD_MIN_FLAT - 0.012
    flat.inputs["From Max"].default_value = FIELD_MIN_FLAT + 0.012
    flat.clamp = True
    ln.new(sep_n.outputs["Z"], flat.inputs["Value"])

    low = nt.nodes.new("ShaderNodeMapRange")      # h < FIELD_MAX_ALT
    low.inputs["From Min"].default_value = FIELD_MAX_ALT
    low.inputs["From Max"].default_value = FIELD_MAX_ALT - 9.0
    low.clamp = True
    ln.new(sep_p.outputs["Z"], low.inputs["Value"])

    dist = nt.nodes.new("ShaderNodeVectorMath")   # radial distance
    dist.operation = 'LENGTH'
    xy = nt.nodes.new("ShaderNodeCombineXYZ")
    ln.new(sep_p.outputs["X"], xy.inputs["X"])
    ln.new(sep_p.outputs["Y"], xy.inputs["Y"])
    ln.new(xy.outputs["Vector"], dist.inputs[0])
    belt = nt.nodes.new("ShaderNodeMapRange")
    belt.inputs["From Min"].default_value = FIELD_OUTER
    belt.inputs["From Max"].default_value = FIELD_OUTER - 26.0
    belt.clamp = True
    ln.new(dist.outputs["Value"], belt.inputs["Value"])
    inner = nt.nodes.new("ShaderNodeMapRange")
    inner.inputs["From Min"].default_value = FIELD_INNER
    inner.inputs["From Max"].default_value = FIELD_INNER + 12.0
    inner.clamp = True
    ln.new(dist.outputs["Value"], inner.inputs["Value"])

    mask = flat.outputs["Result"]
    for other in (low.outputs["Result"], belt.outputs["Result"],
                  inner.outputs["Result"]):
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = 'MULTIPLY'
        ln.new(mask, mul.inputs[0])
        ln.new(other, mul.inputs[1])
        mask = mul.outputs["Value"]
    return mask, sep_p, sep_n


def make_terrain_material():
    m, nt, bsdf = _nodes("ENV_Terrain")
    ln = nt.links
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    mask, sep_p, sep_n = _field_mask(nt, geo)

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

    # --- farmland: Voronoi fields, one crop per cell, furrows and hedgerows
    fields = nt.nodes.new("ShaderNodeTexVoronoi")
    fields.inputs["Scale"].default_value = 0.032
    fields.inputs["Randomness"].default_value = 0.9
    ln.new(geo.outputs["Position"], fields.inputs["Vector"])
    crop_id = nt.nodes.new("ShaderNodeRGBToBW")
    ln.new(fields.outputs["Color"], crop_id.inputs["Color"])
    crops = _ramp(nt, [(0.00, (0.052, 0.098, 0.030, 1)),   # pasture
                       (0.20, (0.205, 0.160, 0.062, 1)),   # ripe barley
                       (0.40, (0.098, 0.066, 0.043, 1)),   # ploughed earth
                       (0.60, (0.245, 0.205, 0.058, 1)),   # rapeseed
                       (0.80, (0.185, 0.150, 0.065, 1))])  # stubble
    crops.color_ramp.interpolation = 'CONSTANT'
    ln.new(crop_id.outputs["Val"], crops.inputs["Fac"])

    # Rotate the plough direction per field, driven by the same random value
    # that picks the crop, so neighbouring fields never share a furrow angle.
    angle = nt.nodes.new("ShaderNodeMath")
    angle.operation = 'MULTIPLY'
    angle.inputs[1].default_value = math.pi
    ln.new(crop_id.outputs["Val"], angle.inputs[0])
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
    ln.new(crops.outputs["Color"], ploughed.inputs["Color1"])
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

    edges = nt.nodes.new("ShaderNodeTexVoronoi")   # hedgerow / field margin
    edges.feature = 'DISTANCE_TO_EDGE'
    edges.inputs["Scale"].default_value = 0.032
    edges.inputs["Randomness"].default_value = 0.9
    ln.new(geo.outputs["Position"], edges.inputs["Vector"])
    # distance-to-edge is measured in the Voronoi's own scaled space and only
    # spans about 0..0.5, so the hedgerow band lives at small values
    hedge = _ramp(nt, [(0.010, (0.150, 0.190, 0.090, 1)),
                       (0.055, (1.0, 1.0, 1.0, 1))])
    ln.new(edges.outputs["Distance"], hedge.inputs["Fac"])
    farmland = nt.nodes.new("ShaderNodeMixRGB")
    farmland.blend_type = 'MULTIPLY'
    farmland.inputs["Fac"].default_value = 1.0
    ln.new(worn.outputs["Color"], farmland.inputs["Color1"])
    ln.new(hedge.outputs["Color"], farmland.inputs["Color2"])

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


def setup_camera(scene, base_z):
    data = bpy.data.cameras.new("Camera")
    data.lens = 35
    data.clip_end = 6000.0
    cam = bpy.data.objects.new("Camera", data)
    cam.location = Vector((50.0, -60.0, base_z + 17.0))
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

    print("scattering:")
    scatter_forest([spruce_template(), birch_template()], col,
                   [bark, needles, birch_bark, birch_leaf])
    scatter_boulders([boulder_template(s) for s in range(4)], col, [rockmat])

    tower = wt.build_watchtower(col)
    for obj in tower:
        obj.location.z = _H0
    print(f"tower objects placed at z={_H0:.2f}")

    total = sum(len(o.data.polygons) for o in col.objects)
    print(f"scene faces: {total}")

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
