"""Wood shop in factory (u, v, z) metres. Looking in from the dock, +v is left."""

import math
import random

from mathutils import Vector


def hose(g, controls, radius, rubber, rib):
    """Follow the sag between suspension points, with raised spiral-hose cuffs."""
    path = [Vector(p) for p in controls]
    points = []
    for i, (a, b) in enumerate(zip(path, path[1:])):
        before, after = path[max(i - 1, 0)], path[min(i + 2, len(path) - 1)]
        for j in range(8):
            t = j / 8
            points.append(
                0.5
                * (
                    2 * a
                    + (-before + b) * t
                    + (2 * before - 5 * a + 4 * b - after) * t * t
                    + (-before + 3 * a - 3 * b + after) * t**3
                )
            )
    points.append(path[-1])
    g.pipe(points, radius, rubber)
    pitch, distance = 0.032, 0
    for a, b in zip(points, points[1:]):
        segment = b - a
        length = segment.length
        while distance < length:
            p = a + segment.normalized() * distance
            g.pipe([p, p + segment.normalized() * 0.006], radius + 0.003, rib)
            distance += pitch
        distance -= length


def build_workshop(Part, site, local, m, bench, round_top, bake):
    spec = site["timberWorkshop"]
    rid = site["interiors"]["Holzwerkstatt"]
    wall, wood, ply, silver, steel = (
        m[k] for k in ("white", "wood", "ply", "galv", "steel")
    )
    gray, black, red, cream = (m[k] for k in ("frame", "boxpaint", "red", "tile"))
    floor, top, roof = 0.333, 1.19, 4.02
    front = spec["dockWallU"]
    objects = []
    rng = random.Random(4798)

    def part(name):
        return Part("Holzwerkstatt | " + name, rid, "interior")

    def finish(g):
        obj = g.finish()
        objects.append(obj)
        return obj

    def machine(key):
        item = spec["equipment"][key]
        u, v = local(item["point"]) + Vector(item.get("photoOffset", (0, 0)))
        return (
            Part(item["name"], item["id"], "machine"),
            u + spec["inventoryOffsetU"],
            v,
        )

    # Dark screed with the long joint used as a sight line in both directions.
    g = part("Estrich und Toranschluss")
    corners = [
        local(p) + Vector((spec["inventoryOffsetU"], 0))
        for p in spec["inventoryCorners"]
    ]
    g.prism([(max(front, p.x), p.y) for p in corners], floor - 0.05, floor, m["screed"])
    g.bar((front, 32.22), (15.13, 32.0), 0.012, floor, floor + 0.002, m["sill"])
    for u in (5.27, 9.72, 13.9):
        g.bar((u, 29.10), (u, 34.61), 0.009, floor, floor + 0.001, m["sill"])
    # Irregular flecks concentrate around the slide and the cut-off bins.
    for cx, cy, sx, sy in [
        (6.45, 31.56, 0.74, 0.24),
        (4.18, 30.1, 0.44, 0.38),
        (7.02, 33.15, 0.30, 0.23),
    ]:
        for _ in range(155):
            x, y = rng.gauss(cx, sx), rng.gauss(cy, sy)
            size = rng.uniform(0.004, 0.021)
            g.solid(
                [
                    (x, y, floor + 0.002),
                    (x + size * 1.6, y + size * 0.3, floor + 0.002),
                    (x + size * 0.4, y + size, floor + 0.002),
                ],
                [(0, 1, 2)],
                [m["dust"]],
            )
    finish(g)

    g = part("Seitenwände und Werkzeugtafeln")
    g.bar((front + 0.28, 29.12), (15.19, 28.95), 0.11, floor, roof, wall)
    g.bar((front + 0.28, 34.85), (15.29, 34.61), 0.11, floor, roof, wall)
    g.bar((15.18, 29.00), (15.28, 34.6), 0.12, floor, roof, wall)
    for u in (5.45, 9.68, 13.30):
        for v in (29.15, 34.50):
            g.box(u, v, floor, u + 0.23, v + 0.20, roof, wall)
    # Right side when entering: battens, wall storage and narrow upper lumber rack.
    g.box(3.02, 29.15, 0.67, 9.58, 29.225, 2.56, m["osb"])
    for u in (3.25, 4.85, 6.50, 8.05, 9.35):
        g.box(u, 29.21, 2.18, u + 0.072, 29.56, 2.27, wood)
        g.box(u, 29.51, 2.20, u + 0.072, 29.58, 2.52, wood)
    for i in range(7):
        v = 29.24 + (i % 3) * 0.091
        g.box(
            3.18 + i * 0.07,
            v,
            2.27 + (i // 3) * 0.052,
            8.62 + i * 0.075,
            v + 0.082,
            2.319 + (i // 3) * 0.052,
            (wood, ply, m["green"])[i % 3],
        )
    for u, width in ((3.52, 0.82), (4.50, 1.12), (7.0, 0.86)):
        for h in (1.39, 1.79):
            g.box(u, 29.22, h, u + width, 29.48, h + 0.035, ply)
            for i in range(5):
                round_top(
                    g,
                    u + 0.1 + i * width / 5,
                    29.39,
                    0.043,
                    h + 0.035,
                    0.11 + 0.035 * (i % 2),
                    (cream, gray, m["blue"], wood)[i % 4],
                )
    # Opposite bench and blue boards of small hardware bins along the miter station.
    for u, v, dx, dy in [(6.75, 33.98, 2.46, 0.55), (8.40, 29.23, 1.24, 0.61)]:
        bench(g, u, v, dx, dy, top, wood)
        g.box(u + 0.07, v + 0.04, 0.50, u + dx - 0.07, v + dy - 0.04, 0.92, wood)
        face = v + 0.002 if v > 32 else v + dy - 0.002
        for ix in range(5):
            for iz in range(3):
                x = u + 0.11 + ix * (dx - 0.22) / 5
                g.box(
                    x,
                    face - 0.015,
                    0.51 + iz * 0.13,
                    x + (dx - 0.27) / 5,
                    face + 0.015,
                    0.62 + iz * 0.13,
                    ply,
                )
                g.box(
                    x + 0.055,
                    face - 0.024,
                    0.56 + iz * 0.13,
                    x + 0.13,
                    face + 0.024,
                    0.58 + iz * 0.13,
                    steel,
                )
    for u in (8.09, 8.68, 9.27):
        g.box(u, 29.19, 1.69, u + 0.55, 29.37, 2.18, m["blue"])
        for i in range(5):
            for j in range(5):
                x, z = u + 0.028 + i * 0.101, 1.72 + j * 0.087
                g.box(x, 29.365, z, x + 0.087, 29.388, z + 0.065, gray)
    finish(g)

    # The sheet stock and scrap boxes sit just inside the door on opposing sides.
    g = part("Plattenlager, Restekisten und Spänesäcke")
    for i in range(10):
        u = 3.0 + (i % 4) * 0.21
        v = 34.45 - (i // 4) * 0.14
        height = 1.58 + rng.random() * 0.84
        g.slope(
            (u + 0.45, v - 0.18),
            (u + 0.45, v + 0.025),
            0.84,
            floor + 0.015,
            floor + height,
            0.032,
            ply if i % 3 else wood,
        )
    for u, v in ((3.04, 29.30), (3.07, 30.08)):
        for x in (u + 0.09, u + 0.90):
            for y in (v + 0.085, v + 0.51):
                round_top(g, x, y, 0.046, floor, 0.095, black)
        h = floor + 0.10
        g.box(u, v, h, u + 1.0, v + 0.60, h + 0.055, wood)
        for j in range(4):
            z = h + 0.06 + j * 0.117
            for x in (u, u + 0.963):
                g.box(x, v, z, x + 0.037, v + 0.60, z + 0.11, ply)
            for y in (v, v + 0.565):
                g.box(u, y, z, u + 1.0, y + 0.035, z + 0.11, wood)
        for i in range(18):
            x, y = u + 0.10 + rng.random() * 0.31, v + 0.08 + rng.random() * 0.39
            g.bar(
                (x, y),
                (x + 0.33 + rng.random() * 0.18, y + rng.uniform(-0.05, 0.06)),
                0.034,
                h + 0.40 + i * 0.007,
                h + 0.419 + i * 0.007,
                ply,
            )
    for x, y in ((4.52, 29.48), (4.44, 30.03)):
        g.box(x - 0.34, y - 0.25, floor, x + 0.34, y + 0.25, floor + 0.09, wood)
        sack(g, x, y, floor + 0.09, 0.285, 0.84, m["dustbag"])
    finish(g)

    # Rear stock rack, with an open passage on its left into the CNC area.
    g = part("Holzregal vor dem CNC-Bereich")
    for v in (29.19, 30.19, 31.14, 32.12, 33.00):
        for x in (9.76, 10.24):
            g.box(x, v, floor, x + 0.043, v + 0.047, 3.53, silver)
    for z in (floor + 0.09, 2.02, 2.76, 3.51):
        g.box(9.75, 29.17, z - 0.065, 10.31, 33.08, z, wood)
    for j in range(4):
        v = 29.22 + j * 0.94
        for i in range(10):
            y = v + 0.075 + i * 0.072
            h = rng.uniform(0.73, 1.54)
            if j != 1:
                g.slope(
                    (9.99, y),
                    (10.02, y + 0.085),
                    0.35,
                    floor + 0.14,
                    floor + 0.14 + h,
                    0.022,
                    (ply, wood, m["osb"])[i % 3],
                )
        for z in (2.04, 2.78):
            for i in range(9):
                y = v + 0.04 + (i % 3) * 0.21
                h = z + (i // 3) * 0.070
                g.box(
                    9.72 + rng.random() * 0.16,
                    y,
                    h,
                    10.28,
                    y + 0.13 + rng.random() * 0.06,
                    h + 0.059,
                    (wood, ply, m["osb"])[i % 3],
                )
    finish(g)

    g, u, v = machine("planer")
    g.box(u - 0.41, v - 0.24, floor, u + 0.41, v + 0.24, 1.01, gray)
    for x in (u - 0.73, u + 0.035):
        g.box(x, v - 0.255, 1.00, x + 0.69, v + 0.255, 1.085, silver)
    g.box(u - 0.69, v + 0.182, 1.085, u + 0.68, v + 0.22, 1.255, gray)
    g.box(u - 0.10, v - 0.20, 1.086, u + 0.02, v + 0.18, 1.102, red)
    g.box(u - 0.20, v - 0.258, 0.71, u + 0.01, v - 0.24, 0.83, black)
    finish(g)

    g, u, v = machine("bandsaw")
    g.box(u - 0.33, v - 0.30, floor, u + 0.32, v + 0.29, floor + 0.07, steel)
    g.box(u - 0.22, v - 0.21, floor + 0.07, u + 0.22, v + 0.22, 1.01, black)
    g.box(u + 0.12, v + 0.11, 0.65, u + 0.27, v + 0.27, 2.12, steel)
    g.box(u - 0.30, v - 0.26, 1.03, u + 0.31, v + 0.32, 1.10, silver)
    g.box(u - 0.24, v - 0.05, 1.55, u + 0.24, v + 0.26, 2.14, gray)
    g.box(u - 0.18, v - 0.03, 1.30, u - 0.10, v + 0.055, 1.56, red)
    g.pipe([(u - 0.14, v + 0.012, 1.10), (u - 0.14, v + 0.012, 1.34)], 0.006, steel)
    for z in (1.64, 1.94):
        g.pipe([(u + 0.09, v - 0.057, z), (u + 0.09, v - 0.085, z)], 0.046, black)
    hose(
        g,
        [
            (u + 0.20, v + 0.21, 0.64),
            (u + 0.39, v + 0.22, 1.41),
            (u + 0.29, v + 0.20, 2.17),
            (u + 0.01, v + 0.17, 2.28),
            (u - 0.28, v + 0.21, 2.01),
            (u - 0.32, v + 0.26, 1.23),
        ],
        0.066,
        m["hose"],
        cream,
    )
    finish(g)

    g, u, v = machine("drill")
    bench(g, u - 0.37, v - 0.32, 0.75, 0.67, 1.08, wood)
    g.box(u - 0.175, v - 0.15, 1.08, u + 0.18, v + 0.19, 1.14, steel)
    g.pipe([(u, v + 0.12, 1.13), (u, v + 0.12, 1.82)], 0.038, silver)
    g.box(u - 0.14, v - 0.23, 1.73, u + 0.135, v + 0.24, 1.89, steel)
    g.box(u - 0.16, v - 0.18, 1.34, u + 0.16, v + 0.13, 1.38, silver)
    g.pipe([(u, v - 0.14, 1.73), (u, v - 0.14, 1.53)], 0.021, black)
    for dx, dz in ((0.10, 0.08), (-0.10, 0.03), (0.02, -0.13)):
        g.pipe(
            [(u + 0.14, v - 0.09, 1.70), (u + 0.15 + dx, v - 0.09, 1.70 + dz)],
            0.012,
            silver,
        )
    finish(g)

    g, u, v = machine("mitre")
    g.box(u - 0.32, v - 0.28, top, u + 0.32, v + 0.30, top + 0.075, silver)
    round_top(g, u, v, 0.225, top + 0.075, 0.025, gray)
    g.pipe(
        [
            (u + 0.02, v + 0.19, top + 0.10),
            (u + 0.02, v + 0.22, top + 0.43),
            (u + 0.02, v - 0.07, top + 0.48),
        ],
        0.043,
        steel,
    )
    g.pipe(
        [(u - 0.03, v - 0.04, top + 0.28), (u + 0.035, v - 0.04, top + 0.28)],
        0.145,
        gray,
    )
    g.box(u - 0.045, v - 0.15, top + 0.36, u + 0.07, v + 0.13, top + 0.44, m["green"])
    finish(g)

    g, u, v = machine("extractor")
    for y in (v - 0.23, v + 0.23):
        g.box(u - 0.20, y - 0.17, floor + 0.01, u + 0.21, y + 0.17, floor + 0.09, steel)
        sack(g, u, y, floor + 0.09, 0.175, 0.92, m["dustbag"])
        round_top(g, u, y, 0.18, 1.30, 0.10, gray)
        sack(g, u, y, 1.40, 0.165, 0.56, cream)
    finish(g)

    g = part("Absaugbrücke und Schläuche")
    # Main duct crosses the aisle above both saws; collars, straps and outlets follow its route.
    x = 6.25
    path = [
        (x, 33.45, 2.34),
        (x, 33.45, 2.72),
        (x, 33.42, 2.83),
        (x, 33.33, 2.92),
        (x, 33.21, 2.95),
        (x, 29.61, 2.95),
        (x, 29.48, 2.91),
        (x, 29.39, 2.80),
        (x, 29.38, 2.68),
    ]
    g.pipe(path, 0.104, silver)
    for y in (29.72, 30.35, 31.08, 31.90, 32.62, 33.12):
        g.pipe([(x, y, 2.95), (x, y + 0.029, 2.95)], 0.113, silver)
    for y in (30.04, 32.74):
        g.pipe([(x, y, 3.04), (x, y, 3.90)], 0.008, steel)
    g.pipe(
        [
            (x, 29.39, 2.72),
            (9.89, 29.39, 2.72),
            (9.89, 29.65, 2.42),
            (9.84, 30.23, 1.93),
        ],
        0.093,
        silver,
    )
    hose(
        g,
        [
            (x, 33.45, 2.35),
            (6.29, 33.44, 1.91),
            (6.38, 33.28, 1.42),
            (6.22, 33.10, 0.71),
        ],
        0.071,
        m["hose"],
        cream,
    )
    hose(
        g,
        [
            (x, 29.38, 2.70),
            (6.29, 29.54, 2.28),
            (6.46, 29.83, 1.99),
            (6.61, 30.30, 2.12),
            (6.67, 30.75, 2.15),
            (6.67, 31.07, 1.86),
        ],
        0.071,
        m["hoseGray"],
        gray,
    )
    finish(g)

    # A single-sided soffit gives the indoor camera a ceiling and keeps the plan readable from above.
    g = part("Unterzüge und Leuchtstoffröhren")
    for x in (3.04, 5.38, 7.72, 10.06, 12.40, 14.74):
        g.box(x, 29.15, 3.83, x + 0.21, 34.61, roof, wall)
    for v in (30.42, 33.54):
        for x in (3.10, 5.55, 8.0, 10.45, 12.90):
            for dx in (0.18, 1.90):
                g.pipe([(x + dx, v, 3.76), (x + dx, v, roof)], 0.006, silver)
            g.box(x, v - 0.047, 3.70, x + 2.08, v + 0.047, 3.76, gray)
            g.box(x + 0.03, v - 0.028, 3.689, x + 2.05, v + 0.028, 3.70, m["light"])
    g.box(7.89, 31.70, 3.38, 8.57, 32.23, 3.80, gray)
    for i in range(6):
        g.box(7.895, 31.71 + i * 0.078, 3.37, 8.56, 31.745 + i * 0.078, 3.38, steel)
    finish(g)["workshopOverhead"] = True
    g = part("Deckenuntersicht")
    g.solid(
        [
            (front, 29.10, roof),
            (front, 34.82, roof),
            (15.28, 34.61, roof),
            (15.18, 28.96, roof),
        ],
        [(0, 1, 2, 3)],
        [m["soffit"]],
    )
    finish(g)["soffit"] = True
    bake(objects)


def sack(g, x, y, z, radius, height, mat):
    rings = [
        (0, 0.74),
        (0.12, 0.97),
        (0.41, 1.04),
        (0.76, 0.98),
        (0.91, 0.78),
        (1, 0.25),
    ]
    sides = 11
    pts = []
    for j, (dz, r) in enumerate(rings):
        for i in range(sides):
            a = i * math.tau / sides
            radius_i = radius * r * (1 + 0.07 * math.sin(3 * a + j))
            pts.append(
                (
                    x + radius_i * math.cos(a),
                    y + radius_i * math.sin(a),
                    z + height * dz + 0.015 * math.sin(4 * a + j),
                )
            )
    faces = [
        (
            i * sides + k,
            i * sides + (k + 1) % sides,
            (i + 1) * sides + (k + 1) % sides,
            (i + 1) * sides + k,
        )
        for i in range(len(rings) - 1)
        for k in range(sides)
    ]
    faces.append(tuple(range(len(pts) - sides, len(pts))))
    g.solid(pts, faces, [mat] * len(faces))
