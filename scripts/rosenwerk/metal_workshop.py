"""Metal shop. From the loading door, u increases into the shop and v to the left."""

import math
import random

import bpy
from mathutils import Vector


def wheel(g, center, radius, yaw, tire, rim, spokes=True, rubber=0.025):
    """Wheel plane runs along heading and vertical. Hub and laced spokes have depth."""
    c = Vector(center)
    h = Vector((math.cos(yaw), math.sin(yaw), 0))
    axle = Vector((-h.y, h.x, 0))
    vertical = Vector((0, 0, 1))
    directions = [
        h * math.cos(math.tau * j / 32) + vertical * math.sin(math.tau * j / 32)
        for j in range(32)
    ]

    def torus(r, thickness, finish):
        vertices = [
            c
            + d * (r + thickness * math.cos(k * math.tau / 6))
            + axle * thickness * math.sin(k * math.tau / 6)
            for d in directions
            for k in range(6)
        ]
        faces = [
            (
                j * 6 + k,
                j * 6 + (k + 1) % 6,
                ((j + 1) % 32) * 6 + (k + 1) % 6,
                ((j + 1) % 32) * 6 + k,
            )
            for j in range(32)
            for k in range(6)
        ]
        g.solid(vertices, faces, [finish] * len(faces))

    torus(radius - rubber, rubber, tire)
    if not spokes:
        return
    r = radius - rubber * 1.85
    torus(r, 0.009, rim)
    g.pipe([c - axle * 0.047, c + axle * 0.047], 0.022, rim)
    for j in range(0, 32, 2):
        foot = (
            c + axle * (0.035 if j % 4 else -0.035) + directions[(j + 4) % 32] * 0.017
        )
        tip = c + directions[j] * r
        side = (tip - foot).cross(axle).normalized() * 0.0028
        g.solid(
            [foot - side, foot + side, tip + side, tip - side],
            [(0, 1, 2, 3)],
            [rim],
        )


def load_details(material, atlas_path):
    print_mat = material(
        "Metallwerkstatt | Werkzeugtafel, Tabelle, Flagge und Stahl", "ffffff"
    )
    texture = print_mat.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(atlas_path))
    texture.image.pack()
    print_mat.node_tree.links.new(
        texture.outputs["Color"],
        print_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"],
    )
    return print_mat


def build_workshop(Part, site, local, m, material, print_mat, bench, round_top, bake):
    spec = site["metalWorkshop"]
    rid = site["interiors"]["Metallwerkstatt"]
    wall, wood, ply, silver, steel, black, gray = (
        m[k] for k in ("white", "wood", "ply", "galv", "steel", "boxpaint", "frame")
    )
    blue, yellow = m["cobalt"], m["yellow"]
    rubber = material("Metallwerkstatt | Reifen und Griffe", "242629", 0, 0.9)
    orange = material("Metallwerkstatt | Signalorange", "d97524", 0.08, 0.55)
    olive = material("Metallwerkstatt | Maschinenlack oliv", "727c57", 0.16, 0.58)
    red = material("Metallwerkstatt | rote Stapelkisten", "ae4439")
    ash = material("Metallwerkstatt | graue Euroboxen", "828889")
    darkwood = material("Metallwerkstatt | Regalwangen", "68503e")
    pink = material("Metallwerkstatt | Tafelrahmen", "b33f6b")
    rng = random.Random(3022)
    floor, roof = 0.333, 4.02
    front = spec["dockWallU"]
    objects = []

    def part(name):
        return Part("Metallwerkstatt | " + name, rid, "interior")

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

    def decal(g, vertices, tile, start=0, end=1):
        # Corners are bottom-left, bottom-right, top-right, top-left as seen by the visitor.
        x, y = tile
        a, b = (x + 0.002 + 0.496 * start), (x + 0.002 + 0.496 * end)
        y = 0.5 + y * 0.5
        g.edge_uvs[len(g.faces)] = [
            (a, y + 0.002),
            (b, y + 0.002),
            (b, y + 0.248),
            (a, y + 0.248),
        ]
        g.solid(vertices, [(0, 1, 2, 3)], [print_mat])

    def shelf(g, u, v, length, depth, levels, post):
        for x in (u, u + length - 0.045):
            for y in (v, v + depth - 0.045):
                g.box(x, y, floor, x + 0.045, y + 0.045, levels[-1] + 0.10, post)
        for h in levels:
            g.box(u, v, h - 0.055, u + length, v + depth, h, wood)
            g.box(
                u, v + depth - 0.035, h - 0.081, u + length, v + depth, h - 0.025, post
            )

    def crate(g, x, y, z, w, d, h, paint):
        # Raised rim, open handhold and external stiffening ribs on the aisle side.
        g.box(x, y, z, x + w, y + d, z + h, paint)
        g.box(
            x - 0.008,
            y - 0.008,
            z + h - 0.033,
            x + w + 0.008,
            y + d + 0.008,
            z + h + 0.006,
            paint,
        )
        for t in (0.07, 0.93):
            g.box(
                x + w * t - 0.009,
                y + d,
                z + 0.021,
                x + w * t + 0.009,
                y + d + 0.01,
                z + h - 0.027,
                paint,
            )
        g.box(
            x + w * 0.32,
            y + d + 0.001,
            z + h * 0.66,
            x + w * 0.68,
            y + d + 0.009,
            z + h * 0.82,
            black,
        )

    def press(g, x, y, base, height, paint):
        g.box(x - 0.23, y - 0.23, base, x + 0.23, y + 0.20, base + 0.07, steel)
        round_top(g, x + 0.12, y + 0.06, 0.055, base + 0.06, height - 0.21, silver)
        g.box(x - 0.18, y - 0.17, base + 0.27, x + 0.20, y + 0.17, base + 0.32, gray)
        g.box(
            x - 0.22,
            y - 0.15,
            base + height - 0.34,
            x + 0.23,
            y + 0.14,
            base + height - 0.09,
            paint,
        )
        round_top(g, x + 0.10, y + 0.01, 0.106, base + height - 0.09, 0.15, paint)
        round_top(g, x - 0.11, y - 0.01, 0.052, base + height - 0.42, 0.085, steel)
        round_top(g, x - 0.11, y - 0.01, 0.011, base + height - 0.50, 0.09, silver)
        for dz in (-0.12, 0.12):
            g.pipe(
                [
                    (x - 0.04, y - 0.16, base + height - 0.22),
                    (x - 0.04 + dz, y - 0.26, base + height - 0.22 + dz),
                ],
                0.012,
                silver,
            )

        for i in range(7):
            round_top(
                g,
                x + 0.10,
                y + 0.01,
                0.107,
                base + height - 0.078 + i * 0.014,
                0.006,
                steel,
            )
        for dz, button in ((0.12, black), (0.18, red)):
            g.pipe(
                [
                    (x - 0.22, y + 0.06, base + height - dz),
                    (x - 0.235, y + 0.06, base + height - dz),
                ],
                0.017,
                button,
            )
        if paint == m["mustard"]:
            decal(
                g,
                [
                    (x - 0.222, y + 0.135, base + height - 0.335),
                    (x - 0.222, y - 0.14, base + height - 0.335),
                    (x - 0.222, y - 0.14, base + height - 0.094),
                    (x - 0.222, y + 0.135, base + height - 0.094),
                ],
                (0.5, -1),
                0,
                0.5,
            )

    def vice(g, x, y, z):
        g.box(x - 0.16, y - 0.105, z, x + 0.17, y + 0.105, z + 0.075, steel)
        for dy in (-0.09, 0.045):
            g.box(
                x - 0.12, y + dy, z + 0.066, x + 0.12, y + dy + 0.055, z + 0.16, olive
            )
            g.box(x - 0.12, y + dy, z + 0.15, x + 0.12, y + dy + 0.055, z + 0.17, gray)
        g.pipe([(x, y - 0.18, z + 0.095), (x, y + 0.09, z + 0.095)], 0.027, silver)
        g.pipe(
            [(x - 0.068, y - 0.195, z + 0.02), (x + 0.07, y - 0.195, z + 0.18)],
            0.012,
            silver,
        )

    corners = [
        local(p) + Vector((spec["inventoryOffsetU"], 0))
        for p in spec["inventoryCorners"]
    ]
    corners[0].x = corners[1].x = front
    g = part("Estrich, Seitenwände und Rückwand")
    g.prism(corners, floor - 0.048, floor, m["screed"])
    for a, b in zip(corners[1:], corners[2:] + corners[:1]):
        g.bar(a, b, 0.095, floor, roof, wall)
    for x in (5.83, 9.95, 14.0):
        for y in (22.35, 28.69):
            g.box(x, y, floor, x + 0.22, y + 0.20, roof, wall)
        g.bar((x, 22.52), (x, 28.65), 0.012, floor, floor + 0.002, m["sill"])
    g.bar((2.60, 25.90), (15.08, 25.71), 0.01, floor, floor + 0.002, m["sill"])
    finish(g)

    g = part("Betonrippen, Querleitungen und Lichtbänder")
    for v in (22.58, 23.40, 24.21, 25.02, 25.83, 26.64, 27.45, 28.26):
        # Tapered concrete webs cast the long shadows seen from the door.
        profile = [
            (v - 0.115, roof),
            (v - 0.068, roof - 0.22),
            (v + 0.068, roof - 0.22),
            (v + 0.115, roof),
        ]
        verts = [(x, y, z) for x in (front, 15.2) for y, z in profile]
        faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (0, 3, 2, 1), (4, 5, 6, 7)]
        g.solid(verts, faces, [m["soffit"]] * len(faces))
    for x in (5.85, 9.95, 14.0):
        g.box(x, 22.23, 3.65, x + 0.24, 28.90, roof, m["soffit"])
        for z in (3.74, 3.83):
            g.pipe([(x - 0.035, 22.34, z), (x - 0.035, 28.72, z)], 0.027, silver)
    for v in (23.64, 27.57):
        for x in (2.85, 5.27, 7.69, 10.11, 12.53):
            for dx in (0.12, 2.15):
                g.pipe([(x + dx, v, 3.52), (x + dx, v, 3.98)], 0.006, steel)
            g.box(x, v - 0.05, 3.51, x + 2.29, v + 0.05, 3.58, gray)
            g.box(x + 0.025, v - 0.024, 3.495, x + 2.265, v + 0.024, 3.514, m["light"])
    finish(g)["workshopOverhead"] = True
    g = part("Deckenuntersicht")
    g.solid([(*p, roof) for p in reversed(corners)], [(0, 1, 2, 3)], [m["soffit"]])
    finish(g)["soffit"] = True

    # Entrance on the left: slotted welding table and the drill in front of the tire rack.
    g, x, y = machine("bench")
    for j in range(7):
        a = x - 1.30 + j * 0.375
        g.box(a, y - 0.39, 1.12, a + 0.349, y + 0.40, 1.19, steel)
        decal(
            g,
            [
                (a, y - 0.39, 1.191),
                (a + 0.349, y - 0.39, 1.191),
                (a + 0.349, y + 0.40, 1.191),
                (a, y + 0.40, 1.191),
            ],
            (0.5, 0),
        )
    for a in (x - 1.30, x + 0.02, x + 1.26):
        for b in (y - 0.37, y + 0.34):
            g.box(a, b, floor, a + 0.044, b + 0.044, 1.12, steel)
    for z in (0.46, 0.79):
        g.box(x - 1.30, y - 0.38, z, x + 1.29, y + 0.39, z + 0.045, steel)
    for j, mat in enumerate((ash, red, wood, wood)):
        g.box(
            x - 1.24 + j * 0.62,
            y - 0.36,
            0.52,
            x - 0.69 + j * 0.62,
            y + 0.36,
            0.78,
            mat,
        )
    vice(g, x - 1.03, y - 0.25, 1.19)
    finish(g)
    g = part("Werkzeugwand und Reifengestell mit Tabellen")
    g.box(3.76, 28.83, 1.38, 5.90, 28.9, 2.34, blue)
    decal(
        g,
        [
            (3.76, 28.819, 1.38),
            (5.90, 28.819, 1.38),
            (5.90, 28.819, 2.34),
            (3.76, 28.819, 2.34),
        ],
        (0, 0.5),
    )
    shelf(g, 6.65, 26.48, 1.15, 1.96, (0.56, 1.28, 2.19, 2.74), steel)
    for j in range(16):
        y = 26.62 + j * 0.108
        wheel(g, (7.02, y, 3.047), 0.306, 0.11, rubber, silver, False, 0.033)
    g.box(6.61, 26.52, 1.22, 6.655, 28.28, 2.54, pink)
    decal(
        g,
        [
            (6.60, 28.24, 1.26),
            (6.60, 26.56, 1.26),
            (6.60, 26.56, 2.49),
            (6.60, 28.24, 2.49),
        ],
        (0.5, 0.5),
    )
    finish(g)
    g, x, y = machine("drill")
    bench(g, x - 0.35, y - 0.32, 0.70, 0.64, 1.05, wood)
    for j in range(5):
        z = 0.43 + j * 0.105
        g.box(x - 0.32, y - 0.28, z, x + 0.32, y + 0.28, z + 0.097, darkwood)
        g.box(x - 0.331, y - 0.25, z + 0.008, x - 0.319, y + 0.25, z + 0.09, yellow)
        g.bar(
            (x - 0.344, y - 0.07),
            (x - 0.344, y + 0.07),
            0.018,
            z + 0.044,
            z + 0.059,
            silver,
        )
    press(g, x, y, 1.05, 0.88, olive)
    finish(g)
    g, x, y = machine("vacuum")
    round_top(g, x, y, 0.19, floor + 0.035, 0.30, yellow)
    round_top(g, x, y, 0.19, floor + 0.305, 0.055, rubber)
    round_top(g, x, y, 0.163, floor + 0.36, 0.095, yellow)
    g.pipe(
        [
            (x - 0.07, y, floor + 0.43),
            (x - 0.065, y, floor + 0.52),
            (x + 0.08, y, floor + 0.52),
            (x + 0.08, y, floor + 0.43),
        ],
        0.017,
        black,
    )
    path = [(x + 0.15, y, floor + 0.20), (x + 0.27, y - 0.09, floor + 0.04)]
    path.extend(
        (
            x + 0.51 + 0.23 * math.cos(t * 0.23 + 3),
            y - 0.02 + 0.21 * math.sin(t * 0.23 + 3),
            floor + 0.03 + 0.001 * t,
        )
        for t in range(35)
    )
    g.pipe(path, 0.023, rubber)
    finish(g)

    # By the door on the right: boxes and sheet goods, blue lifting mast, then lockers and ladder.
    g = part("Eingangslager mit Euroboxen und Blechtafeln")
    shelf(g, 2.95, 22.72, 0.96, 1.05, (0.54, 1.22, 1.97, 2.78), blue)
    for i in range(4):
        g.box(
            3.00 + 0.035 * i,
            22.86,
            floor,
            3.03 + 0.035 * i,
            23.71,
            2.14 + 0.12 * (i % 3),
            silver if i % 2 else darkwood,
        )
    for j in range(3):
        crate(g, 3.25, 22.9, 0.56 + j * 0.34, 0.49, 0.50, 0.33, wood)
    shelf(g, 3.14, 23.48, 1.14, 0.53, (0.52, 1.07, 1.56, 2.11), yellow)
    for j in range(4):
        crate(g, 3.25, 23.83, floor + j * 0.26, 0.58, 0.45, 0.245, ash)
    crate(g, 3.30, 23.88, floor + 1.04, 0.49, 0.34, 0.25, orange)
    finish(g)
    g, x, y = machine("stacker")
    for dv in (-0.27, 0.27):
        v = y + dv
        g.box(x - 0.72, v - 0.05, 0.429, x + 0.32, v + 0.05, 0.487, blue)
        for dx in (-0.63, 0.25):
            g.pipe(
                [(x + dx, v - 0.045, 0.403), (x + dx, v + 0.045, 0.403)], 0.071, rubber
            )
        g.box(x - 0.08, v - 0.038, 0.44, x + 0.01, v + 0.038, 2.32, blue)
        g.box(x - 0.15, v - 0.025, 0.48, x - 0.095, v + 0.025, 2.25, silver)
        g.box(x - 0.94, v - 0.042, 0.52, x - 0.08, v + 0.042, 0.566, steel)
    for z in (0.69, 2.28):
        g.box(x - 0.09, y - 0.31, z, x + 0.01, y + 0.31, z + 0.055, blue)
    for i in range(12):
        z = 0.98 + 0.10 * i
        g.bar((x - 0.03, y - 0.24), (x - 0.03, y + 0.24), 0.008, z, z + 0.008, steel)
    g.pipe(
        [
            (x + 0.02, y - 0.26, 0.72),
            (x + 0.31, y - 0.26, 1.31),
            (x + 0.30, y - 0.26, 1.40),
            (x + 0.05, y - 0.26, 1.40),
        ],
        0.020,
        blue,
    )
    finish(g)
    g = part("Spindnische, Radio und hoher Stahlschrank")
    for i in range(4):
        for j in range(4):
            x = 4.65 + i * 0.36
            z = 0.47 + j * 0.35
            g.box(x, 22.45, z, x + 0.353, 22.95, z + 0.342, gray)
            g.pipe(
                [(x + 0.31, 22.95, z + 0.18), (x + 0.31, 22.973, z + 0.18)],
                0.013,
                steel,
            )
    for x in (4.72, 5.50, 5.81):
        g.box(x, 22.51, 1.88, x + 0.23, 22.80, 2.17, black)
    g.box(6.62, 22.77, 0.45, 7.68, 23.66, 2.50, gray)
    for j in range(2):
        x = 6.64 + j * 0.516
        g.box(x, 23.66, 0.50, x + 0.50, 23.685, 2.45, gray)
        hx = x + (0.43 if j == 0 else 0.066)
        g.pipe(
            [
                (hx, 23.685, 1.24),
                (hx, 23.728, 1.25),
                (hx, 23.728, 1.42),
                (hx, 23.685, 1.43),
            ],
            0.012,
            steel,
        )
    g.box(6.85, 22.89, 2.50, 7.34, 23.40, 2.80, ash)
    finish(g)
    g, x, y = machine("ladder")
    for dx in (-0.21, 0.21):
        g.pipe(
            [(x + dx, y + 0.16, floor + 0.02), (x + dx, y - 0.45, 2.52)], 0.028, silver
        )
        g.box(
            x + dx - 0.04, y + 0.12, floor, x + dx + 0.04, y + 0.20, floor + 0.05, red
        )
    for j in range(8):
        t = 0.09 + j * 0.119
        yy = y + 0.16 - 0.61 * t
        z = floor + 0.02 + t * (2.50 - floor)
        g.bar((x - 0.20, yy), (x + 0.20, yy), 0.045, z, z + 0.037, silver)
    finish(g)

    # The lathe's bed runs lengthwise along the left wall. The folder stands across it.
    g, x, y = machine("lathe")
    for dx in (-0.66, 0.55):
        g.box(x + dx, y - 0.29, floor, x + dx + 0.29, y + 0.29, 1.03, olive)
    g.box(x - 0.79, y - 0.32, 0.98, x + 0.91, y + 0.31, 1.14, olive)
    for dy in (-0.12, 0.12):
        g.box(x - 0.47, y + dy, 1.14, x + 0.86, y + dy + 0.05, 1.21, silver)
    g.box(x - 0.76, y - 0.23, 1.13, x - 0.34, y + 0.22, 1.57, olive)
    g.pipe([(x - 0.34, y, 1.38), (x - 0.22, y, 1.38)], 0.118, steel)
    for k in range(3):
        a = k * math.tau / 3
        g.pipe(
            [
                (x - 0.22, y + 0.04 * math.cos(a), 1.38 + 0.04 * math.sin(a)),
                (x - 0.22, y + 0.116 * math.cos(a), 1.38 + 0.116 * math.sin(a)),
            ],
            0.017,
            silver,
        )
    g.box(x - 0.03, y - 0.25, 1.18, x + 0.28, y + 0.16, 1.28, steel)
    g.box(x + 0.05, y - 0.14, 1.28, x + 0.19, y + 0.03, 1.38, olive)
    g.box(x + 0.53, y - 0.14, 1.19, x + 0.78, y + 0.14, 1.44, olive)
    g.pipe([(x + 0.43, y, 1.38), (x + 0.82, y, 1.38)], 0.049, silver)
    wheel(g, (x + 0.14, y - 0.27, 1.13), 0.092, 0, black, silver, True, 0.010)
    finish(g)
    g, x, y = machine("folder")
    for dv in (-0.58, 0.58):
        g.slope(
            (x - 0.30, y + dv),
            (x, y + dv),
            0.054,
            floor + 0.043,
            1.09,
            0.043,
            m["green"],
        )
        g.slope(
            (x + 0.28, y + dv),
            (x, y + dv),
            0.054,
            floor + 0.043,
            1.09,
            0.043,
            m["green"],
        )
    g.box(x - 0.22, y - 0.65, 0.94, x + 0.20, y + 0.65, 1.08, m["green"])
    g.box(x - 0.21, y - 0.64, 1.08, x - 0.15, y + 0.64, 1.29, m["green"])
    g.pipe([(x, y - 0.66, 1.12), (x, y + 0.66, 1.12)], 0.038, silver)
    finish(g)

    g = part("Abgedeckter Wagen und Rollenhalter an der Drehbank")
    crate(g, 9.03, 26.97, floor + 0.06, 0.73, 0.59, 0.42, m["green"])
    # Six folded strips follow the raised centre of the cover.
    heights = [1.40, 1.53, 1.63, 1.55, 1.48, 1.50, 1.36]
    for j in range(6):
        a, b = j / 6, (j + 1) / 6

        def fold(t, h):
            x = 8.89 + t * 1.06
            return [
                (x, 26.78 + 0.045 * math.cos(t * math.pi * 6), 0.50 + 0.22 * t),
                (x, 26.98, h - 0.06),
                (x, 27.31, h),
                (x, 27.54, h - 0.20),
                (x, 27.62, 0.64),
            ]

        left, right = fold(a, heights[j]), fold(b, heights[j + 1])
        for k in range(4):
            decal(g, [left[k], right[k], right[k + 1], left[k + 1]], (0.5, -0.5), a, b)
    g.pipe(
        [
            (8.16, 28.80, 1.99),
            (8.16, 28.64, 1.99),
            (8.94, 28.64, 1.99),
            (8.94, 28.80, 1.99),
        ],
        0.019,
        steel,
    )
    for i in range(6):
        g.pipe(
            [(8.19 + 0.073 * i, 28.64, 1.99), (8.24 + 0.073 * i, 28.64, 1.99)],
            0.095,
            rubber,
        )
    g.box(8.67, 28.63, 1.66, 8.85, 28.64, 1.99, ash)
    finish(g)

    g = part("Hochboden, Stufenregal und Fahrradteile")
    shelf(g, 10.32, 27.46, 4.47, 1.13, (0.65, 1.28, 2.38), wood)
    for j in range(5):
        x = 10.45 + j * 0.39
        for k in range(min(j + 1, 3)):
            z = floor + k * 0.36
            for a in (x, x + 0.37):
                g.box(a, 26.99, z, a + 0.029, 27.53, z + 0.35, darkwood)
            g.box(x, 26.99, z + 0.33, x + 0.40, 27.53, z + 0.36, ply)
    for j in range(11):
        x = 10.68 + 0.37 * j
        wheel(g, (x, 28.02, 2.72), 0.34, 0.96, rubber, silver, j % 3 == 0)
    for x in (10.4, 12.45, 14.70):
        g.pipe([(x, 27.48, 2.13), (x + 0.32, 27.48, 2.39)], 0.045, wood)
    bench(g, 13.86, 25.22, 1.06, 1.36, 1.15, wood)
    vice(g, 14.11, 25.48, 1.15)
    for y in (25.67, 26.19):
        g.box(14.82, y, 1.53, 15.08, y + 0.49, 2.17, wood)
    for x, z, paint in (
        (10.58, 0.66, ash),
        (11.23, 1.29, black),
        (13.15, 0.66, olive),
        (13.95, 1.29, ash),
    ):
        crate(g, x, 27.60, z, 0.61, 0.53, 0.24, paint)
    for u in (11.25, 11.72, 12.17, 12.66):
        wheel(g, (u, 28.12, 1.67), 0.36, 0.87, rubber, silver, True)
    for y in (25.80, 26.32):
        g.box(14.815, y, 1.76, 14.79, y + 0.18, 1.88, gray)
    g.box(14.96, 24.90, 1.38, 15.05, 25.60, 2.21, darkwood)
    decal(
        g,
        [
            (14.95, 25.59, 1.40),
            (14.95, 24.91, 1.40),
            (14.95, 24.91, 2.20),
            (14.95, 25.59, 2.20),
        ],
        (0.5, -1),
        0.5,
        1,
    )
    # Cloth sags between the two fixing points, with its actual skull-and-crossbones print.
    for j in range(12):

        def cloth(t, top):
            return (
                15.035
                - 0.05 * math.sin(t * math.pi)
                - 0.018 * math.sin(t * math.pi * 5),
                26.52 - t * 1.48,
                (3.01 if top else 2.32) - 0.17 * math.sin(t * math.pi),
            )

        a, b = j / 12, (j + 1) / 12
        decal(
            g,
            [cloth(a, False), cloth(b, False), cloth(b, True), cloth(a, True)],
            (0, 0),
            a,
            b,
        )
    finish(g)
    g, x, y = machine("rearDrill")
    bench(g, x - 0.32, y - 0.28, 0.64, 0.55, 1.11, steel)
    press(g, x, y, 1.11, 0.95, m["mustard"])
    finish(g)

    # Right-hand storage. Tube ends face the entrance; drawers and bench tools face the aisle.
    g = part("Blaues Langgutregal, Kleinteileschubladen und Schleifbock")
    shelf(g, 7.96, 22.38, 3.40, 0.83, (0.56, 1.05, 1.78, 2.22, 2.66, 3.07), blue)
    for j in range(3):
        for k in range(6):
            r = (0.063, 0.045, 0.095, 0.053, 0.034, 0.074)[k]
            v = 22.46 + k * 0.124
            z = (2.22, 2.66, 3.07)[j] + r
            start = 7.88 + rng.uniform(-0.13, 0.16)
            end = 11.06 + rng.uniform(-0.2, 0.24)
            g.pipe([(start, v, z), (end, v, z)], r, silver if k % 3 else darkwood)
            # A shaded bore and a bright cut rim, recessed behind the open end.
            g.pipe([(start, v, z), (start + 0.023, v, z)], r + 0.003, gray)
            g.pipe(
                [(start + 0.004, v, z), (start + 0.20, v, z)],
                max(0.015, r - 0.007),
                steel,
            )
    for j in range(7):
        for k in range(5):
            x = 8.22 + j * 0.396
            z = 1.07 + k * 0.137
            g.box(x, 22.84, z, x + 0.379, 23.18, z + 0.128, ash)
            g.box(x + 0.11, 23.179, z + 0.05, x + 0.28, 23.193, z + 0.085, gray)
            g.bar(
                (x + 0.13, 23.197),
                (x + 0.25, 23.197),
                0.014,
                z + 0.093,
                z + 0.106,
                black,
            )
    for i in range(3):
        x = 8.17 + i * 0.94
        decal(
            g,
            [
                (x + 0.92, 23.218, 1.08),
                (x, 23.218, 1.08),
                (x, 23.218, 1.75),
                (x + 0.92, 23.218, 1.75),
            ],
            (0, -1),
        )
    bench(g, 8.05, 23.29, 2.21, 0.60, 1.12, wood)
    for x in (8.49, 9.66):
        g.box(x - 0.21, 23.39, 1.12, x + 0.21, 23.75, 1.18, olive)
        g.pipe([(x - 0.23, 23.56, 1.35), (x + 0.23, 23.56, 1.35)], 0.114, olive)
        for dx in (-0.22, 0.21):
            wheel(
                g, (x + dx, 23.56, 1.35), 0.157, math.pi / 2, steel, steel, False, 0.067
            )
            g.box(x + dx - 0.045, 23.58, 1.22, x + dx + 0.065, 23.75, 1.26, gray)
    # The front end bay stores standing bars and sheet offcuts.
    for i in range(9):
        x = 7.80 + i * 0.048
        g.slope(
            (x, 22.96),
            (x + 0.10, 22.68),
            0.10 + i % 3 * 0.053,
            floor,
            1.51 + i % 4 * 0.19,
            0.022,
            steel if i % 2 else wood,
        )
    finish(g)
    g = part("Fahrradteile und Werkzeugkoffer in der hinteren Regalreihe")
    palette = (ash, black, wood, red, yellow, olive)
    levels = (0.57, 1.03, 1.49, 1.94, 2.39, 2.83)
    for n in range(3):
        x = 11.43 + n * 1.16
        shelf(g, x, 22.37, 1.14, 0.65, levels, yellow if n % 2 else steel)
        for j, z in enumerate(levels):
            for k in range(2):
                xx = x + 0.06 + k * 0.53
                h = rng.uniform(0.14, 0.31)
                paint = (
                    (red, yellow, ash)[(n + k) % 3] if j == 5 else rng.choice(palette)
                )
                if (n + j + k) % 5 == 0 and j < 5:
                    for l in range(3):
                        g.pipe(
                            [
                                (xx, 22.55 + l * 0.09, z + 0.04),
                                (xx + 0.16, 22.48 + l * 0.09, z + 0.08),
                                (xx + 0.43, 22.63 + l * 0.08, z + 0.04),
                            ],
                            0.022,
                            silver,
                        )
                else:
                    crate(g, xx, 22.53, z, 0.44, 0.46, h, paint)
                    if j < 4 and h < 0.20:
                        g.box(
                            xx + 0.02,
                            22.56,
                            z + h + 0.01,
                            xx + 0.43,
                            22.98,
                            z + h + 0.087,
                            black,
                        )
    finish(g)

    def cycle_frame(g, center, heading, scale, paint, tilt=0):
        h = Vector((math.cos(heading), math.sin(heading), 0))
        z = Vector((0, 0, 1))
        origin = Vector(center)

        def pos(a, b):
            longitudinal = a * math.cos(tilt) - b * math.sin(tilt)
            rise = a * math.sin(tilt) + b * math.cos(tilt)
            return origin + (longitudinal * h + rise * z) * scale

        for a, b in [
            ((0, 0), (0.53, 0.01)),
            ((0, 0), (0.17, 0.40)),
            ((0.17, 0.40), (0.53, 0.01)),
            ((0.17, 0.40), (0.68, 0.42)),
            ((0.53, 0.01), (0.68, 0.42)),
            ((0.68, 0.42), (0.84, 0)),
        ]:
            g.pipe([pos(*a), pos(*b)], 0.018 * scale, paint)

    g = part("Tourenrad und Stapelstühle neben dem Profilregal")
    x, y = 8.08, 24.04
    for dx in (0, 1.03):
        wheel(g, (x + dx, y, floor + 0.337), 0.337, 0, rubber, silver)
    cycle_frame(g, (x, y, floor + 0.337), 0, 1.22, blue)
    g.pipe([(x + 0.21, y, 1.13), (x + 0.19, y, 1.24)], 0.017, silver)
    g.box(x + 0.07, y - 0.068, 1.235, x + 0.29, y + 0.065, 1.275, rubber)
    g.pipe(
        [(x + 0.82, y, 1.19), (x + 0.87, y, 1.31), (x + 0.88, y - 0.20, 1.34)],
        0.016,
        steel,
    )
    for dy in (-0.091, 0.091):
        g.pipe(
            [
                (x, y, 0.68),
                (x - 0.16, y + dy, 1.04),
                (x + 0.19, y + dy, 1.04),
                (x, y, 0.68),
            ],
            0.011,
            steel,
        )
    for j in range(2):
        xx, yy = 7.56 + j * 0.22, 23.84 - j * 0.16
        for dy in (-0.19, 0.19):
            g.pipe(
                [
                    (xx - 0.21, yy + dy, floor),
                    (xx - 0.15, yy + dy, 0.77),
                    (xx + 0.17, yy + dy, 0.77),
                    (xx + 0.25, yy + dy, floor),
                ],
                0.014,
                m["green"],
            )
            g.pipe(
                [(xx + 0.17, yy + dy, 0.76), (xx + 0.24, yy + dy, 1.17)],
                0.013,
                m["green"],
            )
        g.box(xx - 0.21, yy - 0.22, 0.76, xx + 0.19, yy + 0.22, 0.793, ply)
        g.slope((xx + 0.19, yy), (xx + 0.24, yy), 0.43, 0.96, 1.14, 0.029, ply)
    finish(g)
    g = part("Deckenhalter mit Laufrädern und Fahrradrahmen")
    for v in (25.58, 24.66):
        g.pipe([(9.89, v, 3.57), (14.79, v, 3.57)], 0.022, silver)
    for j in range(9):
        x = 10.13 + j * 0.49
        g.pipe(
            [(x, 25.58, 3.59), (x, 25.58, 3.38), (x + 0.04, 25.58, 3.35)], 0.009, steel
        )
        wheel(
            g,
            (x, 25.57, 3.06),
            0.328,
            1.36 + j % 3 * 0.09,
            rubber if j % 3 else silver,
            silver,
            True,
            0.014,
        )
    for j in range(4):
        x = 10.56 + j * 0.95
        # Hung by the head tube, with the remaining rear wheel below the frame.
        center = (x, 24.47, 2.79)
        angle = math.radians(63)
        cycle_frame(g, center, 1.21, 0.99, (gray, steel, blue, gray)[j], angle)
        wheel(g, center, 0.314, 1.21, rubber, silver, True, 0.018)
        hanger = (0.68 * math.cos(angle) - 0.42 * math.sin(angle)) * 0.99
        head = (
            x + math.cos(1.21) * hanger,
            24.47 + math.sin(1.21) * hanger,
            2.79 + (0.68 * math.sin(angle) + 0.42 * math.cos(angle)) * 0.99,
        )
        g.pipe([(x, 24.66, 3.57), head], 0.011, steel)
    finish(g)
    g = part("Transportrad mit orangefarbenem Verdeck")
    # Tricycle points towards the loading door; wheelbase, open rack and canopy are separate.
    x, y = 11.66, 24.96
    for u, v, r in (
        (x - 0.99, y - 0.11, 0.308),
        (x + 0.72, y - 0.455, 0.312),
        (x + 0.72, y + 0.455, 0.312),
    ):
        wheel(
            g, (u, v, floor + r), r, 0.12 if u < x else 0, rubber, silver, True, 0.034
        )
    for dy in (-0.37, 0.37):
        yy = y + dy
        g.pipe(
            [(x - 0.83, yy, 0.70), (x - 0.25, yy, 0.82), (x + 0.91, yy, 0.82)],
            0.030,
            steel,
        )
        g.bar((x - 0.86, yy), (x - 0.20, yy), 0.042, 0.799, 0.834, orange)
        g.pipe(
            [
                (x - 0.20, yy, 0.82),
                (x - 0.19, yy, 2.16),
                (x - 0.11, yy, 2.22),
                (x + 0.89, yy, 2.19),
                (x + 1.00, yy, 2.12),
                (x + 1.00, yy, 0.82),
            ],
            0.030,
            rubber,
        )
    for xx in (x - 0.83, x - 0.19, x + 0.90):
        g.bar((xx, y - 0.37), (xx, y + 0.37), 0.036, 0.69, 0.73, steel)
    # Rectangular stand parked alongside the front fork, as in IMG_2977.
    for xx in (x - 0.94, x - 0.26):
        for yy in (y + 0.10, y + 0.47):
            g.box(xx, yy, floor, xx + 0.018, yy + 0.018, 0.795, steel)
        g.bar(
            (xx, y + 0.11), (xx, y + 0.48), 0.018, floor + 0.015, floor + 0.035, black
        )
    for yy in (y + 0.11, y + 0.48):
        g.bar((x - 0.94, yy), (x - 0.24, yy), 0.025, 0.78, 0.806, orange)
    crate(g, x - 0.83, y + 0.15, floor + 0.04, 0.35, 0.25, 0.21, gray)
    g.box(x - 0.10, y - 0.37, 0.80, x + 0.97, y + 0.37, 0.86, black)
    g.box(x + 0.32, y - 0.35, 0.93, x + 0.84, y + 0.35, 1.04, orange)
    g.box(x + 0.80, y - 0.35, 1.00, x + 0.88, y + 0.35, 1.59, orange)
    # Canvas wraps the cabin. Front window reveals the bench and the orange lining.
    for dy in (-0.377, 0.377):
        g.box(x - 0.16, y + dy - 0.009, 1.00, x + 0.96, y + dy + 0.009, 2.13, black)
    g.box(x + 0.94, y - 0.37, 1.02, x + 0.97, y + 0.37, 2.14, orange)
    for side in (-0.31, 0.31):
        g.box(x - 0.205, y + side - 0.06, 0.89, x - 0.175, y + side + 0.06, 2.14, black)
    g.box(x - 0.205, y - 0.37, 0.89, x - 0.175, y + 0.37, 1.12, black)
    g.bar((x - 0.21, y - 0.37), (x - 0.21, y + 0.37), 0.028, 0.90, 0.935, silver)
    g.box(x - 0.205, y - 0.37, 1.88, x - 0.175, y + 0.37, 2.14, black)
    g.slope((x - 0.33, y), (x + 1.05, y), 0.88, 2.26, 2.18, 0.034, orange)
    for dy in (-0.421, 0.421):
        g.pipe([(x - 0.33, y + dy, 2.26), (x + 1.05, y + dy, 2.18)], 0.018, rubber)
    g.pipe(
        [
            (x - 0.99, y - 0.11, floor + 0.31),
            (x - 0.79, y - 0.10, 1.04),
            (x - 0.68, y, 1.28),
        ],
        0.031,
        silver,
    )
    g.pipe(
        [
            (x - 0.67, y - 0.24, 1.25),
            (x - 0.72, y - 0.22, 1.31),
            (x - 0.68, y + 0.21, 1.31),
            (x - 0.63, y + 0.25, 1.27),
        ],
        0.017,
        steel,
    )
    g.pipe(
        [
            (x - 0.67, y - 0.22, 1.29),
            (x - 0.87, y - 0.22, 1.05),
            (x - 0.92, y - 0.18, 0.80),
        ],
        0.007,
        rubber,
    )
    finish(g)
    bake(objects)


def build_gate(
    g, leaf, spec, bay_center, half, floor, panel, steel, silver, details, glass_face
):
    """One pedestrian leaf in the otherwise closed steel loading gate."""
    low = spec["doorCenterV"] - spec["doorHalfWidth"]
    high = spec["doorCenterV"] + spec["doorHalfWidth"]
    u = spec["dockWallU"] + 0.16
    head = floor + 2.10

    def pressed_sheet(start, end, bottom, top):
        g.bar(start, end, 0.061, bottom, top, panel)
        direction = (end - start).normalized()
        normal = Vector((-direction.y, direction.x))
        for sign in (-1, 1):
            a = start.lerp(end, 0.045) + normal * 0.032 * sign
            b = start.lerp(end, 0.955) + normal * 0.032 * sign
            if sign > 0:
                a, b = b, a
            g.edge_uvs[len(g.faces)] = [
                (0.002, 0.252),
                (0.498, 0.252),
                (0.498, 0.498),
                (0.002, 0.498),
            ]
            g.solid(
                [
                    (*a, bottom + 0.036),
                    (*b, bottom + 0.036),
                    (*b, top - 0.036),
                    (*a, top - 0.036),
                ],
                [(0, 1, 2, 3)],
                [details],
            )

    edges = [
        bay_center - half + 0.045,
        bay_center - 0.78,
        low,
        high,
        bay_center + half - 0.045,
    ]
    for j, (left, right) in enumerate(zip(edges, edges[1:])):
        a, b = Vector((u, left)), Vector((u, right))
        bottom = head if j == 2 else floor + 0.016
        g.bar(a, b, 0.091, 4.28, 4.41, steel)
        g.bar(a, b, 0.092, bottom, bottom + 0.060, steel)
        if j != 2:
            pressed_sheet(a, b, bottom + 0.045, 2.94)
            g.bar(a, b, 0.085, 2.93, 3.01, panel)
        if j in (0, 3):
            pressed_sheet(a, b, 3.01, 4.29)
        else:
            glass_face(g, a, b, max(3.01, bottom + 0.06), 4.29)
            g.bar(a, b, 0.075, 3.77, 3.80, panel)
        for v in (left, right):
            g.box(u - 0.046, v - 0.022, floor + 0.01, u + 0.046, v + 0.022, 4.40, steel)
    pivot = Vector((u, high - 0.035))
    tip = pivot + Vector((-0.985, -0.17)) * (high - low - 0.066)
    fixed, g = g, leaf
    pressed_sheet(pivot, tip, floor + 0.018, head - 0.018)
    for h in (floor + 0.15, floor + 1.16, head - 0.15):
        g.bar(pivot.lerp(tip, 0.04), pivot.lerp(tip, 0.96), 0.083, h, h + 0.038, steel)
    q = pivot.lerp(tip, 0.84)
    g.pipe(
        [
            (*q, floor + 1.0),
            (q.x, q.y - 0.065, floor + 1.0),
            (q.x + 0.106, q.y - 0.065, floor + 1.0),
        ],
        0.013,
        silver,
    )
    for z in (floor + 0.18, head - 0.29):
        g.pipe([(*pivot, z), (*pivot, z + 0.12)], 0.022, silver)
    front = spec["dockWallU"]
    fixed.box(
        front - 0.07, low, floor - 0.018, front + 0.33, high, floor + 0.005, silver
    )
    return pivot
