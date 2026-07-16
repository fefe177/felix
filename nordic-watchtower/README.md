# Nordic Stone Watchtower — procedural Blender asset

A weathered Nordic stone watchtower, generated entirely in Blender by a single
Python script: three stories on a circular, tapered base, wooden shingle roof,
arched windows, iron reinforcements, and moss and ivy creeping up the lower
walls. Stylized-realistic, game-ready, 100 % quad topology.

![Hero render](renders/watchtower_hero.png)
![Detail render](renders/watchtower_detail.png)

## Contents

| Path | Description |
| --- | --- |
| `generate_watchtower.py` | The generator. Rebuilds everything (geometry, textures, materials, lights, camera, exports, renders) deterministically from a fixed seed. |
| `exports/watchtower.blend` | Full scene: model, PBR node materials (textures packed), neutral three-point studio lighting, hero + detail cameras, Cycles render settings, transparent film. |
| `exports/watchtower.glb` | Game-ready glTF binary: 8 meshes, 6 materials, 12 embedded PBR maps. No lights/cameras — isolated object. |
| `textures/*.png` | Generated PBR maps: baseColor (sRGB), ORM (occlusion/roughness/metallic, non-color), normal (OpenGL-style, non-color) for stone, wood, shingles, iron. |
| `renders/*.png` | Cycles preview renders, transparent background. |

## Regenerating

```sh
# with Blender:
blender --background --python generate_watchtower.py

# or with the pip bpy module (Python 3.11):
pip install bpy numpy
python3 generate_watchtower.py
```

Set `WT_SKIP_RENDER=1` to skip the two preview renders.

## Asset details

- **Topology:** 3 039 faces, **100 % quads** (0 tris, 0 ngons); ~6 100
  triangles when triangulated — comfortably game-ready. Smooth shading with
  angle-based sharp edges.
- **Structure:** spun-profile stone shell (24 segments) with plinth, two
  string courses and a corbelled top; every part (frames, planks, shingles,
  bands, finial, ivy) is built from quad-only primitives — no booleans.
- **Openings:** the wall shell is uncut; arched frames extrude into the wall
  and recessed panes/planks sit just in front of it, referenced to the wall's
  maximum radius over each opening so nothing pokes through.
- **Roof:** ~180 individually placed and jittered wooden shingles over a
  closed underlayment cone, iron finial spike.
- **Iron reinforcements:** three forged bands around the body, X-shaped wall
  anchors, door straps with studs, ring handle, finial.
- **Moss & ivy:** moss is painted into the stone texture's lower band (the
  tower's cylindrical UVs map v to height, so it lands on the lower walls);
  four ivy vines with leaf cards are real geometry with vertex-color
  variation.
- **Materials:** metal/roughness PBR. Stone, wood, shingles and iron use
  procedurally generated (NumPy) texture maps — masonry courses with bevel
  normals, wood grain, weathered shakes, rusty iron — wired
  baseColor + ORM + normal so the glTF exporter emits standard
  `metallicRoughnessTexture` / `normalTexture` slots. Glass and ivy use
  factor-based PBR (ivy adds `COLOR_0` vertex colors).
- **Scene:** neutral white three-point studio lighting (key/fill/rim area
  lights), transparent background, no ground plane, camera framing the full
  model. Renders with Cycles CPU + OpenImageDenoise.
