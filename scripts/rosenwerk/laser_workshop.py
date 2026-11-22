"""Laserwerkstatt from the inventory footprint and the six November reference views."""

import math

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree
from mathutils import Vector


def bake_contacts(objects):
    """Short-range hemisphere visibility for shelf recesses and furniture contacts."""
    vertices, triangles = [], []
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        offset = len(vertices)
        vertices.extend(v.co.copy() for v in mesh.vertices)
        for tri in mesh.loop_triangles:
            mat = mesh.materials[tri.material_index]
            shader = mat.node_tree.nodes.get("Principled BSDF")
            if shader.inputs["Alpha"].default_value >= 0.95:
                triangles.append(tuple(offset + i for i in tri.vertices))
    tree = BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
    directions = {}
    for obj in objects:
        mesh = obj.data
        attr = mesh.color_attributes.new(
            name="Kontaktschatten", type="BYTE_COLOR", domain="CORNER"
        )
        rgba = np.ones((len(mesh.loops), 4), dtype=np.float32)
        for face in mesh.polygons:
            n = face.normal
            key = tuple(round(v, 3) for v in n)
            if key not in directions:
                u = n.orthogonal().normalized()
                v = n.cross(u)
                rays = []
                for i in range(20):
                    r = math.sqrt((i + 0.5) / 20)
                    phi = i * 2.39996
                    rays.append(
                        u * (r * math.cos(phi))
                        + v * (r * math.sin(phi))
                        + n * math.sqrt(1 - r * r)
                    )
                directions[key] = rays
            for li in face.loop_indices:
                point = (
                    mesh.vertices[mesh.loops[li].vertex_index].co.lerp(
                        face.center, 0.012
                    )
                    + n * 0.0025
                )
                blocked = 0
                for ray in directions[key]:
                    d = tree.ray_cast(point, ray, 1.25)[3]
                    if d is not None:
                        blocked += (1 - d / 1.25) ** 1.2
                rgba[li, :3] = 1 - 0.84 * blocked / 20
        attr.data.foreach_set("color", rgba.ravel())
        mesh.color_attributes.active_color = attr


def build_workshop(Part, site, local, material, finishes, atlas_path, surface_grain):
    name = "Laser- und 3D-Druckwerkstatt"
    rid = site["interiors"][name]
    plan = site["laserWorkshop"]
    ron_open, ron_rear, window_rear, window_open = map(local, plan["corners"])
    along = ((window_open - window_rear) + (ron_open - ron_rear)).normalized()
    inward = Vector((-along.y, along.x))
    length = (window_open - window_rear).dot(along)
    depth = (ron_rear - window_rear).dot(inward)
    door_left, door_right = plan["ronDoor"]

    objects = []

    class WorkshopPart(Part):
        # Origin at the back/window corner. x runs toward screen printing,
        # y toward the RON. Shelf subassemblies use the same axes turned 90°.
        def __init__(self, title, origin=(0, 0), angle=0):
            super().__init__(name + " | " + title, rid, "interior")
            self.origin = window_rear + along * origin[0] + inward * origin[1]
            self.dx = along * math.cos(angle) + inward * math.sin(angle)
            self.dy = inward * math.cos(angle) - along * math.sin(angle)

        def solid(self, verts, faces, mats):
            super().solid(
                [
                    (*(self.origin + self.dx * x + self.dy * y), 0.318 + z)
                    for x, y, z in verts
                ],
                faces,
                mats,
            )

        def finish(self):
            obj = super().finish()
            objects.append(obj)
            return obj

        def panel(self, corner, a, b, mat):
            # Shared grid vertices resolve occlusion below benches and beside shelves.
            p, a, b = Vector(corner), Vector(a), Vector(b)
            nu, nv = math.ceil(a.length / 0.14), math.ceil(b.length / 0.14)
            verts = [
                p + a * (i / nu) + b * (j / nv)
                for j in range(nv + 1)
                for i in range(nu + 1)
            ]
            faces = []
            for j in range(nv):
                for i in range(nu):
                    k = j * (nu + 1) + i
                    faces.append((k, k + 1, k + nu + 2, k + nu + 1))
            self.solid(verts, faces, [mat] * len(faces))

        def decal(self, corners, crop):
            # Bottom left, bottom right, top right, top left, seen from the room.
            l, t, r, b = crop
            self.edge_uvs[len(self.faces)] = [
                (u / 1024, 1 - v / 1024) for u, v in ((l, b), (r, b), (r, t), (l, t))
            ]
            self.solid(corners, [(0, 1, 2, 3)], [printing])

        def disk(self, x, y, z, radius, height, mat):
            self.prism(
                [
                    (
                        x + radius * math.cos(i * math.tau / 24),
                        y + radius * math.sin(i * math.tau / 24),
                    )
                    for i in range(24)
                ],
                z,
                z + height,
                mat,
            )

    white, metal, silver, timber, plywood, grey, blue, red, green, yellow = finishes
    ink = material("Laserei | schwarzer Kunststoff", "34383c", 0.07, 0.43)
    charcoal = material("Laserei | anthrazitfarbene Gehäuse", "4d5356", 0.15, 0.48)
    cream = material("Laserei | Türlack", "d1d2bc", 0.05, 0.54)
    board = material("Laserei | brauner Karton", "b88d61")
    linoleum = material("Laserei | gesprenkeltes Linoleum", "b5a188")
    surface_grain(linoleum, "b5a188", 259, 19, "aggregate")
    cherry = material("Laserei | rote Stapelkisten", "a73a39")
    amber = material("Laserei | Absaugschlauch", "b8a783", 0, 0.74)
    cyan = material("Laserei | Werkzeughalter", "327ba4")
    plum = material("Laserei | violette Folie", "855093")
    light = material("Laserei | Leuchtstoffröhren", "f8f6e9")
    shader = light.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Emission Color"].default_value = (0.89, 0.94, 1, 1)
    shader.inputs["Emission Strength"].default_value = 0.65
    glass = material("Laserei | Acrylglas", "94acb0", 0.03, 0.17)
    glass.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.23
    glass.surface_render_method = "BLENDED"
    smoke = material("Laserei | Rauchglas der Drucker", "384647", 0.04, 0.19)
    smoke.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.43
    smoke.surface_render_method = "BLENDED"
    printing = material("Laserei | Aufdrucke und Aufkleber", "ffffff", 0, 0.68)
    tex = printing.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(atlas_path))
    tex.image.pack()
    printing.node_tree.links.new(
        tex.outputs["Color"],
        printing.node_tree.nodes["Principled BSDF"].inputs["Base Color"],
    )

    def shelf(g, width, levels, height, d=0.65):
        for x in (0, width - 0.035):
            for y in (0, d - 0.035):
                g.box(x, y, 0, x + 0.035, y + 0.012, height, grey)
                g.box(x, y, 0, x + 0.012, y + 0.035, height, grey)
        for h in levels:
            g.box(0, 0, h - 0.045, width, d, h, grey)
            g.box(0, 0.035, h, width, d - 0.025, h + 0.012, plywood)

    def bench(g, x, y, w, d, h, finish):
        g.box(x, y, h - 0.055, x + w, y + d, h, finish)
        for xx in (x + 0.035, x + w - 0.075):
            for yy in (y + 0.035, y + d - 0.075):
                g.box(xx, yy, 0, xx + 0.04, yy + 0.04, h - 0.055, silver)

    def bin_box(g, x, y, z, w, d, h, mat):
        g.box(x, y, z, x + w, y + d, z + h, mat)
        g.box(
            x - 0.008,
            y - 0.012,
            z + h - 0.033,
            x + w + 0.008,
            y + d + 0.008,
            z + h + 0.004,
            mat,
        )
        g.box(
            x + w * 0.32,
            y - 0.014,
            z + h * 0.58,
            x + w * 0.68,
            y - 0.012,
            z + h * 0.77,
            ink,
        )
        g.box(
            x + w * 0.28,
            y - 0.015,
            z + 0.031,
            x + w * 0.73,
            y - 0.012,
            z + 0.055,
            white,
        )
        for xx in (x + 0.04, x + w - 0.045):
            g.box(xx, y - 0.01, z + 0.015, xx + 0.012, y, z + h - 0.025, mat)

    # Full-height room shell. The screen-printing edge has no partition.
    g = WorkshopPart("Linoleum, Stirnwand und RON-Durchgang")
    g.panel((0, 0, 0), (length, 0, 0), (0, depth, 0), linoleum)
    h = 3.17
    g.box(0.13, 0.10, 0, 0.25, depth, h, white)
    g.box(0.25, 0.12, h - 0.23, 0.41, depth, h, white)
    g.panel((0.251, 0.12, 0), (0, depth - 0.12, 0), (0, 0, h), white)
    for a, b in ((0, door_left), (door_right, length)):
        g.panel((a, depth - 0.101, 0), (b - a, 0, 0), (0, 0, h), white)
        g.box(a, depth - 0.10, 0, b, depth + 0.018, h, white)
        g.box(a, depth - 0.114, 0, b, depth - 0.10, 0.077, grey)
    g.box(door_left, depth - 0.10, 2.10, door_right, depth + 0.018, h, white)
    g.panel(
        (door_left, depth - 0.101, 2.10),
        (door_right - door_left, 0, 0),
        (0, 0, h - 2.10),
        white,
    )
    for x in (door_left - 0.04, door_right - 0.012):
        g.box(x, depth - 0.13, 0, x + 0.052, depth + 0.03, 2.12, cream)
    g.box(
        door_left - 0.04,
        depth - 0.131,
        2.07,
        door_right + 0.04,
        depth + 0.03,
        2.13,
        cream,
    )
    g.box(door_left, depth - 0.11, 0.002, door_right, depth + 0.035, 0.012, charcoal)
    # Interlocking two-tone animal silhouettes above the door, traced in simplified form.
    lizard = [
        (0, 0.20),
        (0.12, 0.24),
        (0.20, 0.16),
        (0.24, 0.25),
        (0.32, 0.20),
        (0.29, 0.10),
        (0.38, 0.13),
        (0.45, 0.07),
        (0.37, 0.04),
        (0.29, 0.06),
        (0.27, -0.02),
        (0.33, -0.12),
        (0.23, -0.15),
        (0.17, -0.06),
        (0.10, -0.13),
        (0.03, -0.07),
        (0.07, 0),
        (-0.02, 0.04),
        (-0.11, 0.01),
        (-0.16, 0.06),
        (-0.06, 0.07),
        (0.04, 0.11),
    ]
    for row, count in enumerate((3, 2, 1)):
        for i in range(count):
            x = door_left + 0.02 + i * 0.30 + row * 0.15
            z = 2.29 + row * 0.19
            g.solid(
                [(x + u * 0.67, depth - 0.114, z + v * 0.67) for u, v in lizard],
                [tuple(range(len(lizard)))],
                [ink if (i + row) % 2 == 0 else timber],
            )
    g.finish()

    # Glazing is visible in the cutaway. In the exterior view the recessed facade
    # supplies its own glass and mullions in these same two openings.
    g = WorkshopPart("Fensterband im Schnitt")
    g.box(0, 0.04, 0, length, 0.29, 1.08, white)
    g.box(0, 0.04, 3.06, length, 0.29, h, white)
    for a, b in ((0, 0.37), (3.43, 4.28)):
        g.box(a, 0.04, 1.08, b, 0.29, 3.06, white)
    for a, b in ((0.37, 3.43), (4.28, length)):
        g.box(a, 0.11, 1.055, b, 0.39, 1.085, grey)
        g.solid(
            [(a, 0.17, 1.08), (b, 0.17, 1.08), (b, 0.17, 3.06), (a, 0.17, 3.06)],
            [(3, 2, 1, 0)],
            [glass],
        )
        for x in (a, min(b - 0.045, a + 1.02), b - 0.045):
            g.box(x, 0.13, 1.08, x + 0.045, 0.22, 3.06, white)
        if b - a > 2.6:
            g.box(a + 2.02, 0.13, 1.08, a + 2.07, 0.22, 3.06, white)
        for z in (1.08, 1.70, 3.0):
            g.box(a, 0.13, z, b, 0.22, z + 0.055, white)
    g.finish()["sectionOnly"] = True

    g = WorkshopPart("Fensterfolien und Heizung")
    palette = (cherry, yellow, plum, blue, ink, green)
    for i in range(45):
        x = 0.54 + (i % 15) * 0.188
        z = 2.54 + 0.19 * math.sin(i * 0.65) + (i // 15 - 1) * 0.185
        r = (0.041, 0.071, 0.092, 0.055, 0.11)[i % 5]
        verts = [
            (
                x + r * math.cos(k * math.tau / 6),
                0.224,
                z + r * math.sin(k * math.tau / 6),
            )
            for k in range(6)
        ]
        if i % 4 == 0:
            g.pipe([*verts, verts[0]], 0.006, palette[i % 6])
        else:
            g.solid(verts, [(5, 4, 3, 2, 1, 0)], [palette[(i // 3 + i // 15) % 6]])
    g.box(0.43, 0.26, 0.19, 3.35, 0.36, 0.86, white)
    for i in range(48):
        x = 0.45 + i * 0.060
        g.box(x, 0.35, 0.20, x + 0.022, 0.383, 0.85, white)
    g.finish()
    door = WorkshopPart(
        "Beklebte offene Tür zum RON",
        (door_left + 0.025, depth - 0.12),
        math.radians(-65),
    )
    w = door_right - door_left - 0.055
    door.box(0, -0.020, 0.018, w, 0.020, 2.055, cream)
    door.decal(
        [
            (0.105, -0.022, 0.36),
            (0.70, -0.022, 0.36),
            (0.70, -0.022, 1.77),
            (0.105, -0.022, 1.77),
        ],
        (5, 5, 373, 751),
    )
    door.box(w - 0.12, -0.035, 0.91, w - 0.074, -0.021, 1.10, silver)
    for side in (-1, 1):
        door.pipe(
            [
                (w - 0.097, side * 0.024, 1.035),
                (w - 0.097, side * 0.088, 1.035),
                (w - 0.215, side * 0.088, 1.035),
            ],
            0.013,
            silver,
        )
    obj = door.finish()
    obj["doorPivot"] = list(door.origin)
    obj["doorTurn"], obj["doorOpen"] = 65, True

    g = WorkshopPart("Lasertische, Absaugung und Schneideplatz")
    bench(g, 0.61, 0.54, 2.02, 1.12, 0.80, silver)
    g.box(0.66, 0.59, 0.16, 2.57, 1.60, 0.20, grey)
    for i in range(3):
        bin_box(g, 0.72 + i * 0.60, 0.70, 0.20, 0.53, 0.60, 0.28, grey)
    # Open-profile Lasersaur with working bed, gantry and two clear lid panels.
    g.box(0.65, 0.60, 0.80, 2.59, 1.60, 0.89, charcoal)
    for i in range(29):
        x = 0.72 + i * 0.064
        g.box(x, 0.64, 0.89, x + 0.016, 1.53, 0.922, grey)
    for x in (0.65, 1.61, 2.55):
        for y in (0.59, 1.56):
            g.box(x, y, 0.85, x + 0.042, y + 0.042, 1.18, silver)
        g.box(x, 0.59, 1.155, x + 0.042, 1.60, 1.19, silver)
    for y in (0.59, 1.56):
        g.box(0.65, y, 1.155, 2.59, y + 0.043, 1.19, silver)
        g.box(0.65, y, 0.90, 2.59, y + 0.04, 0.96, silver)
    for a, b in ((0.697, 1.603), (1.659, 2.545)):
        g.solid(
            [
                (a, 0.636, 1.174),
                (b, 0.636, 1.174),
                (b, 1.553, 1.174),
                (a, 1.553, 1.174),
            ],
            [(0, 1, 2, 3)],
            [glass],
        )
        g.box((a + b) / 2 - 0.068, 1.565, 1.19, (a + b) / 2 + 0.068, 1.59, 1.211, ink)
    g.box(1.19, 0.67, 0.997, 1.24, 1.51, 1.035, silver)
    g.box(1.16, 1.12, 0.95, 1.26, 1.21, 1.062, ink)
    g.box(2.30, 0.64, 0.85, 2.69, 0.96, 1.09, grey)
    hose = [
        (2.48, 0.81, 1.09),
        (2.48, 0.80, 1.27),
        (2.51, 0.75, 1.38),
        (2.59, 0.66, 1.42),
        (2.71, 0.54, 1.39),
        (2.82, 0.43, 1.29),
        (2.91, 0.32, 1.17),
        (3.0, 0.20, 1.10),
    ]
    g.pipe(hose, 0.072, amber)
    for a, b in zip(hose, hose[1:]):
        a, b = Vector(a), Vector(b)
        n = max(1, round((b - a).length / 0.026))
        for j in range(n):
            c = a.lerp(b, (j + 0.5) / n)
            t = (b - a).normalized() * 0.005
            g.pipe([c - t, c + t], 0.075, grey)

    bench(g, 3.17, 0.45, 1.15, 0.82, 0.83, grey)
    g.box(3.19, 0.46, 0.83, 4.29, 1.24, 1.07, blue)
    g.box(3.25, 0.53, 1.07, 4.10, 1.18, 1.096, grey)
    g.box(3.32, 0.59, 1.096, 4.01, 1.10, 1.104, charcoal)
    g.box(4.14, 0.66, 1.07, 4.23, 0.82, 1.083, ink)
    g.disk(4.19, 0.91, 1.07, 0.025, 0.026, cherry)
    # The dark flat-file cabinet projects into the open side.
    g.box(4.45, 0.45, 0.045, 5.36, 2.33, 0.89, ink)
    g.box(4.41, 0.41, 0.89, 5.40, 2.37, 0.94, charcoal)
    for j in range(5):
        z = 0.10 + j * 0.145
        g.box(4.44, 2.33, z, 5.36, 2.342, z + 0.129, charcoal)
        g.box(4.73, 2.34, z + 0.088, 5.07, 2.36, z + 0.103, silver)
    g.decal(
        [
            (4.47, 2.28, 0.944),
            (4.47, 1.16, 0.944),
            (5.30, 1.16, 0.944),
            (5.30, 2.28, 0.944),
        ],
        (403, 446, 1016, 808),
    )
    g.box(4.71, 1.66, 0.947, 5.02, 1.91, 0.967, ink)
    g.decal(
        [
            (4.71, 1.91, 0.969),
            (4.71, 1.66, 0.969),
            (5.02, 1.66, 0.969),
            (5.02, 1.91, 0.969),
        ],
        (414, 836, 694, 981),
    )
    g.slope((4.72, 1.785), (4.68, 1.785), 0.255, 0.97, 1.15, 0.009, charcoal)
    g.bar((5.12, 1.48), (5.17, 2.15), 0.028, 0.946, 0.950, silver)
    g.finish()

    g = WorkshopPart("Rechnerplatz, Werkzeugwand und Plattenlager")
    bench(g, 0.29, 1.99, 0.71, 1.78, 0.79, white)
    g.box(0.27, 1.96, 1.04, 0.306, 3.78, 2.26, white)
    g.decal(
        [
            (0.307, 1.96, 1.04),
            (0.307, 3.78, 1.04),
            (0.307, 3.78, 2.26),
            (0.307, 1.96, 2.26),
        ],
        (402, 4, 1018, 430),
    )
    for i in range(16):
        y = 2.09 + (i % 8) * 0.211
        z = 1.35 + (0.0, 0.11, 0.03, 0.18)[i % 4] + (i // 8) * 0.36
        g.box(0.308, y, z, 0.36, y + 0.10, z + 0.042, cyan)
        if i % 3:
            g.pipe(
                [(0.34, y + 0.05, z + 0.035), (0.34, y + 0.06, z + 0.14)], 0.013, silver
            )
            g.pipe(
                [(0.34, y + 0.06, z + 0.14), (0.34, y + 0.065, z + 0.20)],
                0.019,
                ink if i % 2 else red,
            )
    for y in (3.42, 3.64):
        g.pipe([(0.309, y, 2.03), (0.345, y, 2.03)], 0.073, grey)
        g.pipe([(0.345, y, 2.03), (0.349, y, 2.03)], 0.028, cyan)
    g.box(0.43, 2.54, 0.79, 0.73, 2.82, 0.814, charcoal)
    g.box(0.53, 2.65, 0.814, 0.57, 2.71, 0.95, ink)
    g.box(0.51, 2.39, 0.92, 0.555, 2.98, 1.285, ink)
    g.box(0.555, 2.412, 0.943, 0.557, 2.958, 1.262, charcoal)
    g.decal(
        [
            (0.92, 2.45, 0.793),
            (0.92, 2.91, 0.793),
            (0.73, 2.91, 0.793),
            (0.73, 2.45, 0.793),
        ],
        (415, 836, 693, 981),
    )
    bin_box(g, 0.47, 3.30, 0.79, 0.32, 0.27, 0.14, grey)
    # Office chair with a five-star base, soft back and armrests.
    cx, cy = 1.27, 2.71
    for i in range(5):
        a = i * math.tau / 5
        end = (cx + 0.29 * math.cos(a), cy + 0.29 * math.sin(a))
        g.pipe([(cx, cy, 0.14), (*end, 0.063)], 0.024, silver)
        g.disk(*end, 0.018, 0.035, 0.044, ink)
    g.disk(cx, cy, 0.08, 0.05, 0.34, silver)
    g.box(cx - 0.22, cy - 0.24, 0.42, cx + 0.21, cy + 0.24, 0.49, charcoal)
    g.box(cx + 0.16, cy - 0.215, 0.54, cx + 0.225, cy + 0.215, 0.98, ink)
    for y in (cy - 0.245, cy + 0.23):
        g.box(cx - 0.08, y, 0.49, cx - 0.052, y + 0.018, 0.65, silver)
        g.box(cx - 0.14, y - 0.01, 0.64, cx + 0.1, y + 0.025, 0.675, ink)
    for i in range(13):
        y = 3.91 + i * 0.051
        g.slope(
            (0.69, y),
            (0.37, y),
            0.032,
            0.01,
            1.12 + 0.12 * (i % 5),
            0.017,
            plywood if i % 3 else board,
        )
    for z in (0.15, 0.83, 1.50, 2.08):
        g.box(0.31, 4.70, z, 0.96, 5.55, z + 0.038, plywood)
    for y in (4.68, 5.55):
        g.box(0.31, y, 0, 0.97, y + 0.035, 2.19, timber)
    for i in range(11):
        y = 4.76 + 0.066 * i
        g.box(
            0.34,
            y,
            0.87,
            0.87,
            y + 0.036,
            1.12 + (i % 4) * 0.085,
            board if i % 3 else plywood,
        )
    # Bent plywood visitor chair beside the sheet stock.
    for y in (3.88, 4.26):
        for x in (1.01, 1.35):
            g.pipe(
                [(x + 0.045 if x > 1.1 else x - 0.045, y, 0.012), (x, y, 0.44)],
                0.012,
                metal,
            )
    g.slope((1.00, 4.07), (1.39, 4.07), 0.41, 0.42, 0.46, 0.025, plywood)
    g.slope((1.03, 4.07), (0.97, 4.07), 0.40, 0.46, 0.80, 0.023, timber)
    # Paper stacks, tool cups and leads around the two computer stations.
    for j in range(5):
        g.box(
            0.54,
            3.30,
            0.94 + j * 0.012,
            0.79,
            3.51,
            0.949 + j * 0.012,
            white if j % 2 else board,
        )
    g.disk(0.57, 2.20, 0.79, 0.059, 0.11, grey)
    for j in range(4):
        y = 2.165 + j * 0.018
        g.pipe(
            [(0.56, y, 0.88), (0.55 + j * 0.008, y + 0.015, 0.99 + (j % 2) * 0.032)],
            0.006,
            ink,
        )
    g.pipe(
        [
            (0.53, 2.73, 0.95),
            (0.44, 2.75, 0.82),
            (0.34, 2.90, 0.79),
            (0.33, 2.92, 0.70),
            (0.36, 2.96, 0.31),
            (0.42, 3.06, 0.13),
            (0.58, 3.13, 0.06),
        ],
        0.009,
        ink,
    )
    g.box(0.43, 2.05, 0.01, 0.68, 2.40, 0.36, board)
    g.box(0.49, 3.38, 0.01, 0.77, 3.59, 0.49, charcoal)
    for j in range(6):
        size = 0.013 * (j % 3)
        g.box(
            0.48 - size,
            0.35,
            1.087 + j * 0.028,
            0.79 - size,
            0.53,
            1.112 + j * 0.028,
            board,
        )
    g.finish()

    def printer(g, x, y, z, w, d, h):
        # Recessed chamber behind a tinted door, with a plate, toolhead and guide.
        rim = 0.042
        casing = grey if w > 0.6 else charcoal
        g.box(x, y, z, x + w, y + d, z + 0.061, charcoal)
        g.box(x, y + d - 0.045, z + 0.06, x + w, y + d, z + h - 0.04, ink)
        for xx in (x, x + w - rim):
            g.box(xx, y, z + 0.06, xx + rim, y + d, z + h, casing)
        for xx in (x + rim, x + w - rim - 0.012):
            g.box(xx, y + 0.008, z + 0.060, xx + 0.012, y + 0.044, z + h - 0.04, ink)
        for xx in (x + 0.084, x + w - 0.084):
            g.pipe(
                [(xx, y + d - 0.095, z + 0.062), (xx, y + d - 0.095, z + h - 0.065)],
                0.008,
                silver,
            )
        for j in range(11):
            yy = y + 0.08 + j * (d - 0.17) / 11
            g.box(
                x + w - rim - 0.007,
                yy,
                z + 0.078,
                x + w - rim,
                yy + 0.010,
                z + h - 0.09,
                ink,
            )
        g.box(x + 0.05, y + 0.008, z + 0.061, x + w - 0.05, y + 0.040, z + 0.093, ink)
        g.box(
            x + 0.065,
            y + 0.058,
            z + 0.130,
            x + w - 0.065,
            y + d - 0.06,
            z + 0.134,
            board,
        )
        g.box(x, y, z + h - 0.068, x + w, y + d, z + h, charcoal)
        g.box(
            x + 0.06,
            y + 0.054,
            z + 0.11,
            x + w - 0.06,
            y + d - 0.055,
            z + 0.129,
            silver,
        )
        g.box(
            x + 0.046,
            y + d * 0.5,
            z + h * 0.69,
            x + w - 0.046,
            y + d * 0.5 + 0.022,
            z + h * 0.69 + 0.025,
            silver,
        )
        g.box(
            x + w * 0.57,
            y + d * 0.5 - 0.02,
            z + h * 0.69 - 0.04,
            x + w * 0.57 + 0.053,
            y + d * 0.5 + 0.04,
            z + h * 0.69 + 0.03,
            ink,
        )
        g.box(
            x + 0.039,
            y + 0.036,
            z + h - 0.076,
            x + w - 0.039,
            y + 0.047,
            z + h - 0.068,
            light,
        )
        g.solid(
            [
                (x + rim, y + 0.009, z + 0.063),
                (x + w - rim, y + 0.009, z + 0.063),
                (x + w - rim, y + 0.009, z + h - 0.07),
                (x + rim, y + 0.009, z + h - 0.07),
            ],
            [(0, 1, 2, 3)],
            [smoke],
        )
        g.box(
            x + w - 0.07,
            y - 0.012,
            z + h * 0.46,
            x + w - 0.048,
            y + 0.003,
            z + h * 0.60,
            charcoal,
        )
        g.decal(
            [
                (x + 0.026, y - 0.002, z + h - 0.063),
                (x + 0.151, y - 0.002, z + h - 0.063),
                (x + 0.151, y - 0.002, z + h - 0.006),
                (x + 0.026, y - 0.002, z + h - 0.006),
            ],
            (722, 837, 1000, 985),
        )

    def ams(g, x, y, z):
        # Smoky barrel cover around four separate vertical filament reels.
        w, d = 0.46, 0.31
        g.box(x, y, z, x + w, y + d, z + 0.068, charcoal)
        for j, col in enumerate((ink, yellow, cherry, grey)):
            xx = x + 0.034 + j * 0.102
            for a, b, r, m in (
                (0, 0.012, 0.108, charcoal),
                (0.013, 0.078, 0.093, col),
                (0.079, 0.091, 0.108, charcoal),
            ):
                g.pipe(
                    [(xx + a, y + d / 2, z + 0.12), (xx + b, y + d / 2, z + 0.12)], r, m
                )
            xx += 0.091
            for phase in range(5):
                a = phase * math.tau / 5
                g.pipe(
                    [
                        (
                            xx,
                            y + d / 2 + 0.021 * math.cos(a),
                            z + 0.12 + 0.021 * math.sin(a),
                        ),
                        (
                            xx,
                            y + d / 2 + 0.1 * math.cos(a),
                            z + 0.12 + 0.1 * math.sin(a),
                        ),
                    ],
                    0.008,
                    charcoal,
                )
        arc = [
            (
                y + d / 2 - 0.155 * math.cos(i * math.pi / 16),
                z + 0.069 + 0.18 * math.sin(i * math.pi / 16),
            )
            for i in range(17)
        ]
        g.solid(
            [(xx, yy, zz) for xx in (x + 0.008, x + w - 0.008) for yy, zz in arc],
            [(i, i + 1, i + 18, i + 17) for i in range(16)],
            [smoke] * 16,
        )
        for xx in (x + 0.008, x + w - 0.008):
            g.pipe([(xx, yy, zz) for yy, zz in arc], 0.008, charcoal)

    def label(g, x, z, w, crop):
        g.decal(
            [
                (x, -0.005, z),
                (x + w, -0.005, z),
                (x + w, -0.005, z + 0.038),
                (x, -0.005, z + 0.038),
            ],
            crop,
        )

    g = WorkshopPart("Druckregal links · A1 mini, H2D und P1S", (1.12, depth - 0.78))
    shelf(g, 1.67, (0.27, 0.94, 1.68, 2.42), 2.52)
    for x in (0.18, 0.94):
        bin_box(g, x, 0.09, 0.012, 0.52, 0.43, 0.22, grey)
        printer(g, x, 0.08, 0.282, 0.48, 0.48, 0.57)
    printer(g, 0.83, 0.035, 0.952, 0.66, 0.56, 0.67)
    for z in (0.952, 1.226):
        ams(g, 0.17, 0.12, z)
    # A1 mini's single-sided gantry, bed, head and curved feed tube.
    g.box(0.61, 0.12, 1.692, 1.05, 0.53, 1.77, grey)
    g.box(0.65, 0.15, 1.77, 0.94, 0.44, 1.792, charcoal)
    g.box(0.98, 0.43, 1.77, 1.023, 0.475, 2.16, silver)
    g.box(0.61, 0.408, 2.02, 1.023, 0.443, 2.054, silver)
    g.box(0.679, 0.365, 1.96, 0.741, 0.445, 2.077, white)
    g.pipe(
        [
            (0.707, 0.404, 2.068),
            (0.72, 0.42, 2.20),
            (0.84, 0.44, 2.24),
            (0.97, 0.46, 2.22),
            (1.02, 0.48, 2.12),
        ],
        0.008,
        ink,
    )
    for j in range(5):
        g.box(0.07, 0.13, 1.692 + j * 0.081, 0.47, 0.48, 1.77 + j * 0.081, board)
    for j in range(4):
        z = 1.692 + j * 0.154
        g.disk(1.34, 0.34, z, 0.158, 0.011, grey)
        g.disk(1.34, 0.34, z + 0.011, 0.080, 0.130, board)
        g.disk(1.34, 0.34, z + 0.141, 0.158, 0.012, grey)
    for x in (0.10, 0.85):
        bin_box(g, x, 0.06, 2.432, 0.65, 0.48, 0.21, grey)
    label(g, 0.04, 1.638, 0.40, (1, 785, 380, 814))
    label(g, 0.7, 1.638, 0.14, (3, 830, 97, 861))
    label(g, 0.97, 0.898, 0.09, (3, 870, 69, 900))
    label(g, 0.15, 0.228, 0.23, (3, 909, 168, 938))
    g.finish()

    g = WorkshopPart(
        "Druckregal rechts · P2S, AMS und Materialkisten",
        (4.78, depth - 0.15),
        -math.pi / 2,
    )
    shelf(g, 1.50, (0.28, 0.87, 1.76, 2.10, 2.44), 2.66)
    for i, x in enumerate((0.12, 0.82)):
        bin_box(g, x, 0.03, 0.01, 0.55, 0.46, 0.235, cherry)
        g.box(x, 0.12, 0.305, x + 0.52, 0.50, 0.344, plywood)
        printer(g, x + 0.03, 0.08, 0.882, 0.48, 0.48, 0.52)
        ams(g, x + 0.043, 0.14, 1.402)
        for j, z in enumerate((1.772, 2.112, 2.452)):
            bin_box(
                g, x, 0.04, z, 0.54, 0.49, 0.24, cherry if (i + j) % 3 == 0 else grey
            )
        label(g, x, 0.825, 0.23, (3, 948, 168, 977))
    g.finish()

    g = WorkshopPart("Rasterleuchten")
    for y in (1.39, 3.85):
        g.box(0.89, y, 3.04, 4.89, y + 0.24, 3.13, grey)
        g.box(0.91, y + 0.016, 3.026, 4.87, y + 0.224, 3.045, charcoal)
        for yy in (y + 0.062, y + 0.178):
            g.pipe([(0.92, yy, 3.014), (4.85, yy, 3.014)], 0.016, light)
        for i in range(38):
            x = 0.93 + i * 0.105
            g.box(x, y + 0.016, 2.993, x + 0.012, y + 0.224, 3.026, silver)
    g.finish()
    g = WorkshopPart("Deckenuntersicht")
    ceiling = material("Laserei | Deckenuntersicht", "edece7")
    # Indirect bounce above the louvres remains visible on the underside.
    shader = ceiling.node_tree.nodes["Principled BSDF"]
    shader.inputs["Emission Color"].default_value = (0.91, 0.92, 0.94, 1)
    shader.inputs["Emission Strength"].default_value = 0.22
    ceiling.use_backface_culling = True
    g.panel((0, 0, h), (0, depth, 0), (length, 0, 0), ceiling)
    g.finish()["soffit"] = True
    bake_contacts(objects)
