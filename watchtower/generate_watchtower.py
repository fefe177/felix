# Nordic Watchtower — procedural Blender generator
#
# Builds a weathered three-story stone watchtower (circular base, wooden
# shingle roof, arched windows, iron reinforcements, moss + ivy), bakes the
# procedural PBR materials to textures, exports a game-ready GLB and renders
# neutral studio previews.
#
# Usage (either works):
#   python3 generate_watchtower.py -- [--out DIR] [--fast] [--no-renders]   # bpy wheel
#   blender -b -P generate_watchtower.py -- [--out DIR] [--fast]
#
# Tested with Blender 5.0 (pip "bpy" wheel) and 4.0. Note: some distro
# builds (Ubuntu's blender package) ship a Cycles that silently bakes
# black and lacks the OIDN denoiser — the official bpy wheel is preferred.

import bpy
import bmesh  # noqa: F401  (kept for users extending the script)
import math
import os
import random
import sys
from math import radians, sin, cos, pi, sqrt, atan2
from mathutils import Vector, Matrix, noise

# ----------------------------------------------------------------------------
# args
# ----------------------------------------------------------------------------
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(flag, default=None):
    if flag in argv:
        i = argv.index(flag)
        if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            return argv[i + 1]
        return True
    return default


OUT = os.path.abspath(arg("--out", os.path.dirname(os.path.abspath(__file__))))
FAST = bool(arg("--fast", False))
RENDERS = not bool(arg("--no-renders", False))

TEX = {"Stone": 2048, "Wood": 2048, "Iron": 1024, "Leaf": 512, "Dark": 128}
BAKE_SAMPLES = 16
RENDER_SAMPLES = 64
RES = (1152, 1440)
if FAST:
    TEX = {k: 256 for k in TEX}
    BAKE_SAMPLES = 4
    RENDER_SAMPLES = 12
    RES = (480, 600)

for sub in ("textures", "export", "renders", "blend"):
    os.makedirs(os.path.join(OUT, sub), exist_ok=True)

random.seed(20260729)
SEEDV = Vector((13.7, 41.3, 7.9))

# ----------------------------------------------------------------------------
# fresh scene
# ----------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"

# ----------------------------------------------------------------------------
# tower profile (z, radius) — piecewise, string courses + corbelled top
# ----------------------------------------------------------------------------
PROFILE = [
    (0.00, 3.360), (0.50, 3.290), (1.00, 3.250), (2.00, 3.200),
    (2.90, 3.155), (3.52, 3.115),
    (3.58, 3.340), (3.96, 3.340), (4.02, 3.060),          # string course 1
    (5.00, 3.015), (6.00, 2.975), (6.92, 2.940),
    (6.98, 3.160), (7.36, 3.160), (7.42, 2.880),          # string course 2
    (8.20, 2.845), (9.00, 2.805), (9.78, 2.770),
    (9.86, 2.990), (10.30, 3.020),                        # corbelled top
]
SEG = 32          # radial segments of the shell
JITTER = 0.018    # weathered irregularity of the stone shell


def r_at(z):
    """Wall radius at height z (piecewise linear on PROFILE)."""
    if z <= PROFILE[0][0]:
        return PROFILE[0][1]
    for (z0, r0), (z1, r1) in zip(PROFILE, PROFILE[1:]):
        if z <= z1:
            t = (z - z0) / max(z1 - z0, 1e-6)
            return r0 + t * (r1 - r0)
    return PROFILE[-1][1]


# ----------------------------------------------------------------------------
# geometry accumulation — one vertex/face list per material group
# ----------------------------------------------------------------------------
GROUPS = {k: {"v": [], "f": []} for k in ("Stone", "Wood", "Iron", "Leaf", "Dark")}


def add_vf(group, verts, faces, m=None):
    g = GROUPS[group]
    off = len(g["v"])
    if m is None:
        g["v"].extend([tuple(v) for v in verts])
    else:
        g["v"].extend([tuple(m @ Vector(v)) for v in verts])
    g["f"].extend([tuple(i + off for i in f) for f in faces])


def lathe_vf(profile, seg, closed=False, cap_bottom=False, cap_top=False,
             jitter=0.0, zfix_ends=True):
    """Revolve a (z, r) profile around Z. Profile ordered CCW in the (r, z)
    half-plane gives outward normals. Returns (verts, faces)."""
    verts, faces = [], []
    n = len(profile)
    for k, (z, r) in enumerate(profile):
        for j in range(seg):
            a = 2 * pi * j / seg
            x, y = r * cos(a), r * sin(a)
            if jitter and r > 0.05:
                p = Vector((x, y, z)) * 0.85 + SEEDV
                rr = r + jitter * noise.noise(p)
                x, y = rr * cos(a), rr * sin(a)
                if not (zfix_ends and (k == 0 or k == n - 1)):
                    z_ = z + 0.55 * jitter * noise.noise(p * 1.7 + Vector((5, 5, 5)))
                else:
                    z_ = z
                verts.append((x, y, z_))
            else:
                verts.append((x, y, z))
    rows = n if closed else n - 1
    for k in range(rows):
        k2 = (k + 1) % n
        for j in range(seg):
            j2 = (j + 1) % seg
            faces.append((k * seg + j, k * seg + j2, k2 * seg + j2, k2 * seg + j))
    if cap_bottom:
        c = len(verts)
        verts.append((0, 0, profile[0][0]))
        for j in range(seg):
            faces.append((c, (j + 1) % seg, j))
    if cap_top:
        c = len(verts)
        verts.append((0, 0, profile[-1][0]))
        base = (n - 1) * seg
        for j in range(seg):
            faces.append((c, base + j, base + (j + 1) % seg))
    return verts, faces


# unit box centered at origin, outward normals
BOX_V = [(-.5, -.5, -.5), (.5, -.5, -.5), (.5, .5, -.5), (-.5, .5, -.5),
         (-.5, -.5, .5), (.5, -.5, .5), (.5, .5, .5), (-.5, .5, .5)]
BOX_F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def box(group, m, sx, sy, sz):
    s = Matrix.Diagonal((sx, sy, sz, 1.0))
    add_vf(group, BOX_V, BOX_F, m @ s)


def box_from_quad(outer, inner_offset):
    """outer: 4 corners CCW seen from outside; extrude inward by vector."""
    o = [Vector(p) for p in outer]
    i = [p + inner_offset for p in o]
    verts = o + i
    faces = [(0, 1, 2, 3), (7, 6, 5, 4)]
    for a, b in ((0, 1), (1, 2), (2, 3), (3, 0)):
        faces.append((a, a + 4, b + 4, b))
    return verts, faces


def cyl_vf(r, h, seg=8, caps=True):
    return lathe_vf([(-h / 2, r), (h / 2, r)], seg,
                    cap_bottom=caps, cap_top=caps)


def torus_vf(R, r, nu=12, nv=6):
    verts, faces = [], []
    for iu in range(nu):
        u = 2 * pi * iu / nu
        for iv in range(nv):
            v = 2 * pi * iv / nv
            verts.append(((R + r * cos(v)) * cos(u),
                          (R + r * cos(v)) * sin(u),
                          r * sin(v)))
    for iu in range(nu):
        for iv in range(nv):
            a = iu * nv + iv
            b = iu * nv + (iv + 1) % nv
            c = ((iu + 1) % nu) * nv + (iv + 1) % nv
            d = ((iu + 1) % nu) * nv + iv
            faces.append((a, b, c, d))
    return verts, faces


# ----------------------------------------------------------------------------
# tower shell
# ----------------------------------------------------------------------------
print(">> building shell")
v, f = lathe_vf(PROFILE, SEG, cap_bottom=True, cap_top=True, jitter=JITTER)
add_vf("Stone", v, f)


# ----------------------------------------------------------------------------
# arched window / door assemblies (no booleans: raised frame + dark panel)
# ----------------------------------------------------------------------------
def arch_outline(w, h, b=0.0, n_arc=12):
    """Arch outline in the local XZ plane from bottom-left, up, over the
    semicircular head, down to bottom-right. b expands outward for the frame."""
    ar = w / 2
    hw = w / 2 + b
    spring = h - ar
    pts = [(-hw, 0.0), (-hw, spring * 0.5), (-hw, spring)]
    for i in range(1, n_arc + 1):
        t = pi * (1 - i / n_arc)
        pts.append(((ar + b) * cos(t), spring + (ar + b) * sin(t)))
    pts += [(hw, spring * 0.5), (hw, 0.0)]
    return pts


def wall_matrix(theta, z_base, r_pos):
    rot = Matrix.Rotation(theta - pi / 2, 4, "Z")
    tr = Matrix.Translation((r_pos * cos(theta), r_pos * sin(theta), z_base))
    return tr @ rot


def arch_assembly(theta, z_base, w, h, b, n_bars=0, door=False):
    z_mid = z_base + h / 2
    r_pos = max(r_at(z_base), r_at(z_base + h)) if door else r_at(z_mid)
    m = wall_matrix(theta, z_base, r_pos)

    inner = arch_outline(w, h, 0.0)
    outer = arch_outline(w, h, b)
    yf = 0.12                                        # frame front
    yp = 0.04                                        # dark panel
    xh = w / 2 + b
    yb = -(xh * xh / (2 * 2.6) + 0.08)               # frame back (into wall)
    n = len(inner)

    verts, faces = [], []

    def V(p, y):
        verts.append((p[0], y, p[1]))
        return len(verts) - 1

    fi = [V(p, yf) for p in inner]
    fo = [V(p, yf) for p in outer]
    bo = [V(p, yb) for p in outer]
    pi_ = [V(p, yp) for p in inner]
    for k in range(n - 1):
        faces.append((fi[k], fo[k], fo[k + 1], fi[k + 1]))       # front band
        faces.append((fo[k], bo[k], bo[k + 1], fo[k + 1]))       # outer side
        faces.append((fi[k], fi[k + 1], pi_[k + 1], pi_[k]))     # reveal
    add_vf("Stone", verts, faces, m)

    # dark recess panel (arch plate)
    pv = [(p[0], yp - 0.005, p[1]) for p in inner]
    add_vf("Dark", pv, [tuple(range(len(pv)))], m)

    # sill
    sill = m @ Matrix.Translation((0, (yf + yb) / 2 + 0.04, -0.055))
    box("Stone", sill, w + 2 * b + 0.14, (yf - yb) + 0.20, 0.11)

    # iron bars
    if n_bars:
        xs = [0.0] if n_bars == 1 else [-w * 0.17, w * 0.17]
        bar_h = h * 0.86
        for x in xs:
            bv, bf = cyl_vf(0.016, bar_h, seg=6)
            bm = m @ Matrix.Translation((x, 0.085, 0.06 + bar_h / 2))
            add_vf("Iron", bv, bf, bm)

    if door:
        ar = w / 2
        spring = h - ar
        n_sl = 5
        sw = (w - 0.02) / n_sl

        def arch_top(x):
            x = abs(x)
            if x >= ar:
                return spring
            return spring + sqrt(max(ar * ar - x * x, 0.0))

        for i in range(n_sl):
            x0 = -w / 2 + 0.01 + i * sw
            x1 = x0 + sw - 0.012
            top = min(arch_top(x0), arch_top(x1)) - 0.03
            cx = (x0 + x1) / 2
            sm = m @ Matrix.Translation((cx, 0.075, (0.02 + top) / 2))
            box("Wood", sm, (x1 - x0), 0.05, top - 0.02)
        # backing plate behind the plank gaps
        bp = [(p[0] * 0.98, 0.045, p[1] * 0.99 + 0.005) for p in inner]
        add_vf("Dark", bp, [tuple(range(len(bp)))], m)
        # hinge straps + studs + handle
        for zs in (0.55, 1.55):
            hm = m @ Matrix.Translation((0, 0.112, zs))
            box("Iron", hm, w * 0.86, 0.026, 0.085)
            for xs_ in (-w * 0.36, -w * 0.12, w * 0.12, w * 0.36):
                sv, sf = cyl_vf(0.02, 0.035, seg=6)
                smx = m @ Matrix.Translation((xs_, 0.118, zs)) @ \
                    Matrix.Rotation(pi / 2, 4, "X")
                add_vf("Iron", sv, sf, smx)
        tv, tf = torus_vf(0.055, 0.011, 10, 6)
        tm = m @ Matrix.Translation((w * 0.28, 0.125, 1.12)) @ \
            Matrix.Rotation(pi / 2, 4, "X")
        add_vf("Iron", tv, tf, tm)
        # stone step
        st = m @ Matrix.Translation((0, yf + 0.16, -0.075))
        box("Stone", st, w + 2 * b + 0.5, 0.62, 0.155)


print(">> windows + door")
arch_assembly(0.0, 0.14, 1.15, 2.25, 0.16, door=True)
for th in (90, 270):                                  # story 1 slits
    arch_assembly(radians(th), 1.80, 0.32, 1.05, 0.09, n_bars=1)
for th in (60, 180, 300):                             # story 2
    arch_assembly(radians(th), 4.60, 0.78, 1.55, 0.12, n_bars=2)
for th in (0, 90, 180, 270):                          # story 3 lookout
    arch_assembly(radians(th), 7.70, 0.88, 1.45, 0.12)

# ----------------------------------------------------------------------------
# iron reinforcement bands + rivets
# ----------------------------------------------------------------------------
print(">> iron bands")
for zb in (3.15, 6.55, 9.45):
    r = r_at(zb)
    prof = [(zb - 0.08, r - 0.01), (zb - 0.08, r + 0.07),
            (zb + 0.08, r + 0.07), (zb + 0.08, r - 0.01)]
    bv, bf = lathe_vf(prof, 40, closed=True)
    add_vf("Iron", bv, bf)
    for k in range(20):
        a = 2 * pi * (k + 0.5) / 20
        rv, rf = cyl_vf(0.042, 0.06, seg=6)
        rm = Matrix.Rotation(a, 4, "Z") @ \
            Matrix.Translation((r + 0.08, 0, zb)) @ \
            Matrix.Rotation(pi / 2, 4, "Y")
        add_vf("Iron", rv, rf, rm)

# ----------------------------------------------------------------------------
# roof: deck cone, fascia, rafter tails, shingles, iron finial
# ----------------------------------------------------------------------------
print(">> roof")
E = (3.60, 10.50)   # (radius, z) at eave
A = (0.06, 14.35)   # near apex
deck = [(10.24, 2.70), (10.24, 3.60), (10.50, 3.60)]
for t in (0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0):
    deck.append((E[1] + t * (A[1] - E[1]), E[0] + t * (A[0] - E[0])))
dv, df = lathe_vf(deck, SEG, cap_top=True)
add_vf("Wood", dv, df)

for k in range(16):
    a = 2 * pi * k / 16
    rm = Matrix.Rotation(a, 4, "Z") @ Matrix.Translation((3.10, 0, 10.16))
    box("Wood", rm, 0.90, 0.11, 0.15)


def cone_pt(fr):
    return (E[0] + fr * (A[0] - E[0]), E[1] + fr * (A[1] - E[1]))


_d = Vector((A[0] - E[0], A[1] - E[1])).normalized()
CONE_N = Vector((_d.y, -_d.x))      # outward slope normal in the (r, z) plane

N_ROWS = 10
ROW_DF = 0.098
SH_LEN = 0.135
shingle_count = 0
for i in range(N_ROWS):
    f0 = -0.02 + i * ROW_DF
    f1 = f0 + SH_LEN
    r_mid = cone_pt((f0 + f1) / 2)[0]
    w_t = 0.36 - 0.13 * f0
    cnt = max(7, int(2 * pi * r_mid / w_t))
    dphi = 2 * pi / cnt
    for j in range(cnt):
        shingle_count += 1
        phi = (j + 0.5 * (i % 2)) * dphi + random.uniform(-0.04, 0.04) * dphi
        hw = dphi * 0.46
        fb = f0 + random.uniform(-0.012, 0.012)
        ob = 0.045 + random.uniform(0.0, 0.014)
        ot = 0.012
        roll = random.uniform(-0.008, 0.008)

        def P(fr, ph, off):
            r2, z2 = cone_pt(fr)
            return Vector((
                (r2 + off * CONE_N.x) * cos(ph),
                (r2 + off * CONE_N.x) * sin(ph),
                z2 + off * CONE_N.y))

        outer = [P(fb, phi - hw, ob + roll), P(fb, phi + hw, ob - roll),
                 P(f1, phi + hw, ot - roll), P(f1, phi - hw, ot + roll)]
        nrm = Vector((CONE_N.x * cos(phi), CONE_N.x * sin(phi), CONE_N.y))
        sv, sf = box_from_quad(outer, -0.022 * nrm)
        add_vf("Wood", sv, sf)

finial = [(14.02, 0.36), (14.32, 0.19), (14.52, 0.08), (14.55, 0.034),
          (14.82, 0.028), (14.86, 0.056), (14.90, 0.080), (14.94, 0.088),
          (15.00, 0.074), (15.04, 0.048), (15.07, 0.028), (15.11, 0.026),
          (15.44, 0.004)]
fv, ff = lathe_vf(finial, 16, cap_bottom=True, cap_top=True)
add_vf("Iron", fv, ff)

# ----------------------------------------------------------------------------
# ivy vines climbing the lower walls
# ----------------------------------------------------------------------------
print(">> ivy")


def leaf_vf(size):
    w2 = size * 0.42
    L = size
    f_ = size * 0.14
    verts = [(0, 0, 0), (-w2, L * 0.5, f_), (w2, L * 0.5, f_),
             (0, L * 0.55, -f_ * 0.6), (0, L, f_ * 0.5)]
    faces = [(0, 1, 3, 2), (1, 4, 2, 3)]
    return verts, faces


def ortho_from(dir_y, ref_z):
    ny = dir_y.normalized()
    nz = (ref_z - ref_z.dot(ny) * ny)
    if nz.length < 1e-5:
        nz = ny.orthogonal()
    nz.normalize()
    nx = ny.cross(nz)
    return Matrix((nx, ny, nz)).transposed()


def ivy_vine(theta0, th_min, th_max, z_top, seed):
    rng = random.Random(seed)
    th = radians(theta0)
    z = 0.06
    pts = []
    while z < z_top:
        r = r_at(z) + 0.05
        pts.append(Vector((r * cos(th), r * sin(th), z)))
        th += radians(rng.uniform(-9, 9) + 3.5 * sin(z * 1.6 + seed))
        th = min(max(th, radians(th_min)), radians(th_max))
        z += rng.uniform(0.16, 0.26)

    # stem tube
    verts, faces = [], []
    nseg = 5
    for k, p in enumerate(pts):
        t = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        out = Vector((p.x, p.y, 0)).normalized()
        u = t.cross(out)
        if u.length < 1e-5:
            u = t.orthogonal()
        u.normalize()
        w_ = t.cross(u).normalized()
        rad = 0.020 - 0.014 * (k / max(len(pts) - 1, 1))
        for s in range(nseg):
            a = 2 * pi * s / nseg
            verts.append(tuple(p + rad * (cos(a) * u + sin(a) * w_)))
    for k in range(len(pts) - 1):
        for s in range(nseg):
            s2 = (s + 1) % nseg
            faces.append((k * nseg + s, k * nseg + s2,
                          (k + 1) * nseg + s2, (k + 1) * nseg + s))
    add_vf("Leaf", verts, faces)

    # leaves
    for k, p in enumerate(pts):
        if k < 1:
            continue
        n_l = rng.randint(2, 3) + (1 if p.z < 1.5 else 0)
        out = Vector((p.x, p.y, 0)).normalized()
        tan = Vector((-out.y, out.x, 0))
        for _ in range(n_l):
            size = rng.uniform(0.13, 0.22) * (1.0 - 0.3 * p.z / z_top)
            base = p + tan * rng.uniform(-0.16, 0.16) + \
                Vector((0, 0, rng.uniform(-0.08, 0.08))) + out * 0.01
            d = (out * rng.uniform(0.3, 0.8) +
                 tan * rng.uniform(-0.7, 0.7) +
                 Vector((0, 0, rng.uniform(-0.1, 0.75))))
            rotm = ortho_from(d, out + Vector((0, 0, rng.uniform(-0.3, 0.3))))
            lv, lf = leaf_vf(size)
            m = Matrix.Translation(base) @ rotm.to_4x4()
            add_vf("Leaf", lv, lf, m)


ivy_vine(35, 22, 75, 5.2, 11)
ivy_vine(215, 188, 246, 4.1, 23)
ivy_vine(140, 118, 165, 2.9, 37)

# ----------------------------------------------------------------------------
# materials (procedural PBR — baked to textures further down)
# ----------------------------------------------------------------------------
print(">> materials")


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return m, nt, nt.nodes["Principled BSDF"]


def mixrgb(nt, fac, a, b):
    try:
        n = nt.nodes.new("ShaderNodeMixRGB")
        fs, as_, bs, out = n.inputs["Fac"], n.inputs["Color1"], n.inputs["Color2"], n.outputs["Color"]
    except RuntimeError:
        n = nt.nodes.new("ShaderNodeMix")
        n.data_type = "RGBA"
        fs, as_, bs, out = n.inputs[0], n.inputs[6], n.inputs[7], n.outputs[2]
    for sock, val in ((fs, fac), (as_, a), (bs, b)):
        if isinstance(val, (int, float)):
            sock.default_value = val
        elif isinstance(val, tuple):
            sock.default_value = val
        else:
            nt.links.new(val, sock)
    return n, out, fs


def math_n(nt, op, a, b=None):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = True
    for i, val in enumerate((a, b)):
        if val is None:
            continue
        if isinstance(val, (int, float)):
            n.inputs[i].default_value = val
        else:
            nt.links.new(val, n.inputs[i])
    return n.outputs[0]


def stone_material():
    m, nt, bsdf = new_mat("M_Stone")
    L = nt.links
    tc = nt.nodes.new("ShaderNodeTexCoord")
    pos = tc.outputs["Object"]

    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Scale"].default_value = 2.2
    L.new(pos, vor.inputs["Vector"])
    crack = math_n(nt, "SUBTRACT", 1.0,
                   math_n(nt, "DIVIDE", vor.outputs["Distance"], 0.11))

    cell = nt.nodes.new("ShaderNodeTexVoronoi")
    cell.inputs["Scale"].default_value = 2.2
    L.new(pos, cell.inputs["Vector"])
    cellbw = nt.nodes.new("ShaderNodeValToRGB")
    cellbw.color_ramp.elements[0].color = (0.115, 0.11, 0.105, 1)
    cellbw.color_ramp.elements[1].color = (0.34, 0.32, 0.29, 1)
    L.new(cell.outputs["Color"], cellbw.inputs[0])

    grime = nt.nodes.new("ShaderNodeTexNoise")
    grime.inputs["Scale"].default_value = 0.4
    grime.inputs["Detail"].default_value = 4
    L.new(pos, grime.inputs["Vector"])
    _, col1, _ = mixrgb(nt, grime.outputs["Fac"],
                        (0.145, 0.14, 0.135, 1), (0.31, 0.30, 0.28, 1))
    _, col2, fs2 = mixrgb(nt, 0.6, col1, cellbw.outputs["Color"])
    _, col3, _ = mixrgb(nt, crack, col2, (0.045, 0.043, 0.040, 1))

    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 17
    fine.inputs["Detail"].default_value = 8
    L.new(pos, fine.inputs["Vector"])
    speck = math_n(nt, "MULTIPLY",
                   math_n(nt, "SUBTRACT", fine.outputs["Fac"], 0.5), 0.35)
    _, col4, _ = mixrgb(nt, speck, col3, (0.45, 0.43, 0.40, 1))

    # moss on the lower walls
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    L.new(pos, sep.inputs[0])
    hgt = nt.nodes.new("ShaderNodeMapRange")
    hgt.inputs["From Min"].default_value = 0.2
    hgt.inputs["From Max"].default_value = 4.8
    hgt.inputs["To Min"].default_value = 1.0
    hgt.inputs["To Max"].default_value = 0.0
    L.new(sep.outputs["Z"], hgt.inputs["Value"])
    mnoise = nt.nodes.new("ShaderNodeTexNoise")
    mnoise.inputs["Scale"].default_value = 1.7
    mnoise.inputs["Detail"].default_value = 5
    L.new(pos, mnoise.inputs["Vector"])
    # patchy threshold mask: dense clumps at the base, sparse higher up
    thr = math_n(nt, "SUBTRACT", 0.80,
                 math_n(nt, "MULTIPLY", hgt.outputs[0], 0.42))
    mossf = math_n(nt, "MULTIPLY",
                   math_n(nt, "SUBTRACT", mnoise.outputs["Fac"], thr), 5.0)
    mvar = nt.nodes.new("ShaderNodeTexNoise")
    mvar.inputs["Scale"].default_value = 7
    L.new(pos, mvar.inputs["Vector"])
    _, mosscol, _ = mixrgb(nt, mvar.outputs["Fac"],
                           (0.045, 0.085, 0.022, 1), (0.13, 0.19, 0.055, 1))
    _, colfin, _ = mixrgb(nt, mossf, col4, mosscol)
    L.new(colfin, bsdf.inputs["Base Color"])

    rough = math_n(nt, "ADD", 0.78, math_n(nt, "MULTIPLY", crack, 0.15))
    rough = math_n(nt, "ADD", rough, math_n(nt, "MULTIPLY", mossf, 0.1))
    L.new(rough, bsdf.inputs["Roughness"])

    bmp1 = nt.nodes.new("ShaderNodeBump")
    bmp1.inputs["Strength"].default_value = 0.75
    L.new(math_n(nt, "SUBTRACT", 1.0, crack), bmp1.inputs["Height"])
    bmp2 = nt.nodes.new("ShaderNodeBump")
    bmp2.inputs["Strength"].default_value = 0.12
    L.new(fine.outputs["Fac"], bmp2.inputs["Height"])
    L.new(bmp1.outputs["Normal"], bmp2.inputs["Normal"])
    L.new(bmp2.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def wood_material():
    m, nt, bsdf = new_mat("M_Wood")
    L = nt.links
    tc = nt.nodes.new("ShaderNodeTexCoord")
    pos = tc.outputs["Object"]

    cell = nt.nodes.new("ShaderNodeTexVoronoi")
    cell.inputs["Scale"].default_value = 3.4
    L.new(pos, cell.inputs["Vector"])
    cellramp = nt.nodes.new("ShaderNodeValToRGB")
    cellramp.color_ramp.elements[0].color = (0.055, 0.038, 0.024, 1)
    cellramp.color_ramp.elements[1].color = (0.17, 0.125, 0.085, 1)
    L.new(cell.outputs["Color"], cellramp.inputs[0])

    grain = nt.nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 6.5
    grain.inputs["Detail"].default_value = 7
    grain.inputs["Distortion"].default_value = 1.4
    L.new(pos, grain.inputs["Vector"])
    _, col1, _ = mixrgb(nt, grain.outputs["Fac"],
                        cellramp.outputs["Color"], (0.085, 0.058, 0.036, 1))
    silver = nt.nodes.new("ShaderNodeTexNoise")
    silver.inputs["Scale"].default_value = 1.1
    L.new(pos, silver.inputs["Vector"])
    _, col2, _ = mixrgb(nt, math_n(nt, "MULTIPLY", silver.outputs["Fac"], 0.45),
                        col1, (0.21, 0.19, 0.165, 1))
    L.new(col2, bsdf.inputs["Base Color"])

    rough = math_n(nt, "ADD", 0.66,
                   math_n(nt, "MULTIPLY", grain.outputs["Fac"], 0.28))
    L.new(rough, bsdf.inputs["Roughness"])

    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = 0.28
    L.new(grain.outputs["Fac"], bmp.inputs["Height"])
    L.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def iron_material():
    m, nt, bsdf = new_mat("M_Iron")
    L = nt.links
    tc = nt.nodes.new("ShaderNodeTexCoord")
    pos = tc.outputs["Object"]

    ctl = nt.nodes.new("ShaderNodeValue")
    ctl.name = ctl.label = "MetallicCtl"
    ctl.outputs[0].default_value = 1.0
    L.new(ctl.outputs[0], bsdf.inputs["Metallic"])

    rustn = nt.nodes.new("ShaderNodeTexNoise")
    rustn.inputs["Scale"].default_value = 5.0
    rustn.inputs["Detail"].default_value = 6
    L.new(pos, rustn.inputs["Vector"])
    rust = math_n(nt, "MULTIPLY",
                  math_n(nt, "SUBTRACT", rustn.outputs["Fac"], 0.58), 3.0)
    _, col, _ = mixrgb(nt, rust, (0.030, 0.030, 0.033, 1),
                       (0.135, 0.058, 0.028, 1))
    L.new(col, bsdf.inputs["Base Color"])
    rough = math_n(nt, "ADD", 0.48,
                   math_n(nt, "MULTIPLY", rust, 0.35))
    L.new(rough, bsdf.inputs["Roughness"])

    hammer = nt.nodes.new("ShaderNodeTexVoronoi")
    hammer.feature = "SMOOTH_F1"
    hammer.inputs["Scale"].default_value = 28
    L.new(pos, hammer.inputs["Vector"])
    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = 0.10
    L.new(hammer.outputs["Distance"], bmp.inputs["Height"])
    L.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    return m, ctl


def leaf_material():
    m, nt, bsdf = new_mat("M_Leaf")
    L = nt.links
    tc = nt.nodes.new("ShaderNodeTexCoord")
    pos = tc.outputs["Object"]
    n1 = nt.nodes.new("ShaderNodeTexNoise")
    n1.inputs["Scale"].default_value = 9
    L.new(pos, n1.inputs["Vector"])
    _, col, _ = mixrgb(nt, n1.outputs["Fac"],
                       (0.030, 0.085, 0.016, 1), (0.10, 0.185, 0.04, 1))
    L.new(col, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55
    return m


def dark_material():
    m, nt, bsdf = new_mat("M_Dark")
    bsdf.inputs["Base Color"].default_value = (0.013, 0.016, 0.020, 1)
    bsdf.inputs["Roughness"].default_value = 0.35
    return m


MATS = {}
MATS["Stone"] = stone_material()
MATS["Wood"] = wood_material()
MATS["Iron"], IRON_CTL = iron_material()
MATS["Leaf"] = leaf_material()
MATS["Dark"] = dark_material()

# ----------------------------------------------------------------------------
# create the 5 group objects
# ----------------------------------------------------------------------------
print(">> meshes")
objs = {}
for name, g in GROUPS.items():
    me = bpy.data.meshes.new(name)
    me.from_pydata(g["v"], [], g["f"])
    me.validate()
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    if hasattr(me, "use_auto_smooth"):        # Blender <= 4.0
        me.use_auto_smooth = True
        me.auto_smooth_angle = radians(40)
    me.materials.append(MATS[name])
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    objs[name] = ob

if not hasattr(bpy.types.Mesh, "use_auto_smooth"):  # Blender >= 4.1
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs.values():
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs["Stone"]
    bpy.ops.object.shade_auto_smooth(angle=radians(40))

# ----------------------------------------------------------------------------
# UV unwrap + bake procedural materials to PBR textures
# ----------------------------------------------------------------------------
print(">> baking")
scene.cycles.samples = BAKE_SAMPLES


def bake_group(ob, size):
    mat = ob.data.materials[0]
    nt = mat.node_tree
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=0.012)
    bpy.ops.object.mode_set(mode="OBJECT")

    imgs = {}
    specs = [("BaseColor", "sRGB", (0.5, 0.5, 0.5, 1)),
             ("Roughness", "Non-Color", (0.5, 0.5, 0.5, 1)),
             ("Normal", "Non-Color", (0.5, 0.5, 1.0, 1))]
    for pn, cs, gc in specs:
        img = bpy.data.images.new(f"T_Watchtower_{ob.name}_{pn}", size, size)
        img.generated_color = gc
        img.colorspace_settings.name = cs
        imgs[pn] = img

    tex_node = nt.nodes.new("ShaderNodeTexImage")
    tex_node.location = (-1600, -600)
    for n2 in nt.nodes:
        n2.select = False
    tex_node.select = True
    nt.nodes.active = tex_node
    margin = max(4, size // 128)

    is_iron = ob.name == "Iron"
    tex_node.image = imgs["BaseColor"]
    if is_iron:
        IRON_CTL.outputs[0].default_value = 0.0
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"},
                        margin=margin, use_clear=False)
    if is_iron:
        IRON_CTL.outputs[0].default_value = 1.0
    tex_node.image = imgs["Roughness"]
    bpy.ops.object.bake(type="ROUGHNESS", margin=margin, use_clear=False)
    tex_node.image = imgs["Normal"]
    bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT",
                        margin=margin, use_clear=False)

    for pn, img in imgs.items():
        img.filepath_raw = os.path.join(OUT, "textures", img.name + ".png")
        img.file_format = "PNG"
        img.save()
        print(f"   baked {img.name}")

    # replace with a baked PBR material (what the GLB will carry)
    bm = bpy.data.materials.new(f"M_{ob.name}_Baked")
    bm.use_nodes = True
    bnt = bm.node_tree
    bb = bnt.nodes["Principled BSDF"]
    tb = bnt.nodes.new("ShaderNodeTexImage")
    tb.image = imgs["BaseColor"]
    tb.location = (-500, 300)
    bnt.links.new(tb.outputs["Color"], bb.inputs["Base Color"])
    tr = bnt.nodes.new("ShaderNodeTexImage")
    tr.image = imgs["Roughness"]
    tr.location = (-500, 0)
    bnt.links.new(tr.outputs["Color"], bb.inputs["Roughness"])
    tn = bnt.nodes.new("ShaderNodeTexImage")
    tn.image = imgs["Normal"]
    tn.location = (-700, -300)
    nm = bnt.nodes.new("ShaderNodeNormalMap")
    nm.location = (-400, -300)
    bnt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    bnt.links.new(nm.outputs["Normal"], bb.inputs["Normal"])
    bb.inputs["Metallic"].default_value = 1.0 if is_iron else 0.0
    ob.data.materials[0] = bm


for name in ("Stone", "Wood", "Iron", "Leaf", "Dark"):
    print(f"   group {name} ({len(objs[name].data.polygons)} faces)")
    bake_group(objs[name], TEX[name])

# ----------------------------------------------------------------------------
# join into one object, stats, export GLB
# ----------------------------------------------------------------------------
print(">> join + export")
bpy.ops.object.select_all(action="DESELECT")
for ob in objs.values():
    ob.select_set(True)
bpy.context.view_layer.objects.active = objs["Stone"]
bpy.ops.object.join()
tower = bpy.context.view_layer.objects.active
tower.name = "NordicWatchtower"
tower.data.name = "NordicWatchtower"

me = tower.data
quads = sum(1 for p in me.polygons if len(p.vertices) == 4)
tris = sum(1 for p in me.polygons if len(p.vertices) == 3)
ngons = len(me.polygons) - quads - tris
tri_total = sum(len(p.vertices) - 2 for p in me.polygons)
print(f"STATS|verts={len(me.vertices)}|faces={len(me.polygons)}"
      f"|quads={quads}|tris={tris}|ngons={ngons}|tri_export={tri_total}"
      f"|shingles={shingle_count}")

glb_path = os.path.join(OUT, "export", "nordic_watchtower.glb")
bpy.ops.object.select_all(action="DESELECT")
tower.select_set(True)
bpy.context.view_layer.objects.active = tower
bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB",
                          use_selection=True)
print(f"GLB|{glb_path}")

# ----------------------------------------------------------------------------
# neutral studio lighting + camera, transparent background renders
# ----------------------------------------------------------------------------
print(">> studio + renders")
world = bpy.data.worlds.new("Studio")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.90, 0.92, 0.95, 1)
bg.inputs[1].default_value = 0.28
scene.world = world
scene.render.film_transparent = True

target = bpy.data.objects.new("RIG_Target", None)
target.location = (0, 0, 7.0)
scene.collection.objects.link(target)


def add_light(name, loc, size, power, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.size = size
    ld.energy = power
    ld.color = color
    lo = bpy.data.objects.new("RIG_" + name, ld)
    lo.location = loc
    scene.collection.objects.link(lo)
    c = lo.constraints.new("TRACK_TO")
    c.target = target
    return lo


add_light("Key", (9.0, -15.6, 14.0), 6.0, 4500)
add_light("Fill", (13.8, 11.6, 6.0), 10.0, 1600, (0.92, 0.95, 1.0))
add_light("Rim", (-17.7, 3.1, 15.0), 5.0, 3000)

cam_data = bpy.data.cameras.new("Camera")
cam = bpy.data.objects.new("RIG_Camera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
ccon = cam.constraints.new("TRACK_TO")
ccon.target = target

# OIDN denoiser when the build has it, otherwise supersample 2x + downscale
USE_DENOISE = True
try:
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
except Exception:
    USE_DENOISE = False
    scene.cycles.use_denoising = False
SS = 1 if USE_DENOISE else 2
scene.render.resolution_x = RES[0] * SS
scene.render.resolution_y = RES[1] * SS
scene.cycles.samples = RENDER_SAMPLES
scene.cycles.max_bounces = 6
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

VIEWS = [
    ("hero", -30, 24.5, 8.4, (0, 0, 6.6), 50),
    ("back", 150, 24.5, 8.4, (0, 0, 6.6), 50),
    ("detail_base", -14, 11.5, 2.9, (0, 0, 2.3), 55),
]
if RENDERS:
    for vname, az, dist, zc, tgt, lens in VIEWS:
        target.location = tgt
        a = radians(az)
        cam.location = (dist * cos(a), dist * sin(a), zc)
        cam_data.lens = lens
        scene.render.filepath = os.path.join(OUT, "renders", vname + ".png")
        try:
            bpy.ops.render.render(write_still=True)
        except RuntimeError:            # denoiser missing in this build
            scene.cycles.use_denoising = False
            bpy.ops.render.render(write_still=True)
        if SS > 1:
            img = bpy.data.images.load(scene.render.filepath)
            img.scale(RES[0], RES[1])
            img.save()
            bpy.data.images.remove(img)
        print(f"RENDER|{scene.render.filepath}")

# ----------------------------------------------------------------------------
# save .blend (textures packed so the file is self-contained)
# ----------------------------------------------------------------------------
try:
    bpy.ops.file.pack_all()
except Exception as e:
    print("pack failed:", e)
blend_path = os.path.join(OUT, "blend", "nordic_watchtower.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
print(f"BLEND|{blend_path}")
print("DONE")
