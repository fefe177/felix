#!/usr/bin/env python3
"""Weathered Nordic stone watchtower — procedural Blender generator.

Builds a game-ready, quad-only watchtower:
  - three stories, circular battered stone body on a flared plinth
  - real arched openings cut through the wall with splayed stone reveals
    (arrow slits on story 1, windows on stories 2 and 3, an arched door)
  - stone string courses, sills and keystones between stories
  - conical wooden shingle roof with fascia, soffit, brackets and iron finial
  - iron bands, anchor plates, wall straps, window bars, door hinge straps
  - ivy vines with leaf cards climbing the lower wall
  - procedural PBR materials (stone with height-masked moss, weathered wood,
    dark iron with rust patches, ivy greens)
  - neutral 3-point studio lighting, transparent film, no ground plane

Run either way:
    python3 watchtower.py            (requires `pip install bpy`)
    blender --background --python watchtower.py
Optional flags:  --preview (fast low-res render)   --no-render

Outputs (next to this script):
    assets/watchtower.blend, assets/watchtower.glb, renders/watchtower_preview.png
"""

import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

RND = random.Random(4)
TAU = math.tau
HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- dimensions
SEGS = 48                    # radial segments of the tower body
DCOL = TAU / SEGS
PLINTH_TOP = 0.7             # flared foundation
WALL_TOP = 10.4              # top of the stone body
R_PLINTH = 3.4
R_WALL_BASE = 3.05
R_WALL_TOP = 2.6
COURSE_Z = (4.2, 7.4)        # string courses splitting the three stories
EAVE_R = 3.34                # roof overhang radius
EAVE_Z = 10.62
APEX_Z = 14.3
ROOF_ROWS = 9
SHINGLE_W = 0.42
MOSS_TOP = 4.3               # shader moss fade-out height

# Openings: (azimuth deg, sill z, opening width, springing height,
#            surround thickness, kind). Azimuths get snapped to the wall grid.
RAW_OPENINGS = [
    (0.0, 1.00, 1.50, 1.70, 0.26, "door"),
    (97.5, 2.00, 0.45, 1.05, 0.14, "slit"),
    (247.5, 2.00, 0.45, 1.05, 0.14, "slit"),
    (30.0, 4.95, 0.95, 1.25, 0.20, "window"),
    (150.0, 4.95, 0.95, 1.25, 0.20, "window"),
    (270.0, 4.95, 0.95, 1.25, 0.20, "window"),
    (0.0, 8.05, 0.85, 1.10, 0.18, "barred"),
    (90.0, 8.05, 0.85, 1.10, 0.18, "barred"),
    (180.0, 8.05, 0.85, 1.10, 0.18, "barred"),
    (270.0, 8.05, 0.85, 1.10, 0.18, "barred"),
]
RECT_MARGIN_X = 0.20         # wall-grid hole margin around the arch outline
RECT_MARGIN_Z = 0.20
REVEAL_INSET = 0.30          # how deep the arch plane sits below the wall skin
REVEAL_DEPTH = 0.28          # tunnel depth behind the arch plane


def wall_r(z):
    """Radius of the battered wall at height z."""
    if z <= PLINTH_TOP:
        return R_PLINTH + (R_WALL_BASE + 0.06 - R_PLINTH) * (z / PLINTH_TOP)
    t = (z - PLINTH_TOP) / (WALL_TOP - PLINTH_TOP)
    return R_WALL_BASE + (R_WALL_TOP - R_WALL_BASE) * t


# ------------------------------------------------------------- bmesh helpers
def mesh_object(bm, name, mats, collection, smooth=None):
    """Turn a bmesh into a linked object. mats: list of materials
    (face.material_index picks the slot). smooth: autosmooth angle in
    degrees, or None for flat shading."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    for m in mats:
        obj.data.materials.append(m)
    collection.objects.link(obj)
    if smooth is not None:
        for p in me.polygons:
            p.use_smooth = True
        obj["smooth_angle"] = smooth
    return obj


def add_box(bm, center, size, matrix=None, mat_index=0):
    m = Matrix.Translation(Vector(center)) @ Matrix.Diagonal((*size, 1.0))
    if matrix is not None:
        m = matrix @ m
    ret = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    for v in ret["verts"]:
        for f in v.link_faces:
            f.material_index = mat_index


def bridge_rings(bm, rings, closed_loop=True, mat_index=0):
    """Quad-bridge consecutive vertex rings."""
    for r0, r1 in zip(rings, rings[1:]):
        n = len(r0)
        rng = range(n) if closed_loop else range(n - 1)
        for j in rng:
            f = bm.faces.new((r0[j], r0[(j + 1) % n],
                              r1[(j + 1) % n], r1[j]))
            f.material_index = mat_index


def circle_ring(bm, radius, z, segs=SEGS, jitter=0.0, seed=0):
    ring = []
    for j in range(segs):
        a = TAU * j / segs
        r = radius
        if jitter:
            r += jitter * math.sin(seed * 12.9898 + j * 78.233) * \
                math.cos(z * 3.7 + j * 1.3)
        ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
    return ring


def grid_cap(bm, ring, mat_index=0):
    edges = set()
    n = len(ring)
    for j in range(n):
        e = bm.edges.get((ring[j], ring[(j + 1) % n]))
        if e:
            edges.add(e)
    before = set(bm.faces)
    try:
        bmesh.ops.grid_fill(bm, edges=list(edges))
    except RuntimeError:
        bm.faces.new(ring)
    for f in bm.faces:
        if f not in before:
            f.material_index = mat_index


def ring_tube(bm, radius, z, width, height, segs=48, mat_index=0):
    """Closed quad torus with a rectangular cross-section (bands, ledges)."""
    profile = [(-width / 2, -height / 2), (width / 2, -height / 2),
               (width / 2, height / 2), (-width / 2, height / 2)]
    rings = []
    for j in range(segs):
        a = TAU * j / segs
        rings.append([bm.verts.new(((radius + dr) * math.cos(a),
                                    (radius + dr) * math.sin(a), z + dz))
                      for dr, dz in profile])
    rings.append(rings[0])
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(4):
            f = bm.faces.new((r0[j], r0[(j + 1) % 4],
                              r1[(j + 1) % 4], r1[j]))
            f.material_index = mat_index


def cap_quad_ring(bm, ring, flip, mat_index=0):
    f = bm.faces.new(tuple(reversed(ring)) if flip else tuple(ring))
    f.material_index = mat_index


def sweep_tube(bm, path, width, depth, mat_index=0):
    """Sweep a width x depth rectangle along an open path lying in the local
    XZ plane (depth axis = +Y). Ends are capped with single quads."""
    depth_axis = Vector((0, 1, 0))
    rings = []
    n = len(path)
    for i, p in enumerate(path):
        if i == 0:
            t = (path[1] - path[0]).normalized()
        elif i == n - 1:
            t = (path[-1] - path[-2]).normalized()
        else:
            t = (path[i + 1] - path[i - 1]).normalized()
        side = t.cross(depth_axis).normalized()
        rings.append([bm.verts.new(p + side * (a * width) +
                                   depth_axis * (b * depth))
                      for a, b in ((-0.5, -0.5), (0.5, -0.5),
                                   (0.5, 0.5), (-0.5, 0.5))])
    bridge_rings(bm, rings, mat_index=mat_index)
    cap_quad_ring(bm, rings[0], True, mat_index)
    cap_quad_ring(bm, rings[-1], False, mat_index)


def wall_strap(bm, theta, z0, z1, width, thick, steps=6, mat_index=0):
    """Thin vertical band hugging the battered wall at a given azimuth."""
    c, s = math.cos(theta), math.sin(theta)
    ex, er = Vector((-s, c, 0)), Vector((c, s, 0))
    rings = []
    for i in range(steps + 1):
        z = z0 + (z1 - z0) * i / steps
        base = er * (wall_r(z) + 0.005) + Vector((0, 0, z))
        rings.append([bm.verts.new(base + ex * (a * width) + er * (b * thick))
                      for a, b in ((-0.5, 0.0), (0.5, 0.0),
                                   (0.5, 1.0), (-0.5, 1.0))])
    bridge_rings(bm, rings, mat_index=mat_index)
    cap_quad_ring(bm, rings[0], True, mat_index)
    cap_quad_ring(bm, rings[-1], False, mat_index)


# ------------------------------------------------------- arched-opening math
def opening_matrix(theta, z_sill, half_w):
    """Local frame of a recessed opening: +x tangential (screen-right seen
    from outside), +y into the wall, +z up, origin on the sill centre.
    The plane is pushed in far enough to stay behind the curved wall skin."""
    c, s = math.cos(theta), math.sin(theta)
    r = math.sqrt(max(0.04, wall_r(z_sill + 1.0) ** 2 - half_w ** 2)) \
        - REVEAL_INSET
    return Matrix(((-s, -c, 0.0, r * c),
                   (c, -s, 0.0, r * s),
                   (0.0, 0.0, 1.0, z_sill),
                   (0.0, 0.0, 0.0, 1.0)))


def arch_sides(w, spring, arc_res=48):
    """Dense polylines for the four sides of an arched outline, corner to
    corner: bottom, right jamb + lower arc, crown, upper arc + left jamb."""
    r = w / 2

    def arc(a0, a1, n):
        return [Vector((r * math.cos(a), 0.0, spring + r * math.sin(a)))
                for a in (a0 + (a1 - a0) * i / n for i in range(n + 1))]

    q = math.pi / 4
    bottom = [Vector((-r, 0, 0)), Vector((r, 0, 0))]
    right = [Vector((r, 0, 0)), Vector((r, 0, spring))] + arc(0, q, arc_res)[1:]
    top = arc(q, 3 * q, arc_res)
    left = arc(3 * q, math.pi, arc_res) + [Vector((-r, 0, spring)),
                                           Vector((-r, 0, 0))]
    return bottom, right, top, left


def resample(pts, n):
    """n points along an open polyline, uniform by arc length, excluding the
    final endpoint (it belongs to the next side)."""
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + (b - a).length)
    total = cum[-1]
    out, seg = [], 0
    for k in range(n):
        t = total * k / n
        while seg < len(cum) - 2 and cum[seg + 1] < t:
            seg += 1
        span = cum[seg + 1] - cum[seg]
        f = 0.0 if span < 1e-9 else (t - cum[seg]) / span
        out.append(pts[seg].lerp(pts[seg + 1], f))
    return out


def arch_loop(w, spring, nc, nr):
    """Closed arch outline with nc points along the bottom and crown and nr
    along each side — matching a wall-grid rectangle of nc x nr cells."""
    bottom, right, top, left = arch_sides(w, spring)
    return (resample(bottom, nc) + resample(right, nr) +
            resample(top, nc) + resample(left, nr))


def arch_path(w, spring, frame_w, gap, arc_segs=10):
    """Centreline of a protruding arched surround around an opening."""
    r = w / 2 + gap + frame_w / 2
    pts = [Vector((-r, 0, 0)), Vector((-r, 0, spring * 0.5))]
    for i in range(arc_segs + 1):
        a = math.pi - math.pi * i / arc_segs
        pts.append(Vector((r * math.cos(a), 0, spring + r * math.sin(a))))
    pts += [Vector((r, 0, spring * 0.5)), Vector((r, 0, 0))]
    return pts


def make_openings():
    """Resolve the raw table into grid-snapped opening specs."""
    specs = []
    for theta_deg, z_sill, w, spring, frame_w, kind in RAW_OPENINGS:
        theta = round(math.radians(theta_deg) / DCOL) * DCOL
        z_mid = z_sill + 1.0
        half_w = w / 2
        r_plane = math.sqrt(max(0.04, wall_r(z_mid) ** 2 - half_w ** 2)) \
            - REVEAL_INSET
        specs.append({
            "theta": theta, "z": z_sill, "w": w, "spring": spring,
            "frame_w": frame_w, "kind": kind,
            "mtx": opening_matrix(theta, z_sill, half_w),
            "z0": z_sill - RECT_MARGIN_Z,
            "z1": z_sill + spring + w / 2 + RECT_MARGIN_Z,
            "half_rect": w / 2 + RECT_MARGIN_X,
            # local -y distance from the arch plane out to the wall skin
            "delta": wall_r(z_mid) - r_plane,
        })
    return specs


def build_rows(specs):
    """Ring table (z, radius offset) for the wall grid. Every opening
    boundary height is guaranteed to land exactly on a ring."""
    required = {round(PLINTH_TOP, 4), round(WALL_TOP, 4)}
    for s in specs:
        required.add(round(s["z0"], 4))
        required.add(round(s["z1"], 4))
    rows = sorted(required)
    z = PLINTH_TOP
    while z < WALL_TOP:
        if all(abs(z - k) > 0.15 for k in rows):
            rows.append(z)
        z += 0.30
    rows.sort()
    table = [(0.0, 0.0), (0.35, 0.0), (PLINTH_TOP, 0.10)]
    table += [(z, 0.0) for z in rows if z > PLINTH_TOP + 1e-6]
    index = {}
    for i, (z, _dr) in enumerate(table):
        index.setdefault(round(z, 4), i)
    return table, index


# ------------------------------------------------------------------ materials
def _nodes(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree, m.node_tree.nodes["Principled BSDF"]


def _ramp(nt, stops):
    node = nt.nodes.new("ShaderNodeValToRGB")
    ramp = node.color_ramp
    ramp.elements[0].position, ramp.elements[0].color = stops[0]
    ramp.elements[1].position, ramp.elements[1].color = stops[-1]
    for pos, col in stops[1:-1]:
        ramp.elements.new(pos).color = col
    return node


def _stretched_noise(nt, coord, scale, detail, squash):
    """Noise whose features are stretched along Z — vertical rain streaking."""
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, 1.0, squash)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    nt.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    return noise


def make_stone_material():
    m, nt, bsdf = _nodes("WT_Stone")
    ln = nt.links
    coord = nt.nodes.new("ShaderNodeTexCoord")

    # broad tonal variation across whole blocks, not fine granite speckle
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 2.2
    noise.inputs["Detail"].default_value = 10.0
    noise.inputs["Roughness"].default_value = 0.62
    ln.new(coord.outputs["Object"], noise.inputs["Vector"])
    stone_ramp = _ramp(nt, [
        (0.30, (0.072, 0.068, 0.062, 1)),
        (0.50, (0.128, 0.121, 0.109, 1)),
        (0.72, (0.205, 0.193, 0.172, 1)),
        (0.88, (0.290, 0.270, 0.238, 1)),
    ])
    ln.new(noise.outputs["Fac"], stone_ramp.inputs["Fac"])

    # Coursed rubble masonry. Squashing Z before the Voronoi makes the cells
    # wider than they are tall, so they read as courses; distance-to-edge
    # gives the recessed joints. Fully 3D, so there is no seam on the wrap.
    squash = nt.nodes.new("ShaderNodeMapping")
    squash.inputs["Scale"].default_value = (1.0, 1.0, 1.7)
    ln.new(coord.outputs["Object"], squash.inputs["Vector"])

    joints = nt.nodes.new("ShaderNodeTexVoronoi")
    joints.feature = 'DISTANCE_TO_EDGE'
    joints.inputs["Scale"].default_value = 2.3
    joints.inputs["Randomness"].default_value = 0.85
    ln.new(squash.outputs["Vector"], joints.inputs["Vector"])
    joint_mask = _ramp(nt, [(0.010, (0.22, 0.22, 0.22, 1)),
                            (0.075, (1.0, 1.0, 1.0, 1))])
    ln.new(joints.outputs["Distance"], joint_mask.inputs["Fac"])

    blocks = nt.nodes.new("ShaderNodeTexVoronoi")   # per-block tone
    blocks.inputs["Scale"].default_value = 2.3
    blocks.inputs["Randomness"].default_value = 0.85
    ln.new(squash.outputs["Vector"], blocks.inputs["Vector"])
    block_bw = nt.nodes.new("ShaderNodeRGBToBW")
    ln.new(blocks.outputs["Color"], block_bw.inputs["Color"])
    block_ramp = _ramp(nt, [(0.0, (0.62, 0.62, 0.62, 1)),
                            (1.0, (1.28, 1.28, 1.28, 1))])
    ln.new(block_bw.outputs["Val"], block_ramp.inputs["Fac"])

    toned = nt.nodes.new("ShaderNodeMixRGB")
    toned.blend_type = 'MULTIPLY'
    toned.inputs["Fac"].default_value = 0.9
    ln.new(stone_ramp.outputs["Color"], toned.inputs["Color1"])
    ln.new(block_ramp.outputs["Color"], toned.inputs["Color2"])

    patch = nt.nodes.new("ShaderNodeMixRGB")
    patch.blend_type = 'MULTIPLY'
    patch.inputs["Fac"].default_value = 1.0
    ln.new(toned.outputs["Color"], patch.inputs["Color1"])
    ln.new(joint_mask.outputs["Color"], patch.inputs["Color2"])

    # dark water staining running down the wall
    streak = _stretched_noise(nt, coord, 7.0, 6.0, 0.10)
    streak_ramp = _ramp(nt, [(0.36, (0.42, 0.40, 0.36, 1)),
                             (0.62, (1.0, 1.0, 1.0, 1))])
    ln.new(streak.outputs["Fac"], streak_ramp.inputs["Fac"])
    stained = nt.nodes.new("ShaderNodeMixRGB")
    stained.blend_type = 'MULTIPLY'
    stained.inputs["Fac"].default_value = 0.45
    ln.new(patch.outputs["Color"], stained.inputs["Color1"])
    ln.new(streak_ramp.outputs["Color"], stained.inputs["Color2"])

    # moss: strongest at the base, gone above MOSS_TOP, blotchy at two scales
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ln.new(coord.outputs["Object"], sep.inputs["Vector"])
    hmask = nt.nodes.new("ShaderNodeMapRange")
    hmask.inputs["From Min"].default_value = 0.2
    hmask.inputs["From Max"].default_value = MOSS_TOP
    hmask.inputs["To Min"].default_value = 1.2
    hmask.inputs["To Max"].default_value = 0.0
    hmask.clamp = True
    ln.new(sep.outputs["Z"], hmask.inputs["Value"])

    blotch = nt.nodes.new("ShaderNodeTexNoise")   # where moss took hold
    blotch.inputs["Scale"].default_value = 2.8
    blotch.inputs["Detail"].default_value = 4.0
    ln.new(coord.outputs["Object"], blotch.inputs["Vector"])
    mnoise = nt.nodes.new("ShaderNodeTexNoise")   # its ragged edge
    mnoise.inputs["Scale"].default_value = 9.0
    mnoise.inputs["Detail"].default_value = 8.0
    ln.new(coord.outputs["Object"], mnoise.inputs["Vector"])
    grain = nt.nodes.new("ShaderNodeMixRGB")
    grain.inputs["Fac"].default_value = 0.42
    ln.new(blotch.outputs["Fac"], grain.inputs["Color1"])
    ln.new(mnoise.outputs["Fac"], grain.inputs["Color2"])
    mmul = nt.nodes.new("ShaderNodeMath")
    mmul.operation = 'MULTIPLY'
    ln.new(hmask.outputs["Result"], mmul.inputs[0])
    ln.new(grain.outputs["Color"], mmul.inputs[1])
    mramp = _ramp(nt, [(0.30, (0, 0, 0, 1)), (0.66, (1, 1, 1, 1))])
    ln.new(mmul.outputs["Value"], mramp.inputs["Fac"])

    moss_mix = nt.nodes.new("ShaderNodeMixRGB")
    ln.new(mramp.outputs["Color"], moss_mix.inputs["Fac"])
    ln.new(stained.outputs["Color"], moss_mix.inputs["Color1"])
    moss_col = _ramp(nt, [(0.15, (0.015, 0.024, 0.011, 1)),
                          (0.55, (0.037, 0.053, 0.022, 1)),
                          (0.90, (0.072, 0.092, 0.038, 1))])
    ln.new(mnoise.outputs["Fac"], moss_col.inputs["Fac"])
    ln.new(moss_col.outputs["Color"], moss_mix.inputs["Color2"])
    ln.new(moss_mix.outputs["Color"], bsdf.inputs["Base Color"])

    rough = nt.nodes.new("ShaderNodeMapRange")   # moss is fully rough
    rough.inputs["To Min"].default_value = 0.86
    rough.inputs["To Max"].default_value = 1.0
    ln.new(mramp.outputs["Color"], rough.inputs["Value"])
    ln.new(rough.outputs["Result"], bsdf.inputs["Roughness"])

    # recessed joints dominate the relief, with surface grain layered on top
    grain_h = nt.nodes.new("ShaderNodeMixRGB")
    grain_h.inputs["Fac"].default_value = 0.35
    ln.new(noise.outputs["Fac"], grain_h.inputs["Color1"])
    ln.new(mramp.outputs["Color"], grain_h.inputs["Color2"])
    bump_mix = nt.nodes.new("ShaderNodeMixRGB")
    bump_mix.inputs["Fac"].default_value = 0.30
    ln.new(joint_mask.outputs["Color"], bump_mix.inputs["Color1"])
    ln.new(grain_h.outputs["Color"], bump_mix.inputs["Color2"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.55
    ln.new(bump_mix.outputs["Color"], bump.inputs["Height"])
    ln.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def make_wood_material(name, cols, scale=1.6, rough=0.84, cell_scale=2.4):
    """Weathered plank/shingle wood: wave grain broken by noise, plus a
    Voronoi layer sized to one shingle so neighbours differ in tone."""
    m, nt, bsdf = _nodes(name)
    ln = nt.links
    coord = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = scale
    wave.inputs["Distortion"].default_value = 4.0
    wave.inputs["Detail"].default_value = 6.0
    ln.new(coord.outputs["Object"], wave.inputs["Vector"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0
    ln.new(coord.outputs["Object"], noise.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.inputs["Fac"].default_value = 0.5
    ln.new(wave.outputs["Fac"], mix.inputs["Color1"])
    ln.new(noise.outputs["Fac"], mix.inputs["Color2"])
    ramp = _ramp(nt, cols)
    ln.new(mix.outputs["Color"], ramp.inputs["Fac"])

    cells = nt.nodes.new("ShaderNodeTexVoronoi")
    cells.inputs["Scale"].default_value = cell_scale
    ln.new(coord.outputs["Object"], cells.inputs["Vector"])
    cell_bw = nt.nodes.new("ShaderNodeRGBToBW")
    ln.new(cells.outputs["Color"], cell_bw.inputs["Color"])
    cell_ramp = _ramp(nt, [(0.0, (0.52, 0.52, 0.52, 1)),
                           (1.0, (1.32, 1.32, 1.32, 1))])
    ln.new(cell_bw.outputs["Val"], cell_ramp.inputs["Fac"])
    tinted = nt.nodes.new("ShaderNodeMixRGB")
    tinted.blend_type = 'MULTIPLY'
    tinted.inputs["Fac"].default_value = 0.85
    ln.new(ramp.outputs["Color"], tinted.inputs["Color1"])
    ln.new(cell_ramp.outputs["Color"], tinted.inputs["Color2"])
    ln.new(tinted.outputs["Color"], bsdf.inputs["Base Color"])

    bsdf.inputs["Roughness"].default_value = rough
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    ln.new(mix.outputs["Color"], bump.inputs["Height"])
    ln.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def make_iron_material():
    m, nt, bsdf = _nodes("WT_Iron")
    ln = nt.links
    coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 11.0
    noise.inputs["Detail"].default_value = 6.0
    ln.new(coord.outputs["Object"], noise.inputs["Vector"])
    rust = _ramp(nt, [(0.32, (0, 0, 0, 1)), (0.62, (1, 1, 1, 1))])
    ln.new(noise.outputs["Fac"], rust.inputs["Fac"])
    col = nt.nodes.new("ShaderNodeMixRGB")
    col.inputs["Color1"].default_value = (0.024, 0.026, 0.030, 1)
    col.inputs["Color2"].default_value = (0.150, 0.062, 0.026, 1)  # rust
    ln.new(rust.outputs["Color"], col.inputs["Fac"])
    ln.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    met = nt.nodes.new("ShaderNodeMapRange")
    met.inputs["To Min"].default_value = 0.95
    met.inputs["To Max"].default_value = 0.15   # rusty spots go dielectric
    ln.new(rust.outputs["Color"], met.inputs["Value"])
    ln.new(met.outputs["Result"], bsdf.inputs["Metallic"])
    rgh = nt.nodes.new("ShaderNodeMapRange")
    rgh.inputs["To Min"].default_value = 0.42
    rgh.inputs["To Max"].default_value = 0.88
    ln.new(rust.outputs["Color"], rgh.inputs["Value"])
    ln.new(rgh.outputs["Result"], bsdf.inputs["Roughness"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    ln.new(noise.outputs["Fac"], bump.inputs["Height"])
    ln.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def make_ivy_material():
    m, nt, bsdf = _nodes("WT_Ivy")
    ln = nt.links
    coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 14.0
    ln.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = _ramp(nt, [(0.0, (0.028, 0.072, 0.019, 1)),
                      (1.0, (0.075, 0.155, 0.032, 1))])
    ln.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    ln.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.62
    return m


def make_flat_material(name, color, rough=1.0):
    m, _nt, bsdf = _nodes(name)
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    return m


# ------------------------------------------------------------- stone geometry
def cut_opening(bm, rings, spec, table, index, stone, dark):
    """Replace a rectangular block of the wall grid with a splayed arched
    reveal, a tunnel through the wall and a dark backing cap. Returns the
    set of grid cells the caller must not fill."""
    i0, i1 = index[round(spec["z0"], 4)], index[round(spec["z1"], 4)]
    nr = i1 - i0
    half = max(1, math.ceil(math.asin(min(0.99, spec["half_rect"] /
                                          wall_r(spec["z"] + 1.0))) / DCOL))
    nc = 2 * half
    j0 = round(spec["theta"] / DCOL) - half

    skipped = {(i, (j0 + k) % SEGS)
               for i in range(i0, i1) for k in range(nc)}

    outer = []
    outer += [rings[i0][(j0 + k) % SEGS] for k in range(nc)]
    outer += [rings[i0 + k][(j0 + nc) % SEGS] for k in range(nr)]
    outer += [rings[i1][(j0 + nc - k) % SEGS] for k in range(nc)]
    outer += [rings[i1 - k][j0 % SEGS] for k in range(nr)]

    mtx = spec["mtx"]
    profile = arch_loop(spec["w"], spec["spring"], nc, nr)
    inner = [bm.verts.new(mtx @ p) for p in profile]
    back = [bm.verts.new(mtx @ (p + Vector((0, REVEAL_DEPTH, 0))))
            for p in profile]

    bridge_rings(bm, [outer, inner], mat_index=stone)   # splayed reveal
    bridge_rings(bm, [inner, back], mat_index=dark)     # tunnel
    grid_cap(bm, back, mat_index=dark)
    return skipped


def build_stone(mats, col, specs):
    stone, dark = 0, 1
    bm = bmesh.new()
    table, index = build_rows(specs)

    rings = []
    for i, (z, dr) in enumerate(table):
        jitter = 0.03 if i > 2 else 0.0
        rings.append(circle_ring(bm, wall_r(z) + dr, z, jitter=jitter, seed=i))

    skip = set()
    for spec in specs:
        skip |= cut_opening(bm, rings, spec, table, index, stone, dark)

    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for j in range(SEGS):
            if (i, j) in skip:
                continue
            f = bm.faces.new((r0[j], r0[(j + 1) % SEGS],
                              r1[(j + 1) % SEGS], r1[j]))
            f.material_index = stone
    grid_cap(bm, rings[0], mat_index=stone)
    grid_cap(bm, rings[-1], mat_index=stone)

    # string courses between stories plus one under the eave
    for z in (*COURSE_Z, WALL_TOP - 0.12):
        ring_tube(bm, wall_r(z) + 0.14, z, 0.32, 0.30, mat_index=stone)

    # protruding arched surrounds, sills and keystones
    for spec in specs:
        mtx, w, spring = spec["mtx"], spec["w"], spec["spring"]
        fw, d = spec["frame_w"], spec["delta"]
        path = [p + Vector((0, -d - 0.02, 0))
                for p in arch_path(w, spring, fw, 0.04)]
        sweep_tube(bm, path, fw, 0.34, mat_index=stone)
        add_box(bm, (0, -d - 0.12, -0.10), (w + 2 * fw + 0.5, 0.55, 0.20),
                matrix=mtx, mat_index=stone)                       # sill
        add_box(bm, (0, -d - 0.10, spring + w / 2 + fw / 2 + 0.02),
                (fw * 1.5, 0.44, fw * 1.6), matrix=mtx, mat_index=stone)
        if spec["kind"] == "door":                                 # doorstep
            for k, dz in enumerate((-0.30, -0.60)):
                add_box(bm, (0, -d - 0.35 - 0.22 * k, dz),
                        (w + 1.0 + 0.3 * k, 0.55, 0.28), matrix=mtx,
                        mat_index=stone)

    return mesh_object(bm, "Watchtower_Stone", mats, col, smooth=45)


# -------------------------------------------------------------- roof and wood
def roof_frame(theta):
    """Rotation aligning a shingle to the cone surface at azimuth theta."""
    s = math.atan2(APEX_Z - EAVE_Z, EAVE_R)
    base = Matrix((
        (0, -math.cos(s), math.sin(s)),
        (1, 0, 0),
        (0, math.sin(s), math.cos(s)))).to_4x4()
    return Matrix.Rotation(theta, 4, 'Z') @ base


def build_wood(mats, col, specs):
    bm = bmesh.new()

    # cone backing under the shingles (closes the roof silhouette)
    rings = []
    for i in range(7):
        f = i / 6
        rings.append(circle_ring(bm, EAVE_R * (1 - f) + 0.10 * f,
                                 EAVE_Z + (APEX_Z - EAVE_Z) * f))
    bridge_rings(bm, rings)
    grid_cap(bm, rings[0])
    grid_cap(bm, rings[-1])

    # fascia ring, flat soffit from wall to eave, and support brackets
    ring_tube(bm, EAVE_R - 0.05, EAVE_Z - 0.10, 0.14, 0.30)
    bridge_rings(bm, [circle_ring(bm, EAVE_R - 0.05, EAVE_Z - 0.06),
                      circle_ring(bm, R_WALL_TOP - 0.1, EAVE_Z - 0.06)])
    for j in range(12):
        m = Matrix.Rotation(TAU * j / 12 + 0.13, 4, 'Z')
        add_box(bm, (R_WALL_TOP + 0.25, 0, EAVE_Z - 0.28),
                (0.9, 0.09, 0.12), matrix=m)

    # shingle rows, staggered and jittered
    slope_len = math.hypot(EAVE_R, APEX_Z - EAVE_Z)
    length = slope_len / ROOF_ROWS * 1.55
    for i in range(ROOF_ROWS):
        fc = (i + 0.42) / ROOF_ROWS
        r_c = EAVE_R * (1 - fc)
        z_c = EAVE_Z + (APEX_Z - EAVE_Z) * fc
        count = max(6, int(TAU * r_c / (SHINGLE_W * 0.95)))
        for k in range(count):
            theta = TAU * k / count + (0.5 / count if i % 2 else 0.0) \
                + RND.uniform(-0.15, 0.15) / count
            rot = roof_frame(theta)
            pos = Vector((r_c * math.cos(theta), r_c * math.sin(theta), z_c))
            # each row sits proud of the one below, so its lower lip catches a
            # shadow instead of the rows blending into concentric stripes
            pos += (rot @ Vector((0, 0, 1))) * (0.030 + 0.016 * i +
                                                RND.uniform(0, 0.012))
            jitter = (Matrix.Rotation(RND.uniform(-0.05, 0.05), 4, 'Z') @
                      Matrix.Rotation(RND.uniform(-0.06, 0.02), 4, 'X'))
            size = Matrix.Diagonal((SHINGLE_W * RND.uniform(0.90, 1.0),
                                    length * RND.uniform(0.95, 1.05),
                                    0.055, 1.0))
            bmesh.ops.create_cube(bm, size=1.0,
                                  matrix=Matrix.Translation(pos) @ rot @
                                  jitter @ size)

    # arched plank door filling the door opening, plank tops following the arch
    door = next(s for s in specs if s["kind"] == "door")
    mtx, w, spring = door["mtx"], door["w"], door["spring"]
    n_planks = 6
    pw = w / n_planks
    for p in range(n_planks):
        x0 = -w / 2 + p * pw
        x_in = max(abs(x0), abs(x0 + pw)) - 0.015
        top = spring + math.sqrt(max(0.0, (w / 2) ** 2 - x_in ** 2))
        add_box(bm, (x0 + pw / 2, 0.10, top / 2 + 0.01),
                (pw - 0.015, 0.09, top - 0.01), matrix=mtx)

    return mesh_object(bm, "Watchtower_Wood", mats, col)


# --------------------------------------------------------------- iron details
def build_iron(mats, col, specs):
    bm = bmesh.new()

    # reinforcement bands threaded between the openings, with bolt studs
    for z in (3.85, 4.57, 7.05, 9.95):
        ring_tube(bm, wall_r(z) + 0.02, z, 0.10, 0.22)
        for j in range(SEGS // 4):
            m = Matrix.Rotation(TAU * 4 * j / SEGS + 0.1, 4, 'Z')
            add_box(bm, (wall_r(z) + 0.08, 0, z), (0.06, 0.07, 0.09), matrix=m)

    # anchor plates straddling the string courses
    for z in COURSE_Z:
        for j in range(8):
            m = Matrix.Rotation(TAU * j / 8 + DCOL / 2, 4, 'Z')
            add_box(bm, (wall_r(z) + 0.20, 0, z), (0.05, 0.22, 0.38), matrix=m)
            add_box(bm, (wall_r(z) + 0.25, 0, z), (0.06, 0.08, 0.08), matrix=m)

    # vertical straps on the lower story, clear of the door and slits
    for deg in (40, 62, 138, 160, 200, 222, 298, 320):
        wall_strap(bm, math.radians(deg), 0.85, 3.70, 0.16, 0.05)

    # window bars and door hinge straps
    for spec in specs:
        mtx, w, spring = spec["mtx"], spec["w"], spec["spring"]
        if spec["kind"] == "barred":
            for x in (-w / 6, w / 6):
                add_box(bm, (x, 0.06, (spring + w / 2) / 2),
                        (0.05, 0.05, spring + w / 2), matrix=mtx)
            add_box(bm, (0, 0.06, spring * 0.6), (w, 0.05, 0.05), matrix=mtx)
        elif spec["kind"] == "door":
            for z in (0.45, 1.35, 2.25):
                add_box(bm, (0, 0.045, z), (w * 0.82, 0.03, 0.12), matrix=mtx)
                for x in (-w * 0.34, -w * 0.11, w * 0.11, w * 0.34):
                    add_box(bm, (x, 0.03, z), (0.05, 0.035, 0.05), matrix=mtx)

    # ridge sleeve and finial spike
    rings = [circle_ring(bm, r, z, segs=12) for r, z in
             ((0.18, APEX_Z - 0.28), (0.18, APEX_Z + 0.22),
              (0.06, APEX_Z + 0.40), (0.045, APEX_Z + 0.78),
              (0.012, APEX_Z + 1.05))]
    bridge_rings(bm, rings)
    grid_cap(bm, rings[0])
    grid_cap(bm, rings[-1])

    return mesh_object(bm, "Watchtower_Iron", mats, col, smooth=40)


# ------------------------------------------------------------------- foliage
def build_ivy(mats, col):
    bm = bmesh.new()
    leaf = [Vector(v) for v in
            ((0, 0, 0), (0.13, 0, 0.16), (0, 0, 0.34), (-0.13, 0, 0.16))]

    for theta0 in (0.38, 0.62, 1.5, 2.3, 3.05, 3.6, 4.6, 5.35, 5.85):
        z, theta = 0.12, theta0
        z_max = RND.uniform(3.2, 5.6)
        pts = []
        while z < z_max:
            r = wall_r(z) + 0.07
            pts.append(Vector((r * math.cos(theta), r * math.sin(theta), z)))
            z += RND.uniform(0.24, 0.36)
            theta += RND.uniform(-0.14, 0.20)

        rings = []
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] -
                 pts[max(i - 1, 0)]).normalized()
            side = t.cross(Vector((0, 0, 1)))
            side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
            up = side.cross(t).normalized()
            rad = 0.035 * (1.0 - 0.6 * i / len(pts))
            rings.append([bm.verts.new(p + (side * math.cos(a) +
                                            up * math.sin(a)) * rad)
                          for a in (0, TAU / 4, TAU / 2, 3 * TAU / 4)])
        bridge_rings(bm, rings, mat_index=0)

        for p in pts[1:]:
            for _ in range(3 if RND.random() < 0.65 else 2):
                a = math.atan2(p.y, p.x)
                m = (Matrix.Translation(p + Vector((0, 0,
                                                    RND.uniform(-0.12, 0.12)))) @
                     Matrix.Rotation(a - math.pi / 2 +
                                     RND.uniform(-1.0, 1.0), 4, 'Z') @
                     Matrix.Rotation(RND.uniform(-0.8, 0.2), 4, 'X'))
                f = bm.faces.new(bm.verts.new(m @ v) for v in leaf)
                f.material_index = 1

    return mesh_object(bm, "Watchtower_Ivy", mats, col, smooth=80)


# ------------------------------------------------------------- texture baking
# glTF cannot carry procedural node graphs — without baking, every material in
# the exported GLB comes out flat white. These helpers evaluate the procedural
# shaders into real PBR texture maps so the exported asset matches the render.
BAKE_CHANNELS = ("BaseColor", "Roughness", "Metallic", "Normal")


def _material_output(mat):
    return next(n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL')


def _route_to_emission(mat, socket_name):
    """Temporarily make the material emit one BSDF input's raw value, so an
    EMIT bake captures it exactly with no light transport involved."""
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    out = _material_output(mat)
    emit = nt.nodes.new("ShaderNodeEmission")
    sock = bsdf.inputs[socket_name]
    if sock.is_linked:
        nt.links.new(sock.links[0].from_socket, emit.inputs["Color"])
    else:
        v = sock.default_value
        try:
            emit.inputs["Color"].default_value = (v[0], v[1], v[2], 1.0)
        except TypeError:
            emit.inputs["Color"].default_value = (v, v, v, 1.0)
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return emit, bsdf, out


def _restore_surface(mat, emit, bsdf, out):
    mat.node_tree.nodes.remove(emit)
    mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])


def _add_bake_target(mat, image):
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    node.select = True
    mat.node_tree.nodes.active = node
    return node


def bake_pbr_maps(objects, size):
    """Bake base colour, roughness, metallic and a tangent-space normal map
    for every object. Returns {object: {channel: image}}."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1          # EMIT and NORMAL bakes are noise-free
    scene.render.bake.margin = 12
    scene.render.bake.use_clear = True

    baked = {}
    for obj in objects:
        maps = {}
        for chan in BAKE_CHANNELS:
            img = bpy.data.images.new(f"{obj.name}_{chan}", size, size,
                                      alpha=False, float_buffer=False)
            img.colorspace_settings.name = ('sRGB' if chan == "BaseColor"
                                            else 'Non-Color')
            maps[chan] = img
        baked[obj] = maps

        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        mats = list(obj.data.materials)

        for chan in BAKE_CHANNELS:
            targets = [_add_bake_target(m, maps[chan]) for m in mats]
            if chan == "Normal":
                bpy.ops.object.bake(type='NORMAL')
            else:
                socket = "Base Color" if chan == "BaseColor" else chan
                saved = [_route_to_emission(m, socket) for m in mats]
                bpy.ops.object.bake(type='EMIT')
                for m, s in zip(mats, saved):
                    _restore_surface(m, *s)
            for m, node in zip(mats, targets):
                m.node_tree.nodes.remove(node)
        print(f"  baked {obj.name} ({size}x{size})")
    return baked


def compose_orm(name, rough_img, metal_img, size):
    """Pack roughness into green and metallic into blue — the channel layout
    glTF expects, which keeps the exporter from inventing its own."""
    import numpy as np
    n = size * size * 4
    r = np.empty(n, dtype=np.float32)
    rough_img.pixels.foreach_get(r)
    m = np.empty(n, dtype=np.float32)
    metal_img.pixels.foreach_get(m)
    out = np.ones(n, dtype=np.float32)
    out[1::4] = r[0::4]
    out[2::4] = m[0::4]
    img = bpy.data.images.new(name, size, size, alpha=False,
                              float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(out)
    img.update()
    return img


def make_baked_material(name, base_img, orm_img, nrm_img):
    m, nt, bsdf = _nodes(name)
    ln = nt.links
    t_base = nt.nodes.new("ShaderNodeTexImage")
    t_base.image = base_img
    ln.new(t_base.outputs["Color"], bsdf.inputs["Base Color"])

    t_orm = nt.nodes.new("ShaderNodeTexImage")
    t_orm.image = orm_img
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    ln.new(t_orm.outputs["Color"], sep.inputs["Color"])
    ln.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    ln.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

    t_nrm = nt.nodes.new("ShaderNodeTexImage")
    t_nrm.image = nrm_img
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    ln.new(t_nrm.outputs["Color"], nmap.inputs["Color"])
    ln.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def export_baked_glb(objects, glb_path, tex_dir, size):
    """Bake, swap in image-based materials, export, then put the procedural
    materials back so the .blend stays the editable source."""
    baked = bake_pbr_maps(objects, size)
    os.makedirs(tex_dir, exist_ok=True)

    originals = {}
    for obj in objects:
        maps = baked[obj]
        orm = compose_orm(f"{obj.name}_ORM", maps["Roughness"],
                          maps["Metallic"], size)
        for img in (maps["BaseColor"], orm, maps["Normal"]):
            img.filepath_raw = os.path.join(tex_dir, f"{img.name}.png")
            img.file_format = 'PNG'
            img.save()
        originals[obj] = list(obj.data.materials)
        obj.data.materials.clear()
        obj.data.materials.append(
            make_baked_material(f"{obj.name}_Baked", maps["BaseColor"], orm,
                                maps["Normal"]))

    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB',
                              use_selection=True, export_yup=True,
                              export_apply=True)

    for obj in objects:
        obj.data.materials.clear()
        for mat in originals[obj]:
            obj.data.materials.append(mat)


# --------------------------------------------------------------- scene setup
def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def frame_camera(cam, scene, objects, direction, margin=1.05):
    """Push the camera back along `direction` until every bounding-box corner
    projects inside the frame — a tight fit rather than a bounding sphere,
    which would waste most of the frame on a tall, narrow model."""
    pts = [obj.matrix_world @ Vector(c)
           for obj in objects for c in obj.bound_box]

    d = direction.normalized()
    fwd = -d
    right = fwd.cross(Vector((0, 0, 1)))
    right = right.normalized() if right.length > 1e-6 else Vector((1, 0, 0))
    up = right.cross(fwd).normalized()

    # Aim at the centre of the model's extent *as projected on the camera
    # axes* — the centroid of the corner cloud is pulled off-centre by the
    # uneven object sizes and would leave dead space on one side.
    ref = pts[0]
    spans = []
    for axis in (right, up, d):
        vals = [(p - ref).dot(axis) for p in pts]
        spans.append((min(vals) + max(vals)) / 2)
    target = ref + right * spans[0] + up * spans[1] + d * spans[2]

    sensor, lens = cam.data.sensor_width, cam.data.lens
    rx, ry = scene.render.resolution_x, scene.render.resolution_y
    half_x = sensor / 2 * (1.0 if rx >= ry else rx / ry)
    half_y = sensor / 2 * (ry / rx if rx >= ry else 1.0)
    tan_x = half_x / lens / margin
    tan_y = half_y / lens / margin

    dist = 0.0
    for p in pts:
        v = p - target
        dist = max(dist, v.dot(d) + abs(v.dot(right)) / tan_x,
                   v.dot(d) + abs(v.dot(up)) / tan_y)
    cam.location = target + d * dist
    look_at(cam, target)
    return target


def setup_scene_and_render(objects, preview, do_render):
    scene = bpy.context.scene

    # neutral studio: soft grey world, transparent film, 3-point area lights
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.9, 0.9, 0.92, 1)
    bg.inputs["Strength"].default_value = 0.45
    scene.world = world

    scene.render.resolution_x = 600 if preview else 1200
    scene.render.resolution_y = 800 if preview else 1600

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 55
    cam = bpy.data.objects.new("Camera", cam_data)
    scene.collection.objects.link(cam)
    cam.location = Vector((0, 0, 0))
    center = frame_camera(cam, scene, objects, Vector((0.60, -0.74, 0.30)))
    scene.camera = cam

    for name, offset, power, size in (
            ("Key", Vector((1.1, -1.0, 1.05)), 9.0, 9),
            ("Fill", Vector((-1.25, -0.75, 0.25)), 3.0, 12),
            ("Rim", Vector((-0.35, 1.25, 0.95)), 6.0, 7)):
        data = bpy.data.lights.new(name, 'AREA')
        data.size = size
        light = bpy.data.objects.new(name, data)
        light.location = center + offset * 22.0
        # keep intensity independent of how far the rig sits from the model
        data.energy = power * (light.location - center).length ** 2
        scene.collection.objects.link(light)
        look_at(light, center)

    # AgX (the default) desaturates and lifts an isolated asset until the
    # stone reads as white plaster; the Khronos transform preserves albedo.
    for transform in ("Khronos PBR Neutral", "AgX"):
        try:
            scene.view_settings.view_transform = transform
            break
        except TypeError:
            continue

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24 if preview else 96
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = 'RGBA'

    if do_render:
        path = os.path.join(HERE, "renders", "watchtower_preview.png")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print(f"rendered: {path}")


def apply_smooth_and_uvs(objects):
    for obj in objects:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        angle = obj.get("smooth_angle")
        if angle is not None:
            try:
                bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
            except Exception:
                bpy.ops.object.shade_smooth()
            del obj["smooth_angle"]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66),
                                 island_margin=0.002)
        bpy.ops.object.mode_set(mode='OBJECT')


def print_stats(objects):
    total_q = total_other = 0
    for obj in objects:
        quads = sum(1 for p in obj.data.polygons if len(p.vertices) == 4)
        other = len(obj.data.polygons) - quads
        total_q += quads
        total_other += other
        print(f"  {obj.name:20s} {quads:6d} quads, {other} non-quads")
    print(f"  total: {total_q} quads, {total_other} non-quad faces")
    return total_other


def main():
    preview = "--preview" in sys.argv
    do_render = "--no-render" not in sys.argv

    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.data.collections.new("Watchtower")
    bpy.context.scene.collection.children.link(col)

    stone = make_stone_material()
    dark = make_flat_material("WT_Recess", (0.006, 0.006, 0.007, 1))
    shingle = make_wood_material("WT_WoodShingle", [
        (0.15, (0.058, 0.042, 0.030, 1)),
        (0.55, (0.130, 0.100, 0.070, 1)),
        (0.85, (0.225, 0.196, 0.160, 1))])   # silvered weathered cedar
    iron = make_iron_material()
    stem = make_flat_material("WT_IvyStem", (0.055, 0.040, 0.020, 1), 0.8)
    ivy = make_ivy_material()

    specs = make_openings()
    objects = [
        build_stone([stone, dark], col, specs),
        build_wood([shingle], col, specs),
        build_iron([iron], col, specs),
        build_ivy([stem, ivy], col),
    ]
    apply_smooth_and_uvs(objects)
    print("face statistics:")
    print_stats(objects)

    assets = os.path.join(HERE, "assets")
    os.makedirs(assets, exist_ok=True)
    blend_path = os.path.join(assets, "watchtower.blend")

    glb_path = os.path.join(assets, "watchtower.glb")
    if "--no-bake" in sys.argv:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB',
                                  use_selection=True, export_yup=True,
                                  export_apply=True)
    else:
        size = 512 if preview else 1024
        print(f"baking PBR maps at {size}x{size}:")
        export_baked_glb(objects, glb_path, os.path.join(assets, "textures"),
                         size)
    print(f"exported: {glb_path}")

    setup_scene_and_render(objects, preview, do_render)
    # save last so the .blend opens render-ready with the studio rig in place
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"saved: {blend_path}")


if __name__ == "__main__":
    main()
