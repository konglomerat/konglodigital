"""Build the Jagdweg colour, relief and roughness atlas from the site's swatches.

Run with Python, numpy and Pillow after editing the lawn rings or surface wear.
All coordinates and wavelengths are in the Blender model's local metres.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
assets = root / "assets/rosenwerk/materialien"
layout = json.loads((root / "src/lib/rosenwerk/survey.json").read_text())["vergeAtlas"]
density = 80
padding = layout["padding"]
panel_w = round((layout["width"] + 2 * padding) * density)
panel_h = round((layout["lengthPerPanel"] + 2 * padding) * density)


def smooth(lo, hi, value):
    t = np.clip((value - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def hash2(x, y, seed):
    a = np.sin(x * 127.1 + y * 311.7 + seed * 87.13) * 43758.5453
    return a - np.floor(a)


def noise(u, v, scale, seed):
    x, y = u / scale, v / scale
    i, j = np.floor(x), np.floor(y)
    s, t = smooth(0, 1, x - i), smooth(0, 1, y - j)
    return (1 - t) * ((1 - s) * hash2(i, j, seed) + s * hash2(i + 1, j, seed)) + t * (
        (1 - s) * hash2(i, j + 1, seed) + s * hash2(i + 1, j + 1, seed)
    )


def load(name, metres):
    # Band-limit the photographs to the actual texel density of the atlas.
    im = Image.open(assets / (name + ".jpg")).convert("RGB")
    size = round(metres * density)
    return np.asarray(
        im.resize((size, size), Image.Resampling.LANCZOS), dtype=np.float32
    )


def sample(tile, u, v, metres):
    x = np.floor(u / metres * tile.shape[1]).astype(int) % tile.shape[1]
    y = np.floor(-v / metres * tile.shape[0]).astype(int) % tile.shape[0]
    return tile[y, x]


def mix(base, top, factor):
    return base + (top - base) * factor[..., None]


lawn_tile = load("rasen", 1.8)
paver_tile = load("wegpflaster", 1.38)
mineral_tile = load("hofbeton", 2.4)
output = {
    name: Image.new("RGB", (panel_w * layout["panels"], panel_h))
    for name in ("farbe", "normal", "rauheit")
}
for panel in range(layout["panels"]):
    u0, v0 = layout["origin"]
    u, v = np.meshgrid(
        u0 - padding + (np.arange(panel_w) + 0.5) / density,
        v0
        + panel * layout["lengthPerPanel"]
        - padding
        + (np.arange(panel_h) + 0.5) / density,
    )
    broad = noise(u, v, 3.7, 5)
    mottling = noise(u, v, 0.82, 12)
    grains = noise(u, v, 0.065, 7)
    fine = noise(u, v, 0.024, 33)
    # Signed distance to the two real beds. Rounded, trampled corners flatten
    # out into wider strips at the ends of the entrance steps.
    dist = np.full_like(u, -100)
    for x1, y1, x2, y2 in layout["lawns"]:
        r = 0.30
        dx = np.abs(u - (x1 + x2) / 2) - (x2 - x1) / 2 + r
        dy = np.abs(v - (y1 + y2) / 2) - (y2 - y1) / 2 + r
        dist = np.maximum(
            dist,
            r
            - np.hypot(np.maximum(dx, 0), np.maximum(dy, 0))
            - np.minimum(np.maximum(dx, dy), 0),
        )
    corner_wear = np.exp(-(((u - 85.35) / 0.78) ** 2)) * (
        np.exp(-(((v - 22.15) / 1.25) ** 2))
        + 0.85 * np.exp(-(((v - 31.27) / 1.04) ** 2))
    )
    edge = (
        dist + (mottling - 0.48) * 0.35 + (grains - 0.5) * 0.11 + (fine - 0.5) * 0.048
    )
    soil_cover = smooth(-0.10, 0.065, edge + (fine - 0.5) * 0.045)
    meadow = smooth(
        -0.04,
        0.35,
        edge - corner_wear * 0.42 + (grains - 0.5) * 0.28 + (fine - 0.5) * 0.13,
    )
    dry = smooth(0.51, 0.89, 0.63 * broad + 0.37 * mottling)
    turf = sample(lawn_tile, u, v, 1.8)
    # Vary the direction of leaf detail over several metres, independent of the path grid.
    other = sample(lawn_tile, -v + 0.72, u + 0.41, 1.8)
    turf = mix(turf, other, smooth(0.29, 0.70, mottling))
    turf = mix(turf, turf * np.array([1.22, 1.02, 0.77]) + [8, 4, 2], dry * 0.78)
    turf *= (0.82 + 0.31 * broad)[..., None]
    soil = sample(mineral_tile, u, v, 2.4).mean(axis=2)[..., None] * [0.76, 0.65, 0.49]
    soil *= (0.91 + 0.17 * grains + 0.15 * (fine - 0.5))[..., None]
    grit = smooth(0.78, 0.97, hash2(np.floor(u * density), np.floor(v * density), 29))
    soil += (grit * (14 + 17 * grains))[..., None]
    # A few bare patches among the blades; join them to the worn corners.
    meadow *= 1 - 0.64 * smooth(
        0.70, 0.92, 0.54 * mottling + 0.29 * dry + 0.17 * grains
    )
    bed = mix(soil, turf, meadow)
    pavers = sample(paver_tile, u, v, 1.38)
    course = 1.38 / 12
    row = np.floor(v / course)
    stagger = ((row + 1) % 2) * course
    column = np.floor((u + stagger) / (course * 2))
    per_stone = hash2(column, row, 13)
    joint_x = np.abs(((u + stagger + course) % (course * 2)) - course)
    joint_y = np.abs((v + course / 2) % course - course / 2)
    gap = 1 - smooth(0.002, 0.017, np.minimum(joint_x, joint_y))
    dirt = np.exp(-np.maximum(0, -dist) / 0.6) * (0.27 + 0.58 * mottling)
    moss = gap * dirt * smooth(0.29, 0.72, mottling + 0.17 * (fine - 0.5))
    pavers *= (0.86 + 0.15 * per_stone + 0.12 * broad)[..., None]
    pavers = mix(pavers, soil, dirt * (0.09 + 0.24 * grains))
    pavers = mix(pavers, soil * [0.92, 1.17, 0.83], moss * 0.84)
    color = mix(pavers, bed, soil_cover)
    # Height in metres. Recesses are driven by the joint layout, not by stains.
    h_paver = 0.0016 * (per_stone - 0.5) - 0.0048 * gap + 0.0008 * (grains - 0.5)
    h_bed = 0.006 * (grains - 0.5) + 0.003 * (fine - 0.5) + 0.004 * meadow
    h = h_paver * (1 - soil_cover) + h_bed * soil_cover
    dv, du = np.gradient(h, 1 / density)
    normal = np.stack((-du, -dv, np.ones_like(du)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    walking = np.exp(-(((u - 86.73) / 0.72) ** 2)) + 0.7 * np.exp(
        -(((v - 26.55) / 1.59) ** 2)
    )
    rough = np.clip(
        0.83
        + 0.055 * (per_stone - 0.5)
        + 0.10 * gap
        - 0.105 * np.minimum(walking, 1) * (1 - gap)
        + 0.07 * soil_cover
        + 0.025 * (mottling - 0.5),
        0.61,
        0.99,
    )
    orm = np.stack((np.ones_like(rough), rough, np.zeros_like(rough)), axis=-1)
    for name, arr in (
        ("farbe", color),
        ("normal", (normal + 1) * 127.5),
        ("rauheit", 255 * orm),
    ):
        output[name].paste(
            Image.fromarray(np.uint8(np.clip(arr[::-1], 0, 255))), (panel * panel_w, 0)
        )
for name, im in output.items():
    if name != "farbe":
        im = im.resize((im.width // 2, im.height // 2), Image.Resampling.BOX)
    im.save(
        assets / ("jagdweg-" + name + ".jpg"), quality=90, subsampling=0, optimize=True
    )

# A longer swatch for the rest of the paved approaches. Tint each stone across a
# 3 x 3 repeat; the patch coordinates do not reset at the original photo's border.
span, size = 1.38 * 3, 1280
u, v = np.meshgrid(
    (np.arange(size) + 0.5) * span / size, (np.arange(size) + 0.5) * span / size
)
pavers = sample(
    np.asarray(Image.open(assets / "wegpflaster.jpg"), dtype=float), u, v, 1.38
)
course = 1.38 / 12
row = np.floor(v / course)
offset = ((row + 1) % 2) * course
col = np.floor((u + offset) / (2 * course))
stone = hash2(col % 18, row % 36, 1)
joint = np.minimum(
    np.abs((u + offset + course) % (2 * course) - course),
    np.abs((v + course / 2) % course - course / 2),
)
gap = 1 - smooth(0.001, 0.012, joint)
# Periodic broad variation avoids a border around the swatch.
patch = (
    0.5
    + 0.24 * np.sin(u / span * 2 * np.pi) * np.cos(v / span * 4 * np.pi)
    + 0.25 * np.sin(v / span * 2 * np.pi + 0.9)
)
pavers *= (0.88 + 0.19 * stone + 0.10 * (patch - 0.5))[..., None]
pavers = mix(pavers, np.array([100, 105, 78]), 0.5 * gap * smooth(0.48, 0.83, patch))
Image.fromarray(np.uint8(np.clip(pavers[::-1], 0, 255))).save(
    assets / "werkhof-pflaster.jpg", quality=87, subsampling=0, optimize=True
)
