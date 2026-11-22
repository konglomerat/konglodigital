"""Build the Rosenwerk cutaway from the site survey references. Run inside Blender."""

import json
import math
import os
import runpy
import struct
import tempfile
import zlib
from pathlib import Path

import bpy
from mathutils import Matrix, Vector
import numpy as np

root = Path(os.environ.get("ROSENWERK_ROOT", os.getcwd()))
site = json.loads((root / "src/lib/rosenwerk/site.json").read_text())
survey = json.loads((root / "src/lib/rosenwerk/survey.json").read_text())
scene = bpy.data.scenes.new("Rosenwerk | Jagdweg")
bpy.context.window.scene = scene
scene.unit_settings.system = "METRIC"
origin = site["origin"]
building = site["buildings"][0]
scale = math.pi * 6378137 / 180
cos_lat = math.cos(math.radians(origin[1]))


def east_north(point):
    return Vector(
        ((point[0] - origin[0]) * scale * cos_lat, (point[1] - origin[1]) * scale)
    )


# Local drafting axes follow the long factory facades. Blender world axes stay east/north.
anchor = east_north(site["frame"]["anchor"])
axis = Vector((math.cos(math.radians(30)), math.sin(math.radians(30))))
across = Vector((-axis.y, axis.x))


def local(point):
    offset = east_north(point) - anchor
    return Vector((offset.dot(axis), offset.dot(across)))


def world(u, v, h):
    p = anchor + axis * u + across * v
    return (p.x, p.y, h)


def material(name, color, metal=0, roughness=0.83):
    rgb = tuple(int(color[i : i + 2], 16) / 255 for i in (0, 2, 4))
    linear = tuple(
        c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb
    )
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    return mat


plaster = material("Putz | warmgrau", "c5bda9")
concrete = material("Beton | Stützen und Stürze", "ada899")
sill = material("Fensterbank | Zink", "797a73", 0.69, 0.50)
tar = material("Dach | Bitumen", "515456")
roof = material("Dach | verwittertes Blech", "666b6d", 0.14)
pane = material("Glas | graublau", "788e99", 0.06, 0.38)
frame = material("Fensterrahmen | lichtgrau", "bcbcb1", 0.18, 0.49)
steel = material("Stahl | dunkel", "44484a", 0.48, 0.61)
galv = material("Stahl | verzinkt", "a5abb0", 0.76, 0.44)
white = material("Anstrich | gebrochenes Weiß", "dedbd1")
boxpaint = material("KuSS | Anthrazit", "35383c", 0.18)
wood = material("Holz | Werkbankplatte", "af8256")
ply = material("Holz | Sperrholz", "ceaa76")
green = material("Maschinenlack | grün", "4a7864", 0.13)
blue = material("Maschinenlack | petrol", "347984", 0.15)
oxide = material("Boden | rotbraun", "855e50")
tile = material("Fliesen | Sand", "baa385")
navy = material("Wandanstrich | blau", "325676")
red = material("Polster | rot", "905152")
pages = material("Kisten und Bücher | gedeckt ocker", "a79b70")
membrane = material("Dach | erneuerte Bahnen", "717474")
rooflight = material("Oberlichter | mattes Glas", "a5afb0", 0.03, 0.34)
weathered = material("Holz | bewettertes Podest", "817b71")
brown = material("Türen | Holz", "785e4d")
cobalt = material("Jagdweg | blaue Profile", "294b7d", 0.18)
yellow = material("Rampe | gelbe Wangen", "dca81e", 0.12, 0.42)
asphalt = material("Werkhof | Asphalt", "737574")
grass = material("Rasen", "7d8b55")
earth = material("Pflanzerde", "544b36")
leaf = material("Laub | Salbeigrün", "718452")
foliage = material("Laub | Dunkelgrün", "4b7049")
paver = material("Hof | Beton", "999a90")
block_paving = material("Zugänge | Betonpflaster mit Fugen", "93918a")


# One thin pane per aperture; the jambs and the interior remain visible through it.
glazing = material("Fensterglas | leicht getönt", "8c9e9e", 0, 0.105)
glazing.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.32
glazing.diffuse_color = (*glazing.diffuse_color[:3], 0.32)
glazing.surface_render_method = "BLENDED"


def chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data))
    )


def packed_texture(mat, data, name, non_color=False):
    height, width = data.shape[:2]
    png_type = 0 if data.ndim == 2 else 2
    scanlines = b"".join(b"\0" + row.tobytes() for row in data)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, png_type, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(scanlines, 9))
        + chunk(b"IEND", b"")
    )
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "surface.png"
        path.write_bytes(png)
        image = bpy.data.images.load(str(path))
        image.name = name + " | " + mat.name
        if non_color:
            image.colorspace_settings.name = "Non-Color"
        image.pack()
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    return node


def surface_grain(mat, hex_color, seed, strength, direction=None):
    """Pack a seamless material swatch. All image pixels are generated here."""
    size = 192
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[:size, :size]

    def smooth_noise(cells):
        grid = rng.uniform(-1, 1, (cells, cells))
        yy, xx = y * cells / size, x * cells / size
        i, j = yy.astype(int), xx.astype(int)
        fy, fx = yy - i, xx - j
        fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
        return (1 - fy) * (
            (1 - fx) * grid[i, j] + fx * grid[i, (j + 1) % cells]
        ) + fy * (
            (1 - fx) * grid[(i + 1) % cells, j]
            + fx * grid[(i + 1) % cells, (j + 1) % cells]
        )

    variation = (
        0.55 * smooth_noise(5)
        + 0.28 * smooth_noise(16)
        + 0.32 * rng.uniform(-1, 1, (size, size))
    )
    # Relief is independent from broad color variation so stains do not look embossed.
    relief = None
    if direction in ("mineral", "aggregate"):
        grit = rng.uniform(-1, 1, (size, size))
        relief = 0.24 * grit + 0.11 * smooth_noise(48)
        if direction == "aggregate":
            relief += 0.31 * np.maximum(0, grit - 0.62)
    if direction == "timber":
        grain = np.sin(y * math.tau / 8 + smooth_noise(6) * 2)
        variation += 0.42 * grain
        relief = 0.22 * grain + 0.09 * variation
    if direction == "zinc":
        flecks = smooth_noise(48) + 0.47 * smooth_noise(24)
        variation += 0.75 * flecks
        relief = 0.085 * flecks
    color = np.array([int(hex_color[i : i + 2], 16) for i in (0, 2, 4)])
    pixels = np.clip(color + strength * variation[:, :, None], 0, 255).astype(np.uint8)

    shader = mat.node_tree.nodes["Principled BSDF"]
    node = packed_texture(mat, pixels, "Oberfläche")
    mat.node_tree.links.new(node.outputs["Color"], shader.inputs["Base Color"])
    if direction in ("timber", "zinc", "aggregate", "mineral"):
        rough = shader.inputs["Roughness"].default_value
        metal = shader.inputs["Metallic"].default_value
        spread = 0.14 if direction in ("timber", "zinc") else 0.08
        roughness = np.clip(rough + variation * spread, 0.15, 0.99)
        packed = np.empty((size, size, 3), dtype=np.uint8)
        packed[:, :, 0] = 255
        packed[:, :, 1] = np.rint(roughness * 255)
        packed[:, :, 2] = round(255 * metal)
        tex = packed_texture(mat, packed, "Rauheit und Metallanteil", True)
        channels = mat.node_tree.nodes.new("ShaderNodeSeparateColor")
        mat.node_tree.links.new(tex.outputs["Color"], channels.inputs["Color"])
        mat.node_tree.links.new(channels.outputs["Green"], shader.inputs["Roughness"])
        mat.node_tree.links.new(channels.outputs["Blue"], shader.inputs["Metallic"])
    if relief is not None:
        du = (np.roll(relief, 1, axis=1) - np.roll(relief, -1, axis=1)) * 0.5
        dv = (np.roll(relief, -1, axis=0) - np.roll(relief, 1, axis=0)) * 0.5
        normals = np.stack((du, dv, np.ones_like(du)), axis=-1)
        normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
        tex = packed_texture(
            mat,
            np.rint((normals + 1) * 127.5).astype(np.uint8),
            "Oberflächenprofil",
            True,
        )
        normal = mat.node_tree.nodes.new("ShaderNodeNormalMap")
        normal.inputs["Strength"].default_value = 0.52
        mat.node_tree.links.new(tex.outputs["Color"], normal.inputs["Color"])
        mat.node_tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])


swatches = root / "assets/rosenwerk/materialien"
worn_edge = material("Rasen | auslaufende Trittkante", "80794d")
drive_asphalt = material("Werkhof | hellerer Fahrstreifen", "898985")
yard_concrete = material("Werkhof | befahrener Ortbeton", "938f81")
texture_metres = {
    grass: 1.8,
    block_paving: 4.14,
    asphalt: 4.6,
    yard_concrete: 3.6,
    drive_asphalt: 5.1,
    roof: 3.6,
    tar: 4.8,
    membrane: 4.8,
}


def photo_surface(mat, filename, relief, roughness, metal=0, shade=1):
    image = bpy.data.images.load(str(swatches / filename), check_existing=True)
    image.pack()
    tree = mat.node_tree
    shader = tree.nodes["Principled BSDF"]
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    color = node.outputs["Color"]
    if shade != 1:
        mix = tree.nodes.new("ShaderNodeMixRGB")
        mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = 1
        mix.inputs[2].default_value = (shade, shade, shade, 1)
        tree.links.new(color, mix.inputs[1])
        color = mix.outputs[0]
    tree.links.new(color, shader.inputs["Base Color"])
    if mat == worn_edge:
        alpha = tree.nodes.new("ShaderNodeMath")
        alpha.operation = "GREATER_THAN"
        alpha.inputs[1].default_value = 0.44
        tree.links.new(node.outputs["Alpha"], alpha.inputs[0])
        tree.links.new(alpha.outputs[0], shader.inputs["Alpha"])
        return
    # Fine luminance differences describe relief; broad stains only change the colour.
    sample = image.copy()
    sample.scale(256, 256)
    rgba = np.empty(256 * 256 * 4, dtype=np.float32)
    sample.pixels.foreach_get(rgba)
    bpy.data.images.remove(sample)
    linear = rgba.reshape((256, 256, 4))[:, :, :3].dot([0.213, 0.715, 0.072])
    height = np.sqrt(np.maximum(linear, 0))
    du = (np.roll(height, 1, 1) - np.roll(height, -1, 1)) * relief
    dv = (np.roll(height, 1, 0) - np.roll(height, -1, 0)) * relief
    normals = np.stack((du, dv, np.ones_like(du)), axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    normal_tex = packed_texture(
        mat, np.uint8((normals[::-1] + 1) * 127.5), "Feinrelief", True
    )
    normal = tree.nodes.new("ShaderNodeNormalMap")
    tree.links.new(normal_tex.outputs["Color"], normal.inputs["Color"])
    tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    values = np.empty((256, 256, 3), dtype=np.uint8)
    values[:, :, 0] = 255
    values[:, :, 1] = 255 * np.clip(
        roughness + (height[::-1] - height.mean()) * 0.7, 0.32, 0.99
    )
    values[:, :, 2] = round(255 * metal)
    tex = packed_texture(mat, values, "Rauheit und Metallanteil", True)
    channels = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(tex.outputs["Color"], channels.inputs["Color"])
    tree.links.new(channels.outputs["Green"], shader.inputs["Roughness"])
    tree.links.new(channels.outputs["Blue"], shader.inputs["Metallic"])


for mat, filename, relief, roughness, metal, shade in (
    (grass, "rasen.jpg", 1.15, 0.94, 0, 1),
    (worn_edge, "rasenkante.png", 0, 0.96, 0, 1),
    (asphalt, "hofasphalt.jpg", 1.1, 0.90, 0, 1),
    (drive_asphalt, "fahrstreifen.jpg", 0.8, 0.86, 0, 1),
    (yard_concrete, "hofbeton.jpg", 1.25, 0.82, 0, 1),
    (block_paving, "werkhof-pflaster.jpg", 2.1, 0.80, 0, 1),
    (roof, "dachblech.jpg", 2.1, 0.58, 0.30, 1),
    (tar, "dachbahn.jpg", 1.35, 0.90, 0, 0.81),
    (membrane, "dachbahn.jpg", 1.35, 0.78, 0, 1),
):
    photo_surface(mat, filename, relief, roughness, metal, shade)


for seed, (mat, color, variation, pattern) in enumerate(
    (
        (plaster, "c9c4b5", 14, "mineral"),
        (concrete, "b7b4aa", 15, "mineral"),
        (wood, "aa8058", 22, "timber"),
        (ply, "c4a275", 15, "timber"),
        (weathered, "817b71", 18, "timber"),
        (paver, "999a90", 10, "aggregate"),
        (galv, "a5abb0", 13, "zinc"),
    )
):
    surface_grain(mat, color, seed, variation, pattern)


verge_finish = material("Jagdweg | Rasen, Erde und Pflaster", "888674")
tree = verge_finish.node_tree
shader = tree.nodes["Principled BSDF"]
for suffix, socket in (
    ("farbe", "Base Color"),
    ("normal", "Normal"),
    ("rauheit", "Roughness"),
):
    tex = tree.nodes.new("ShaderNodeTexImage")
    image = bpy.data.images.load(str(swatches / ("jagdweg-" + suffix + ".jpg")))
    if suffix != "farbe":
        image.colorspace_settings.name = "Non-Color"
    image.pack()
    tex.image = image
    tex.extension = "EXTEND"
    out = tex.outputs["Color"]
    if suffix == "normal":
        normal = tree.nodes.new("ShaderNodeNormalMap")
        tree.links.new(out, normal.inputs["Color"])
        out = normal.outputs["Normal"]
    if suffix == "rauheit":
        channels = tree.nodes.new("ShaderNodeSeparateColor")
        tree.links.new(out, channels.inputs["Color"])
        out = channels.outputs["Green"]
    tree.links.new(out, shader.inputs[socket])

# These capture positions are in the same drafting coordinates as the facades.
probe_positions = {
    "jagdweg": (85.4, 28.5, 5.8),
    "rosenstrasse": (37, -5.4, 4.6),
    "laderampe": (-4.6, 42, 5.1),
    "nordhof": (39, 80.2, 5.6),
    "innenhof": (66.2, 31.8, 3.5),
}
reflective = {glazing, pane, sill, galv, rooflight}
zoned_materials = {}


def reflective_finish(mat, center):
    xy = center.xy - anchor
    u, v = xy.dot(axis), xy.dot(across)
    if 63.5 < u < 69.2 and 17 < v < 45:
        zone = "innenhof"
    else:
        zone = min(
            (
                (abs(u - 81), "jagdweg"),
                (abs(v), "rosenstrasse"),
                (abs(u - 1), "laderampe"),
                (abs(v - 75), "nordhof"),
            )
        )[1]
    if (mat, zone) not in zoned_materials:
        zoned = mat.copy()
        zoned.name = mat.name + " | " + zone
        zoned["reflectionZone"] = zone
        if mat == glazing:
            zoned["windowGlass"] = True
        zoned_materials[mat, zone] = zoned
    return zoned_materials[mat, zone]


class Part:
    """Batch solids by semantic part, retaining editable materials and selection IDs."""

    def __init__(self, name, rid, kind):
        self.name, self.rid, self.kind = name, rid, kind
        self.verts, self.faces, self.indices, self.materials = [], [], [], []
        self.edge_uvs = {}

    def solid(self, verts, faces, mats):
        start = len(self.verts)
        self.verts.extend(world(*p) for p in verts)
        for f, mat in zip(faces, mats):
            self.faces.append(tuple(start + i for i in f))
            if mat not in self.materials:
                self.materials.append(mat)
            self.indices.append(self.materials.index(mat))

    def prism(self, ring, bottom, top, wall, cap=None):
        ring = list(ring)
        if (
            sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1]))
            < 0
        ):
            ring.reverse()
        n = len(ring)
        vertices = [(p[0], p[1], z) for z in (bottom, top) for p in ring]
        sides = [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
        self.solid(
            vertices,
            [tuple(reversed(range(n))), tuple(range(n, 2 * n)), *sides],
            [wall, cap or wall, *([wall] * n)],
        )

    def box(self, x1, y1, z1, x2, y2, z2, mat):
        self.prism([(x1, y1), (x2, y1), (x2, y2), (x1, y2)], z1, z2, mat)

    def bar(self, a, b, width, bottom, top, mat):
        a, b = Vector(a), Vector(b)
        delta = (b - a).normalized()
        off = Vector((-delta.y, delta.x)) * width / 2
        self.prism([a - off, b - off, b + off, a + off], bottom, top, mat)

    def slope(
        self, a, b, width, start_height, end_height, thickness, mat, base_height=None
    ):
        a, b = Vector(a), Vector(b)
        t = (b - a).normalized()
        n = Vector((-t.y, t.x)) * width / 2
        top = [
            (*q, z)
            for q, z in (
                (a - n, start_height),
                (b - n, end_height),
                (b + n, end_height),
                (a + n, start_height),
            )
        ]
        self.solid(
            [
                (u, v, z - thickness if base_height is None else base_height)
                for u, v, z in top
            ]
            + top,
            [
                (3, 2, 1, 0),
                (4, 5, 6, 7),
                (0, 1, 5, 4),
                (1, 2, 6, 5),
                (2, 3, 7, 6),
                (3, 0, 4, 7),
            ],
            [mat] * 6,
        )

    def pipe(self, path, radius, mat):
        path = [Vector(p) for p in path]
        sides = 10
        rings = []
        for i, p in enumerate(path):
            tangent = (
                path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
            ).normalized()
            reference = (
                Vector((0, 1, 0)) if abs(tangent.y) < 0.98 else Vector((1, 0, 0))
            )
            side = tangent.cross(reference).normalized()
            up = tangent.cross(side)
            rings.extend(
                p
                + radius
                * (
                    side * math.cos(j * math.tau / sides)
                    + up * math.sin(j * math.tau / sides)
                )
                for j in range(sides)
            )
        faces = [
            (
                i * sides + j,
                i * sides + (j + 1) % sides,
                (i + 1) * sides + (j + 1) % sides,
                (i + 1) * sides + j,
            )
            for i in range(len(path) - 1)
            for j in range(sides)
        ]
        self.solid(rings, faces, [mat] * len(faces))

    def finish(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.update()
        uv = mesh.uv_layers.new(name="Materialmaßstab")
        for face in mesh.polygons:
            normal = face.normal
            vertical = abs(normal.z) < 0.65
            along_u = abs(normal.x * axis.x + normal.y * axis.y) < 0.70
            scale_m = texture_metres.get(self.materials[self.indices[face.index]], 3.2)
            if face.index in self.edge_uvs:
                for li, coords in zip(face.loop_indices, self.edge_uvs[face.index]):
                    uv.data[li].uv = coords
                continue
            for li in face.loop_indices:
                x, y, z = mesh.vertices[mesh.loops[li].vertex_index].co
                u = x * axis.x + y * axis.y
                v = x * across.x + y * across.y
                mapping = ((u if along_u else v), z) if vertical else (u, v)
                uv.data[li].uv = (mapping[0] / scale_m, mapping[1] / scale_m)
        obj = bpy.data.objects.new(self.name, mesh)
        scene.collection.objects.link(obj)
        for mat in self.materials:
            mesh.materials.append(mat)
        for face, index in zip(mesh.polygons, self.indices):
            mat = self.materials[index]
            if (
                self.kind in {"building", "access", "container", "exterior"}
                and mat in reflective
            ):
                zoned = reflective_finish(mat, face.center)
                if zoned.name not in mesh.materials:
                    mesh.materials.append(zoned)
                index = mesh.materials.find(zoned.name)
            face.material_index = index
        obj["id"], obj["kind"] = self.rid, self.kind
        return obj


def hinged(part, pivot, turn, opened=False):
    obj = part.finish()
    obj["doorPivot"] = list(map(float, pivot))
    obj["doorTurn"] = turn
    obj["doorOpen"] = opened
    return obj


def part(name):
    return Part(name, building["id"], "building")


def cut_court(shell, ring):
    cutter = part("Hofausschnitt")
    cutter.prism(ring, -1, 24, plaster)
    tool = cutter.finish()
    modifier = shell.modifiers.new("Offener Innenhof", "BOOLEAN")
    modifier.operation, modifier.object = "DIFFERENCE", tool
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(tool, do_unlink=True)


outline = [local(p) for p in building["coordinates"][:-1]]
court = [Vector(p) for p in survey["courtyardOpening"]]
base = part("Fabrik | niedrige Flügel")
base.prism(outline, 4.94, 5.18, plaster, tar)
shell = base.finish()
cut_court(shell, court)
# The OSM outline includes the projecting roof over the open dock.
dock_start, dock_end = 16.12, 69.94
timber = site["timberWorkshop"]
dock_wall = timber["dockWallU"]
dock_opening = [
    (-5, dock_start),
    (dock_wall, dock_start),
    (dock_wall, dock_end),
    (-5, dock_end),
]
cut_court(shell, dock_opening)
slab = Part("Grundplatte | Schnittansicht", building["id"], "slab")
slab.prism(outline, -0.035, site["inventoryLift"] + 0.105, concrete)
deck = slab.finish()
cut_court(deck, court)
cut_court(deck, dock_opening)

# GeoSN DOM1 minus DGM1: 5.1–5.5 m low wings, 8.5 m east wing,
# 19.4 m factory roof and 22.2 m at the raised stair head (median sample heights).
hall = part("Hochbau | vier Geschosse und Dach")
hall.box(2.5, 15, 18.73, 64.0, 47.5, 18.92, concrete)
ridge = 31.25


def roof_z(v):
    return 19.85 - 0.049 * abs(v - ridge)


cross_section = [
    (14.8, roof_z(14.8)),
    (ridge, roof_z(ridge)),
    (47.7, roof_z(47.7)),
    (47.7, 18.83),
    (14.8, 18.83),
]
n = len(cross_section)
hall.solid(
    [(u, v, h) for u in (2.28, 64.2) for v, h in cross_section],
    [tuple(range(n)), tuple(reversed(range(n, n * 2)))]
    + [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)],
    [roof] * (n + 2),
)
for u in range(3, 64, 2):
    for v, w in ((14.82, ridge), (ridge, 47.68)):
        hall.solid(
            [
                (u, v, roof_z(v) + 0.025),
                (u + 0.055, v, roof_z(v) + 0.025),
                (u + 0.055, w, roof_z(w) + 0.025),
                (u, w, roof_z(w) + 0.025),
            ],
            [(0, 1, 2, 3)],
            [sill],
        )
for u, v, w, d in (
    (5, 19, 7, 6),
    (12, 38, 11, 6),
    (24, 20, 13, 7),
    (38, 35, 8, 8),
    (49, 22, 9, 6),
):
    hall.solid(
        [
            (x, y, roof_z(y) + 0.04)
            for x, y in ((u, v), (u + w, v), (u + w, v + d), (u, v + d))
        ],
        [(0, 1, 2, 3)],
        [membrane],
    )
hall.box(30.4, 45.2, 21.72, 49.3, 52.8, 21.9, plaster)
hall.box(30.3, 45.1, 21.9, 49.4, 52.9, 22.16, roof)
hall.finish()

# The taller Jagdweg wing has two full window rows above a low daylight basement.
east_ring = [outline[i] for i in range(1, 12)]
east = part("Jagdweg | Sockelgeschoss und zwei Fensterreihen")
east.prism(east_ring, 8.19, 8.42, plaster, membrane)
east.finish()


# All outer walls are assembled around the same openings used for their glazing.
# Coordinates are on the outer face; opening depth is measured towards the room.
openings = []


def opening(a, b, z1, z2):
    openings.append((Vector(a), Vector(b), z1, z2))


def wall_with_openings(group, a, b, bottom, top, mat=plaster, depth=0.35):
    a, b = Vector(a), Vector(b)
    tangent = (b - a).normalized()
    normal = Vector((-tangent.y, tangent.x))
    length = (b - a).length
    spans = []
    for start, end, lo, hi in openings:
        if hi <= bottom or lo >= top:
            continue
        if max(abs((point - a).dot(normal)) for point in (start, end)) > 0.13:
            continue
        l, r = sorted((float((start - a).dot(tangent)), float((end - a).dot(tangent))))
        l, r = max(0, l), min(length, r)
        if r - l > 0.015:
            spans.append((l, r, max(bottom, lo), min(top, hi)))
    # Splitting only at actual jambs also works for aligned basement and upper rows.
    cuts = sorted({0, length, *(x for l, r, _, _ in spans for x in (l, r))})
    for l, r in zip(cuts, cuts[1:]):
        p, q = a + tangent * l, a + tangent * r
        if r - l < 0.002:
            continue
        ring = [p, q, q - normal * depth, p - normal * depth]
        z = bottom
        for lo, hi in sorted((lo, hi) for x, y, lo, hi in spans if x < (l + r) / 2 < y):
            if lo > z + 0.002:
                group.prism(ring, z, lo, mat)
            z = max(z, hi)
        if top > z + 0.002:
            group.prism(ring, z, top, mat)


def glass_face(group, a, b, bottom, top):
    group.solid(
        [(*a, bottom), (*b, bottom), (*b, top), (*a, top)], [(3, 2, 1, 0)], [glazing]
    )


def window_row(
    group, a, b, bottom, height, pitch, fraction=0.78, trim=frame, blinds=()
):
    a, b = Vector(a), Vector(b)
    tangent = (b - a).normalized()
    normal = Vector((-tangent.y, tangent.x))
    count = max(1, round((b - a).length / pitch))
    step = (b - a).length / count
    for i in range(count):
        center = a + tangent * ((i + 0.5) * step)
        half = step * fraction / 2

        def strip(left, right, z1, z2, offset, thick, mat):
            group.bar(
                center + tangent * left + normal * offset,
                center + tangent * right + normal * offset,
                thick,
                z1,
                z2,
                mat,
            )

        if group.kind != "upper":
            opening(
                center - tangent * half,
                center + tangent * half,
                bottom,
                bottom + height,
            )
        # The glass and profiles sit 19 cm behind the masonry face. No opaque backplate.
        inset = -0.19
        glass_face(
            group,
            center - tangent * half + normal * (inset - 0.025),
            center + tangent * half + normal * (inset - 0.025),
            bottom,
            bottom + height,
        )
        for edge in (-half, half - 0.080):
            strip(edge, edge + 0.080, bottom, bottom + height, inset, 0.095, trim)
        for z in (bottom, bottom + height - 0.075):
            strip(-half, half, z, z + 0.075, inset, 0.095, trim)
        for j in (1, 2):
            x = (2 * j / 3 - 1) * half
            strip(x - 0.032, x + 0.032, bottom, bottom + height, inset, 0.071, trim)
        strip(
            -half,
            half,
            bottom + height * 0.32,
            bottom + height * 0.32 + 0.055,
            inset,
            0.075,
            trim,
        )
        if blinds:
            closed = blinds[i % len(blinds)] * height
            head = bottom + height
            strip(-half, half, head - 0.16, head + 0.06, -0.065, 0.09, trim)
            if closed > 0.16:
                strip(-half, half, head - closed, head - 0.16, -0.095, 0.028, frame)
                for z in np.arange(head - closed + 0.06, head - 0.16, 0.085):
                    strip(-half, half, z, z + 0.012, -0.075, 0.017, sill)
        strip(
            -half - 0.12, half + 0.12, bottom - 0.13, bottom - 0.05, -0.065, 0.34, sill
        )


# The aerial image shows two separate entrance platforms along this slightly skewed wall.
shop_centres = (5.6, 35.9)


def shop_wall(u):
    return outline[13].y + (outline[12].y - outline[13].y) * u / outline[12].x


facades = part("Fassaden | Fenster und Geschossbänder")
for i, (a, b) in enumerate(zip(outline, outline[1:] + outline[:1])):
    is_east = 1 <= i <= 10
    top = 8.42 if is_east else 5.18
    if i in (14, 15):
        continue  # The dock has its own continuous fascia and gutter.
    facades.bar(a, b, 0.16, top, top + 0.12, sill)
    if i == 0:
        # The north wall behind the long overhang is recessed into the low wing.
        window_row(
            facades, (6.2, a.y), (17.9, a.y - 0.15), 1.51, 1.82, 3.8, fraction=0.53
        )
        continue
    if i == 12:
        # Leave the portals, and the blind beside the wheelchair door, clear.
        for lo, hi in (
            (0.4, shop_centres[0] - 1.5),
            (shop_centres[0] + 1.5, shop_centres[1] - 1.5),
            (shop_centres[1] + 1.5, 61.45),
        ):
            ends = ((hi, shop_wall(hi)), (lo, shop_wall(lo)))
            window_row(
                facades,
                *ends,
                1.57,
                2.24,
                3.6,
                trim=cobalt,
                blinds=(0.91, 0.71, 0.12, 0.31, 0.12),
            )
            window_row(facades, *ends, 0.23, 0.47, 4.2, fraction=0.65, trim=cobalt)
        continue
    if i == 3:
        window_row(facades, (73.1, a.y), (76.7, a.y), 4.44, 1.0, 1.2, fraction=0.32)
        continue
    if is_east:
        if i in (6, 7):
            continue  # glazed central entrance bay
        if (b - a).length > 7:
            for bottom, h in (
                (-0.36 if i in (5, 8) else 0.22, 1.31 if i in (5, 8) else 0.71),
                (2.27, 2.0),
                (5.65, 2.05),
            ):
                window_row(facades, a, b, bottom, h, 4.05, trim=cobalt)
    elif (b - a).length > 8:
        window_row(facades, a, b, 1.60, 2.45, 5.0)
for z in (5.95, 10.55, 15.15):
    window_row(facades, (64.02, 47.2), (64.02, 15.35), z, 2.6, 4.5, fraction=0.87)
    for v1, v2 in ((15.4, 27.7), (34.9, 47.1)):
        window_row(facades, (2.5, v1), (2.5, v2), z, 2.62, 3.1, fraction=0.78)
for z in (6.40, 10.88, 15.36, 19.80):
    for x1, x2 in ((34.9, 36.1), (41.9, 45.8)):
        window_row(facades, (x1, 52.82), (x2, 52.82), z, 1.14, 1.28, fraction=0.66)
for u in range(3, 64, 6):
    for v in (14.9, 47.44):
        facades.box(u, v, 5.18, u + 0.29, v + 0.16, 18.92, plaster)
for u in range(3, 65, 3):
    facades.box(u, 0.3, 5.19, u + 0.052, 14.65, 5.22, roof)
facades.box(7, 62, 5.18, 66.6, 70.2, 5.70, roof)
facades.finish()

court_id = site["courtyards"][0]["sourceResourceId"]


joint = material("Hof | mineralische Fuge", "65635a")


def courtyard(kind):
    g = Part("Schlucht | Querträger und Hofboden " + kind, court_id, kind)
    g.prism(court, 0.02, 0.24, yard_concrete)
    for v in np.arange(20.5, 44.1, 3.65):
        g.bar((64.18, v), (68.07, v + 0.015), 0.022, 0.240, 0.244, joint)
    for step in (0.09, 0.24, 0.39, 0.54, 0.69, 0.84):
        a, b = court[0].lerp(court[3], step), court[1].lerp(court[2], step)
        for z, w, t, mat in (
            (4.77, 0.15, 0.055, steel),
            (4.82, 0.065, 0.18, sill),
            (5.0, 0.15, 0.05, steel),
        ):
            g.bar(a, b, w, z, z + t, mat)
    # The courtyard photo shows a continuous band of glass blocks below the high hall windows.
    a, b = court[0].lerp(court[3], 0.10), court[0].lerp(court[3], 0.88)
    g.bar(a, b, 0.12, 2.45, 3.4, pane)
    for i in range(32):
        p = a.lerp(b, i / 31)
        g.bar(p, p + (b - a).normalized() * 0.045, 0.16, 2.45, 3.4, frame)
    g.bar(a, b, 0.16, 2.92, 2.97, frame)
    g.finish()


courtyard("exterior")
courtyard("interior")


# Long-side steel doors and a timber loading platform are visible in the KuSS site photograph.
def add_sign(name, text, a, b, z, size, rid, kind="container", ink=white):
    a, b = Vector(a), Vector(b)
    x, y, _ = world(*(a + b) / 2, z)
    direction = (Vector(world(*b, z)) - Vector(world(*a, z))).normalized()
    up = Vector((0, 0, 1))
    curve = bpy.data.curves.new(name, "FONT")
    curve.body, curve.size, curve.align_x, curve.align_y = (
        text,
        size,
        "CENTER",
        "CENTER",
    )
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    obj.matrix_world = (
        Matrix((direction, up, direction.cross(up))).transposed().to_4x4()
    )
    obj.location = (x, y, z)
    curve.materials.append(ink)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    with bpy.context.temp_override(
        active_object=obj,
        object=obj,
        selected_objects=[obj],
        selected_editable_objects=[obj],
    ):
        bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    obj["kind"], obj["id"] = kind, rid


dry_blade = material("Rasen | trockene Halme", "9a9564")
leaf_tip = material("Rasen | junge Blätter", "829154")


def broadleaf_rosette(g, u, v, z, radius, rng):
    # The raised midrib and tapered tips catch sky light at pedestrian eye level.
    for i in range(13):
        angle = i * 2.4 + rng.uniform(-0.3, 0.3)
        dx, dy = math.cos(angle), math.sin(angle)
        length = radius * rng.uniform(0.40, 1.0)
        width = length * rng.uniform(0.13, 0.22)

        def point(distance, side, height):
            return (
                u + dx * distance - dy * side,
                v + dy * distance + dx * side,
                z + height,
            )

        verts = [
            point(0, 0, 0.01),
            point(length * 0.5, -width, 0.20 * length),
            point(length * 0.48, 0, 0.30 * length),
            point(length * 0.5, width, 0.20 * length),
            point(length, 0, rng.uniform(0.08, 0.22) * length),
        ]
        mat = leaf if i % 3 else leaf_tip
        g.solid(verts, [(0, 1, 2), (0, 2, 3), (1, 4, 2), (2, 4, 3)], [mat] * 4)


def shoots(g, u, v, z, r, height, rng):
    for j in range(8):
        angle = rng.uniform(0, math.tau)
        dx, dy = math.cos(angle), math.sin(angle)
        cx, cy = u + r * rng.uniform(-0.7, 0.7), v + r * rng.uniform(-0.7, 0.7)
        h = height * rng.uniform(0.54, 1.25)
        w = min(0.009, h * 0.045)
        blade = []
        for t, width, lift in ((0, w, 0), (0.24, w * 0.67, 0.68), (0.69, 0, 1)):
            blade.extend(
                (
                    cx + dx * t * h - dy * width * sign,
                    cy + dy * t * h + dx * width * sign,
                    z + lift * h,
                )
                for sign in (-1, 1)
            )
        mat = dry_blade if j == 0 else (leaf if j % 3 else leaf_tip)
        g.solid(blade, [(0, 1, 3, 2), (2, 3, 4)], [mat, mat])


def verge_height(u, v):
    terrain = survey["terrain"]
    rows = [np.interp(u, terrain["u"], xs) for xs in terrain["heights"]]
    envelope = max(
        0, min(1, (v + 6) / 4, (85 - v) / 4, (u - 80.5) / 0.28, (88 - u) / 0.45)
    )
    return -0.025 + float(np.interp(v, terrain["v"], rows)) * envelope


def lawn_margin(g, ring, height_at, drop=0):
    # A narrow textured strip bridges soil and paving. Mitered corners share
    # endpoints, and the irregular lip follows the same grade as the sidewalk.
    ring = [Vector(p) for p in ring]
    if sum(a.x * b.y - b.x * a.y for a, b in zip(ring, ring[1:] + ring[:1])) < 0:
        ring.reverse()
    directions = [
        (ring[(i + 1) % len(ring)] - p).normalized() for i, p in enumerate(ring)
    ]
    normals = [Vector((d.y, -d.x)) for d in directions]
    miters = [
        (n + normals[i - 1]) / max(0.3, 1 + n.dot(normals[i - 1]))
        for i, n in enumerate(normals)
    ]
    offset = 0
    for i, a in enumerate(ring):
        j = (i + 1) % len(ring)
        length = (ring[j] - a).length
        count = max(1, math.ceil(length / 0.38))
        rows = []
        for step in range(count + 1):
            t = step / count
            p = a.lerp(ring[j], t)
            outward = miters[i].lerp(miters[j], t)
            wave = 0.027 * math.sin(p.x * 1.71 + p.y * 0.83) + 0.022 * math.sin(
                p.y * 2.4 - p.x * 0.62
            )
            edges = []
            wear = 0.5 + 0.5 * math.sin(
                p.x * 0.92 + p.y * 0.36 + math.sin(p.x * 0.48 - p.y)
            )
            for d, lower in (
                (-0.08 - 0.21 * wear, 0),
                (0.07 + 0.13 * wear + wave, drop),
            ):
                q = p + outward * d
                edges.append((q.x, q.y, height_at(q.x, q.y) + 0.012 - lower))
            rows.append(edges)
        for k in range(count):
            x0, x1 = (offset + length * k / count) / 1.6, (
                offset + length * (k + 1) / count
            ) / 1.6
            g.edge_uvs[len(g.faces)] = [(x0, 0.01), (x0, 0.99), (x1, 0.99), (x1, 0.01)]
            g.solid([*rows[k], *reversed(rows[k + 1])], [(0, 1, 2, 3)], [worn_edge])
        offset += length


def entrance_terrain(g):
    # Sections of DGM1 are relative to the adjacent pavement. Keep the entrance
    # and the grass in one continuous surface; no flat layer passes over the depression.
    atlas = survey["vergeAtlas"]
    u0, v0 = atlas["origin"]
    width, length, pad = atlas["width"], atlas["lengthPerPanel"], atlas["padding"]
    panels = atlas["panels"]
    us = sorted(set([*survey["terrain"]["u"], 80.8, 81.18, 85.66]))
    vs = sorted(
        set(
            [
                *survey["terrain"]["v"],
                *np.arange(-6, 85, 0.5),
                22.34,
                31.07,
                *(v0 + i * length for i in range(1, panels)),
            ]
        )
    )
    vertices = [(u, v, verge_height(u, v)) for v in vs for u in us]
    faces = []
    for row, (v1, v2) in enumerate(zip(vs, vs[1:])):
        panel = int(((v1 + v2) * 0.5 - v0) // length)
        for col in range(len(us) - 1):
            k = row * len(us) + col
            j = k + len(us)
            for tri in ((k, k + 1, j + 1), (k, j + 1, j)):
                # Panels share the same border texels, including padding for mipmaps.
                g.edge_uvs[len(g.faces) + len(faces)] = [
                    (
                        (panel + (vertices[n][0] - u0 + pad) / (width + 2 * pad))
                        / panels,
                        (vertices[n][1] - v0 - panel * length + pad)
                        / (length + 2 * pad),
                    )
                    for n in tri
                ]
                faces.append(tri)
    g.solid(vertices, faces, [verge_finish] * len(faces))
    # Isolated short tufts grow from joints near the beds. Group them in pockets
    # and leave the middle of the pedestrian path clear.
    rng = np.random.default_rng(2381)
    course = 1.38 / 12
    for _, start, lawn_edge, end in atlas["lawns"]:
        for v in rng.uniform(start + 0.4, end - 0.4, round(end - start)):
            for _ in range(rng.integers(1, 4)):
                x = lawn_edge + rng.uniform(-0.10, 0.24)
                y = round((v + rng.normal(0, 0.09)) / course) * course
                shoots(
                    g,
                    x,
                    y,
                    verge_height(x, y) + 0.002,
                    0.018,
                    rng.uniform(0.025, 0.065),
                    rng,
                )
    # A segmented stone curb follows the outer grade; its rounded nose faces the road.
    for y in np.arange(-6, 84.99, 1):
        ends = []
        for v in (y + 0.009, y + 0.991):
            z = verge_height(87.9, v)
            ends.extend(
                [
                    (87.79, v, z + 0.017),
                    (87.97, v, z + 0.017),
                    (88.018, v, z - 0.018),
                    (88.018, v, -0.095),
                ]
            )
        g.solid(ends, [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6)], [yard_concrete] * 3)
    # Sidewalk-level surface outside the depression, also supporting the context buildings.
    surround = Part("Umgebung | ebene Kartenfläche", building["id"], "surround")
    ground_mat = material("Umgebung | Kartengrund", "dddeda")
    for x1, y1, x2, y2 in (
        (-1400, -1400, 80.5, 1400),
        (88, -1400, 1400, 1400),
        (80.5, -1400, 88, -6),
        (80.5, 85, 88, 1400),
    ):
        surround.solid(
            [(x1, y1, -0.10), (x2, y1, -0.10), (x2, y2, -0.10), (x1, y2, -0.10)],
            [(0, 1, 2, 3)],
            [ground_mat],
        )
    surround.finish()


def build_yard():
    g = Part("Gelände | Werkhof und Zugangsflächen", building["id"], "ground")
    # Only the continuous yard, approaches and verge up to KuSS. Street carriageways are outside.
    g.prism(
        [
            (-13.6, -3.2),
            (-6, -4),
            (-1, -6),
            (52, -9),
            (67, -18.5),
            (78.8, -20),
            (86, -18),
            (88, -15),
            (88, -6),
            (80.5, -6),
            (80.5, 85),
            (88, 85),
            (88, 95),
            (64, 95),
            (57, 105),
            (39, 108),
            (28, 105),
            (18, 98),
            (5, 94),
            (-11, 89),
            (-37, 84),
            (-38, 76),
            (-24, 72),
            (-16, 69),
            (-11, 63),
            (-11, 46),
            (-17.1, 32),
            (-17.8, 22),
            (-14.4, 16),
        ],
        -0.11,
        -0.025,
        asphalt,
    )
    # The orthophoto shows a lighter run of pavement turning around the north-west end.
    lane = [
        (-5.3, 6),
        (-6.1, 38),
        (-5.5, 61),
        (-4.2, 71),
        (-2.0, 77.2),
        (2.5, 82.6),
        (9.3, 87.4),
        (18.8, 91.6),
        (23.4, 92.7),
        (35.2, 92.8),
        (50, 92.0),
        (63.1, 91.3),
    ]
    pairs = []
    for i, p in enumerate(lane):
        tangent = (
            Vector(lane[min(i + 1, len(lane) - 1)]) - Vector(lane[max(0, i - 1)])
        ).normalized()
        normal = Vector((-tangent.y, tangent.x))
        pairs.append([(*(Vector(p) + side * normal), -0.019) for side in (-2.12, 2.12)])
    for left, right in zip(pairs, pairs[1:]):
        g.solid([left[0], right[0], right[1], left[1]], [(0, 1, 2, 3)], [drive_asphalt])
    g.prism(
        [(-2, 0), (0, -3), (36, -6.8), (64, -11.6), (85, -16), (85, -1), (65, 1)],
        -0.02,
        0.006,
        block_paving,
    )

    # The driveway crosses a narrow sidewalk, with grass alongside each entrance.
    def rosen_curb(x):
        return -7.28 - 0.142 * x

    for left, right in ((-26, -10.72), (-4.35, -0.32)):
        g.prism(
            [
                (left, rosen_curb(left) + 1.72),
                (right, rosen_curb(right) + 1.72),
                (right, 4.10),
                (left, 4.10),
            ],
            -0.060,
            0.038,
            grass,
        )
    g.prism(
        [
            (-26, rosen_curb(-26)),
            (-0.32, rosen_curb(-0.32)),
            (-0.32, rosen_curb(-0.32) + 1.72),
            (-26, rosen_curb(-26) + 1.72),
        ],
        -0.053,
        0.012,
        block_paving,
    )
    g.prism(
        [(81.07, 83.45), (90.42, 83.33), (90.54, 85.8), (84.1, 85.4), (81.07, 85.4)],
        -0.024,
        0.020,
        grass,
    )
    # One paved crossing serves both Jagdweg gates and meets the street sidewalk.
    g.prism(
        [
            (81.01, 85.40),
            (84.1, 85.40),
            (90.54, 85.80),
            (92.32, 85.77),
            (92.62, 95.54),
            (81.07, 95.47),
        ],
        -0.045,
        0.023,
        block_paving,
    )
    for inner, outer, start, end in (
        (90.42, 92.32, 82.95, 85.77),
        (90.72, 92.62, 95.54, 103.0),
    ):
        g.prism(
            [(inner, start), (outer, start), (outer + 0.14, end), (inner + 0.14, end)],
            -0.054,
            0.016,
            block_paving,
        )
    g.prism(
        [(85.97, -15.46), (89.81, -15.54), (90.05, -3.08), (86.05, -3.08)],
        -0.04,
        0.033,
        grass,
    )
    g.prism(
        [
            (78.81, -19.80),
            (85.60, -20.07),
            (88.3, -17.42),
            (89.81, -15.54),
            (86.40, -15.40),
            (83.48, -16.42),
            (78.82, -16.65),
        ],
        -0.046,
        0.038,
        grass,
    )
    # One continuous paved standing area underneath both swap bodies and the pallet garden.
    g.prism(
        [
            (65, -8),
            (66.8, -18.3),
            (78.8, -19.7),
            (86.4, -16.2),
            (86.4, -5.8),
            (75, -5.2),
        ],
        -0.02,
        0.028,
        block_paving,
    )
    # Narrow lawn behind the planters, running from the blue bodies to the street corner.
    bike_lawn = [(82.38, -9.91), (86.13, -9.77), (86.62, -15.67),
                 (84.20, -18.50), (82.14, -18.75), (82.24, -14.42)]
    g.prism(bike_lawn, 0.024, 0.047, earth, grass)
    lawn_margin(g, bike_lawn, lambda u, v: 0.047, drop=0.018)
    entrance_terrain(g)
    g.prism(
        [(-7, -3), (-1.8, -3), (-1.0, 70.5), (-6.8, 72.5)], -0.018, 0.01, yard_concrete
    )
    # Longitudinal joints and staggered cross joints in the concrete loading apron.
    for u in (-6.85, -4.42, -2.02):
        g.bar((u, 1.0), (u + 0.12, 70.1), 0.024, 0.010, 0.014, joint)
    for u, offset in ((-6.84, 0.0), (-4.42, 1.73)):
        for v in np.arange(1 + offset, 69.9, 3.6):
            g.bar((u, v), (u + 2.42, v + 0.03), 0.024, 0.010, 0.014, joint)
    g.prism(
        [(36, 94), (51, 94), (54, 105), (40, 107), (36, 104)],
        -0.021,
        0.007,
        yard_concrete,
    )
    # Orthophoto shows distinct lawn strips broken by paved doors, drives and parking bays.
    strips = [
        [(0, -0.4), (3, -0.4), (3, -2.8), (-2, -2.5)],
        [
            (9, -0.7),
            (32, -0.7),
            (32, -5.3),
            (29, -5.3),
            (29, -2.3),
            (13, -2.0),
            (13, -4),
            (9, -3.7),
        ],
        [
            (38, -0.7),
            (62, -0.9),
            (62, -2.65),
            (50, -2.4),
            (50, -5.8),
            (48, -5.3),
            (48, -2.6),
            (38, -2.4),
        ],
    ]
    for ring in strips:
        g.prism(ring, 0.007, 0.038, earth, grass)
        lawn_margin(g, ring, lambda u, v: 0.038, drop=0.024)
    g.box(59, -10.5, 0.013, 74, -0.8, 0.033, block_paving)
    parking = material("Parkplatz | befahrenes Verbundpflaster", "999995")
    photo_surface(parking, "parkplatz-pflaster.jpg", 4.3, 0.88)
    texture_metres[parking] = 1.60
    g.prism(
        [(44, -5.0), (64.8, -5.0), (66.5, -15.6), (46.8, -12.9)], 0.009, 0.045, parking
    )
    for j in range(5):
        x = 51.3 + j * 2.63
        g.box(x, -7.18, 0.046, x + 2.57, -2.52, 0.064, yard_concrete)
        g.box(x + 2.51, -7.18, 0.064, x + 2.57, -2.52, 0.068, frame)
    for x in (45.4, 48.03):
        g.box(x, -10.72, 0.046, x + 2.54, -6.15, 0.064, yard_concrete)
    g.pipe([(60.35, -10.45, 0.046), (60.35, -10.45, 0.054)], 0.28, steel)
    # Recessed drain frames and slots along the concrete/asphalt joint of the loading apron.
    for v in (14.8, 36.4, 58.0):
        u = -6.42
        g.box(u, v, 0.011, u + 0.34, v + 0.52, 0.019, joint)
        for y in np.arange(v + 0.035, v + 0.50, 0.048):
            g.box(u + 0.025, y, 0.018, u + 0.315, y + 0.026, 0.022, steel)
    for i, (u, v) in enumerate(
        (
            (82.7, 4),
            (83.8, 12),
            (82.4, 18),
            (83, 38),
            (84.8, 42),
            (82.2, 59),
            (83.5, 78),
            (10, -2.3),
            (30.8, -3),
            (41, -1.8),
            (48.5, -4),
            (2, -1.6),
        )
    ):
        rng = np.random.default_rng(i + 12)
        for _ in range(7):
            x, y = u + rng.uniform(-0.28, 0.28), v + rng.uniform(-0.24, 0.24)
            broadleaf_rosette(
                g,
                x,
                y,
                verge_height(x, y) if x > 81 else 0.038,
                rng.uniform(0.09, 0.21),
                rng,
            )
    rng = np.random.default_rng(76)
    for u1, u2, v1, v2, num in (
        (81.8, 85.1, 31.5, 81.2, 180),
        (81.9, 85, 1, 21, 76),
        (10, 29, -1.92, -0.83, 54),
    ):
        for _ in range(num):
            u, v = rng.uniform(u1, u2), rng.uniform(v1, v2)
            shoots(
                g,
                u,
                v,
                verge_height(u, v) if u > 81 else 0.038,
                0.11,
                rng.uniform(0.055, 0.19),
                rng,
            )
    g.finish()


def main_door():
    rid = "haupteingang"
    g = Part("Haupteingang | Glasportal, Treppe und Vordach", rid, "access")
    v = local(site["accessPoints"][0]["point"]).y
    x = local(site["accessPoints"][0]["point"]).x
    opening((x, v - 2.95), (x, v + 2.95), 0.08, 8.28)
    for low, high in ((-2.95, -1.44), (1.44, 2.95)):
        glass_face(g, (x - 0.14, v + high), (x - 0.14, v + low), 0.08, 8.30)
    glass_face(g, (x - 0.14, v + 1.44), (x - 0.14, v - 1.44), 3.70, 8.30)
    # Side walls and a landing visible behind the entrance glazing.
    for side in (-1, 1):
        g.box(
            x - 3.65,
            v + side * 2.96 - 0.06,
            1.1,
            x - 0.23,
            v + side * 2.96 + 0.06,
            5.00,
            plaster,
        )
    g.box(x - 3.66, v - 2.97, 1.09, x + 0.12, v + 2.97, 1.36, paver)
    for y in (v - 2.88, v - 1.44, v + 1.44, v + 2.88):
        g.box(x - 0.18, y - 0.045, 1.27, x - 0.09, y + 0.045, 8.42, galv)
    for z in (1.36, 3.7, 5.25, 6.86):
        g.box(x - 0.18, v - 2.94, z, x - 0.09, v + 2.94, z + 0.075, galv)
    for side in (-1, 1):
        leaf = Part("Haupteingang | Glastür " + str(side), rid, "access")
        a, b = (x - 0.14, v + side * 1.40), (x - 0.14, v + side * 0.018)
        glass_face(leaf, a, b, 1.39, 3.65)
        for q in (a, b):
            leaf.box(
                q[0] - 0.034, q[1] - 0.025, 1.39, q[0] + 0.034, q[1] + 0.025, 3.65, galv
            )
        for h in (1.39, 3.59):
            leaf.bar(a, b, 0.066, h, h + 0.062, galv)
        y = v + side * 0.17
        leaf.pipe(
            [
                (x - 0.10, y, 2.08),
                (x + 0.015, y, 2.12),
                (x + 0.015, y, 2.45),
                (x - 0.10, y, 2.49),
            ],
            0.022,
            galv,
        )
        hinged(leaf, a, side * 87)
    g.box(x - 0.05, v - 3.15, 4.13, x + 3.6, v + 3.15, 4.34, white)
    g.box(x + 0.1, v - 2.98, -0.85, x + 1.22, v + 2.98, 1.36, concrete)
    for i in range(8):
        start = x + 1.22 + i * 0.31
        g.box(
            start,
            v - 2.98,
            -0.85,
            start + 0.31,
            v + 2.98,
            1.36 - (i + 1) * 0.15,
            concrete,
        )
    for y in (v - 2.90, v + 2.90):
        for dx, z in ((0.4, 1.36), (1.22, 1.36), (2.46, 0.76), (3.70, 0.16)):
            g.bar((x + dx, y), (x + dx + 0.04, y), 0.05, z, z + 0.93, galv)
        g.pipe(
            [(x + 0.32, y, 2.29), (x + 1.22, y, 2.29), (x + 3.72, y, 1.09)], 0.034, galv
        )
    g.box(x - 0.09, v + 0.92, 1.85, x + 0.03, v + 2.62, 2.97, sill)
    for j in range(3):
        for k in range(3):
            y = v + 1.0 + j * 0.49
            g.box(
                x + 0.03,
                y,
                2.02 + k * 0.31,
                x + 0.045,
                y + 0.40,
                2.043 + k * 0.31,
                steel,
            )
    g.box(x + 0.035, v + 0.85, 2.08, x + 0.08, v + 0.96, 2.23, steel)
    # Freestanding tenant sign by the steps, separate from the mailboxes.
    for y in (v - 5.64, v - 4.18):
        g.bar((x + 2.0, y), (x + 2.05, y), 0.065, verge_height(x + 2, y), 2.65, galv)
    g.box(x + 2.0, v - 5.64, 0.44, x + 2.09, v - 4.18, 2.65, frame)
    g.box(x + 2.09, v - 5.58, 2.21, x + 2.11, v - 4.24, 2.50, oxide)
    g.finish()
    add_sign(
        "Gewerbehof Jagdweg",
        "Jagdweg 1–3",
        (x + 2.12, v - 5.57),
        (x + 2.12, v - 4.25),
        2.37,
        0.15,
        rid,
        kind="access",
    )


def painted_ramp_sign(g, u, v, z):
    # Front elevation in signboard coordinates, redrawn from the two-colour painted script.
    indigo = material("Vereinsschild | tiefblauer Schriftzug", "252268", roughness=0.78)
    cyan = material("Vereinsschild | hellblaues e.V.", "308ab0", roughness=0.77)
    enamel = material("Vereinsschild | mattweißes Blech", "edece5", 0.08, 0.66)
    width, height = 1.46, 0.51
    g.box(
        u - width / 2,
        v,
        z - height / 2,
        u + width / 2,
        v + 0.031,
        z + height / 2,
        enamel,
    )
    g.box(
        u - width / 2,
        v - 0.006,
        z - height / 2,
        u + width / 2,
        v + 0.033,
        z - height / 2 + 0.012,
        sill,
    )
    for x in (u - width / 2 + 0.043, u + width / 2 - 0.043):
        g.box(x - 0.017, v + 0.033, z + 0.175, x + 0.017, v + 0.07, z + 0.345, galv)
        for h in (-0.207, 0.216):
            g.pipe([(x, v - 0.002, z + h), (x, v - 0.010, z + h)], 0.010, galv)
            g.box(
                x - 0.006,
                v - 0.011,
                z + h - 0.0012,
                x + 0.006,
                v - 0.010,
                z + h + 0.0012,
                steel,
            )

    def stroke(start, segments, radius, ink):
        # Flat ribbons keep the lettering painted on the sheet even at grazing angles.
        points = [Vector(start)]
        for curve in segments:
            a = points[-1]
            b, c, d = (Vector(curve[i : i + 2]) for i in (0, 2, 4))
            for i in range(1, 9):
                t = i / 8
                points.append(
                    (1 - t) ** 3 * a
                    + 3 * (1 - t) ** 2 * t * b
                    + 3 * (1 - t) * t * t * c
                    + t**3 * d
                )

        def board(p):
            return (
                u + (p.x / 520 - 0.5) * width,
                v - 0.0045,
                z + (0.5 - p.y / 205) * height,
            )

        verts, faces = [], []
        for i, p in enumerate(points):
            tangent = (
                points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]
            ).normalized()
            normal = Vector((-tangent.y, tangent.x)) * radius
            verts.extend((board(p - normal), board(p + normal)))
            if i:
                faces.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
        g.solid(verts, faces, [ink] * len(faces))
        for end in (points[0], points[-1]):
            ring = [
                board(
                    end
                    + radius
                    * Vector((math.cos(i * math.tau / 12), math.sin(i * math.tau / 12)))
                )
                for i in range(12)
            ]
            g.solid(ring, [tuple(reversed(range(12)))], [ink])

    # K with its high diagonal, then the connected sequence of loops and long g descender.
    stroke((49, 30), [(46, 66, 50, 115, 54, 148)], 6, indigo)
    stroke((94, 21), [(79, 31, 66, 63, 53, 80), (75, 80, 78, 104, 81, 142)], 6, indigo)
    stroke(
        (121, 96),
        [
            (102, 81, 83, 113, 91, 132),
            (97, 148, 115, 128, 121, 98),
            (117, 115, 119, 135, 127, 133),
            (131, 119, 134, 103, 138, 95),
            (135, 103, 133, 119, 134, 129),
            (150, 96, 164, 87, 163, 105),
            (160, 119, 153, 134, 166, 129),
            (171, 126, 177, 117, 181, 110),
        ],
        5.5,
        indigo,
    )
    stroke(
        (209, 91),
        [
            (196, 87, 175, 100, 172, 119),
            (169, 140, 198, 126, 207, 99),
            (202, 121, 197, 150, 181, 164),
            (163, 180, 162, 152, 190, 140),
            (211, 131, 219, 104, 231, 82),
            (250, 41, 247, 14, 235, 37),
            (219, 61, 211, 101, 216, 125),
            (220, 138, 230, 135, 241, 122),
        ],
        5.7,
        indigo,
    )
    stroke(
        (267, 98),
        [
            (250, 83, 229, 114, 236, 128),
            (245, 145, 262, 120, 265, 100),
            (263, 108, 271, 103, 278, 100),
            (274, 111, 272, 123, 273, 131),
            (286, 107, 301, 87, 299, 103),
            (298, 113, 292, 126, 294, 130),
            (307, 110, 321, 94, 320, 107),
            (318, 120, 312, 135, 322, 123),
        ],
        5.3,
        indigo,
    )
    stroke(
        (322, 123),
        [
            (334, 119, 349, 93, 341, 89),
            (333, 85, 322, 102, 322, 120),
            (324, 144, 344, 125, 355, 109),
            (363, 98, 364, 94, 363, 88),
            (363, 98, 370, 102, 377, 99),
            (371, 106, 364, 123, 371, 128),
        ],
        5.4,
        indigo,
    )
    stroke(
        (409, 97),
        [
            (394, 86, 377, 103, 375, 122),
            (374, 142, 397, 129, 407, 100),
            (399, 127, 401, 137, 413, 123),
            (429, 106, 442, 64, 447, 27),
            (440, 48, 424, 100, 423, 125),
            (423, 133, 428, 133, 432, 127),
        ],
        5.6,
        indigo,
    )
    stroke((413, 101), [(427, 99, 442, 97, 455, 97)], 4.1, indigo)
    stroke(
        (417, 153),
        [
            (428, 151, 442, 135, 435, 129),
            (427, 121, 413, 143, 414, 157),
            (414, 178, 430, 183, 444, 167),
        ],
        5.1,
        cyan,
    )
    stroke(
        (463, 124),
        [(463, 138, 461, 159, 464, 178), (479, 163, 494, 131, 505, 116)],
        5.7,
        cyan,
    )
    for x, y in ((451, 174), (500, 150)):
        stroke((x, y), [(x + 0.5, y, x + 1, y, x + 1.2, y)], 2.3, cyan)


def ramp_pocket(g, x, y, z, seed):
    # Black tapered pockets with an exposed soil surface and a folded rim.
    vertices = [
        (x + sx * rx, y + sy * ry, z + h)
        for rx, ry, h in (
            (0.095, 0.084, 0),
            (0.135, 0.122, 0.207),
            (0.142, 0.130, 0.219),
            (0.128, 0.115, 0.219),
            (0.117, 0.105, 0.193),
        )
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))
    ]
    faces = [
        (k * 4 + j, k * 4 + (j + 1) % 4, (k + 1) * 4 + (j + 1) % 4, (k + 1) * 4 + j)
        for k in range(4)
        for j in range(4)
    ]
    g.solid(vertices, faces + [(16, 17, 18, 19)], [boxpaint] * len(faces) + [earth])
    rng = np.random.default_rng(seed)
    for j in range(3 + seed % 5):
        az = math.tau * (j * 0.618 + rng.uniform(-0.13, 0.13))
        start = Vector(
            (x + rng.uniform(-0.065, 0.065), y + rng.uniform(-0.058, 0.058), z + 0.194)
        )
        along = Vector((math.cos(az), math.sin(az), 0))
        side = Vector((-along.y, along.x, 0))
        length = rng.uniform(0.066, 0.128)
        top = start + along * length + Vector((0, 0, rng.uniform(0.072, 0.247)))
        g.pipe([start, top], 0.0027, foliage)
        for k in range(3):
            base = start.lerp(top, 0.37 + k * 0.28)
            direction = (along + side * (1 if k % 2 else -1) * 0.81).normalized()
            across = Vector((-direction.y, direction.x, 0))
            mid = base + direction * 0.044 + Vector((0, 0, 0.027))
            tip = base + direction * rng.uniform(0.075, 0.124) + Vector((0, 0, 0.019))
            ridge = mid + Vector((0, 0, 0.008))
            g.solid(
                [base, mid - across * 0.022, tip, mid + across * 0.022, ridge],
                [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)],
                [foliage, foliage, leaf, leaf],
            )


def ramp_entry():
    rid = "rollstuhlrampe"
    g = Part("Rollstuhlrampe | blaue Tür, Metallrost und Pflanztaschen", rid, "access")
    u, v = local(site["accessPoints"][1]["point"])
    v -= 0.10
    # The white inner face of the blue door folds back on the right jamb (IMG_6300).
    opening(
        (u - 0.57, shop_wall(u - 0.57)), (u + 0.57, shop_wall(u + 0.57)), 1.12, 3.29
    )
    for side in (-0.59, 0.59):
        g.box(
            u + side - 0.044, v - 0.076, 1.12, u + side + 0.044, v + 0.17, 3.31, cobalt
        )
    g.box(u - 0.64, v - 0.076, 3.26, u + 0.64, v + 0.17, 3.40, cobalt)
    g.box(u - 0.58, v - 0.19, 1.103, u + 0.58, v + 2.75, 1.155, galv)
    hinge, tip = Vector((u + 0.53, v + 0.07)), Vector((u + 0.37, v + 1.12))
    leaf = Part("Rampenportal | Türblatt", rid, "access")
    leaf.bar(hinge, tip, 0.055, 1.17, 3.22, cobalt)
    offset = Vector((-0.030, -0.005))
    leaf.bar(hinge + offset, tip + offset, 0.012, 1.19, 3.20, white)
    latch = hinge.lerp(tip, 0.87) + offset
    leaf.pipe(
        [
            (*latch, 2.15),
            (latch.x - 0.062, latch.y, 2.15),
            (latch.x - 0.062, latch.y - 0.11, 2.15),
        ],
        0.010,
        galv,
    )
    hinged(leaf, hinge, 81.34, True)
    g.box(u - 0.8, v + 2.70, 1.15, u + 0.80, v + 2.77, 3.34, brown)
    g.slope((u, v - 1.26), (u, v + 0.05), 1.88, 3.76, 3.92, 0.075, roof)
    g.box(u - 0.95, v - 1.28, 3.68, u + 0.95, v - 1.24, 3.78, galv)
    for x in (u - 0.86, u + 0.86):
        g.box(x - 0.015, v - 1.19, 3.64, x + 0.015, v + 0.02, 3.70, steel)
    painted_ramp_sign(g, u, v - 1.18, 3.39)
    # Partly closed venetian blind beside the door, with a blue head rail and a cellar window.
    g.box(u - 4.08, v - 0.02, 1.53, u - 1.12, v + 0.10, 3.37, cobalt)
    blind = material("Rampenportal | verschattete Jalousie", "62666c", 0.34)
    for j in range(20):
        g.box(
            u - 4.00,
            v - 0.045,
            1.75 + j * 0.078,
            u - 1.20,
            v - 0.01,
            1.80 + j * 0.078,
            blind,
        )
    g.box(u - 3.42, v - 0.02, 0.28, u - 1.48, v + 0.10, 0.64, cobalt)
    g.box(u - 3.3, v - 0.045, 0.34, u - 1.6, v - 0.008, 0.58, pane)
    for x in (u - 0.91, u + 0.87):
        g.pipe(
            [(x, v - 1.13, 3.69), (x, v - 1.13, 2.7), (x, v - 0.06, 2.46)], 0.029, galv
        )
    g.box(u + 0.81, v - 0.05, 1.64, u + 1.64, v + 0.02, 3.12, cobalt)
    g.box(u + 0.89, v - 0.072, 1.74, u + 1.52, v - 0.045, 3.02, pane)
    g.box(u + 0.86, v - 0.09, 2.11, u + 1.58, v - 0.072, 2.18, cobalt)
    for x in (u - 0.78, u + 0.78):
        g.pipe([(x, v - 1.14, 1.19), (x, v - 1.14, 3.68)], 0.027, galv)
        for h in (2.11, 3.16, 3.60):
            g.pipe([(x, v - 1.14, h), (x, v - 1.14, h + 0.046)], 0.040, sill)
    # Three runs connect the entrance, corner landing and switchback on the parking side.
    # Falling height follows the photo; these are visual estimates, not a surveyed gradient.
    w = 1.32

    def run(a, b, z1, z2, rails):
        a, b = Vector(a), Vector(b)
        delta = b - a
        n = Vector((-delta.y, delta.x)).normalized()
        # Perforated steel planks: continuous webs around real slots, so small holes
        # stay open without drawing overlapping coplanar quads at the junctions.
        rows = math.ceil(delta.length / 0.068)
        cols = 19
        deck_vertices, deck_faces = [], []
        for row in range(rows):
            t0 = row / rows
            t1 = (row + 0.52) / rows
            t2 = (row + 1) / rows

            def patch(lo, hi, ta, tb):
                start = len(deck_vertices)
                for off, t in ((lo, ta), (lo, tb), (hi, tb), (hi, ta)):
                    deck_vertices.append(
                        (*(a + t * delta + n * off), z1 + t * (z2 - z1))
                    )
                deck_faces.append((start, start + 1, start + 2, start + 3))

            patch(-w / 2, w / 2, t1, t2)
            pitch = w / cols
            for col in range(cols + 1):
                center = col * pitch - w / 2
                patch(
                    max(-w / 2, center - pitch * 0.33),
                    min(w / 2, center + pitch * 0.33),
                    t0,
                    t1,
                )
        g.solid(deck_vertices, deck_faces, [galv] * len(deck_faces))
        for off in (-w / 2 + 0.15, 0, w / 2 - 0.15):
            g.slope(
                a + n * off, b + n * off, 0.034, z1 - 0.033, z2 - 0.033, 0.078, steel
            )
        for sign in rails:
            off = n * sign * w / 2
            g.slope(a + off, b + off, 0.075, z1 + 0.095, z2 + 0.095, 0.21, yellow)
            for h in (0.54, 0.96):
                g.pipe([(*(a + off), z1 + h), (*(b + off), z2 + h)], 0.026, galv)
            count = math.ceil(delta.length / 1.65)
            for i in range(count + 1):
                t = i / count
                p = a + t * delta + off
                z = z1 + t * (z2 - z1)
                g.pipe([(*p, 0.07), (*p, z + 1.04)], 0.027, galv)
                for h in (0.54, 0.96):
                    g.pipe([(*p, z + h - 0.025), (*p, z + h + 0.025)], 0.042, sill)
                # Screw jack and collar below the galvanized standard.
                g.pipe([(*p, 0.075), (*p, 0.24)], 0.019, steel)
                g.pipe([(*p, 0.19), (*p, 0.216)], 0.054, sill)
                if i and i % 2:
                    previous = a + ((i - 1) / count) * delta + off
                    g.pipe(
                        [
                            (*previous, z1 + ((i - 1) / count) * (z2 - z1) + 0.16),
                            (*p, z + 0.93),
                        ],
                        0.021,
                        galv,
                    )
                g.box(
                    p.x - 0.08, p.y - 0.08, 0.04, p.x + 0.08, p.y + 0.08, 0.075, steel
                )

    y = v - 4.66
    run((u, v - 0.12), (u, y + w / 2), 1.15, 0.79, [-1, 1])
    for step in np.linspace(-w / 2 + 0.014, w / 2 - 0.014, 26):
        g.box(
            u + step - 0.005, y - w / 2, 0.75, u + step + 0.005, y + w / 2, 0.79, galv
        )
    for step in np.linspace(-w / 2, w / 2, 15):
        g.box(
            u - w / 2, y + step - 0.008, 0.73, u + w / 2, y + step + 0.008, 0.78, sill
        )
    for a, b in [
        ((u - w / 2, y + w / 2), (u - w / 2, y - w / 2)),
        ((u - w / 2, y - w / 2), (u + w / 2, y - w / 2)),
    ]:
        g.bar(a, b, 0.075, 0.66, 0.88, yellow)
        for h in (0.54, 0.96):
            g.pipe([(*a, 0.79 + h), (*b, 0.79 + h)], 0.026, galv)
    turn = u + 8.25
    run((u + w / 2, y), (turn, y), 0.79, 0.45, [-1, 1])
    lower = y - w - 0.12
    g.box(turn, lower - w / 2, 0.38, turn + 1.55, y + w / 2, 0.45, galv)
    for a, b in [
        ((turn, y + w / 2), (turn + 1.55, y + w / 2)),
        ((turn + 1.55, y + w / 2), (turn + 1.55, lower - w / 2)),
        ((turn + 1.55, lower - w / 2), (turn, lower - w / 2)),
    ]:
        g.bar(a, b, 0.066, 0.37, 0.535, yellow)
        for h in (0.99, 1.41):
            g.pipe([(*a, h), (*b, h)], 0.026, galv)
        g.pipe([(*b, 0.04), (*b, 1.42)], 0.027, galv)
    foot = u + 1.20
    run((turn, lower), (foot, lower), 0.45, 0.09, [-1, 1])

    a, b = Vector((foot, lower)), Vector((foot - 0.57, lower))
    g.slope(a, b, w, 0.09, 0.036, 0.014, galv)
    for j in range(7):
        for k in range(15):
            x, off = a.x - (j + 0.5) * 0.080, (k - 7) * 0.083
            z = 0.091 + (x - a.x) * 0.054 / 0.57
            slant = 0.011 if (j + k) % 2 else -0.011
            g.slope(
                (x - 0.021, lower + off - slant),
                (x + 0.021, lower + off + slant),
                0.008,
                z + 0.004,
                z,
                0.004,
                sill,
            )
    # Galvanized rainwater downpipe and the small red-capped alarm on the projecting wing.
    corner_x, corner_y = outline[11]
    g.pipe(
        [
            (corner_x - 0.09, corner_y - 0.14, 0.18),
            (corner_x - 0.09, corner_y - 0.14, 4.92),
        ],
        0.068,
        sill,
    )
    for z in (0.6, 2.4, 4.64):
        g.pipe(
            [
                (corner_x - 0.09, corner_y - 0.14, z),
                (corner_x - 0.09, corner_y - 0.14, z + 0.04),
            ],
            0.077,
            galv,
        )
    g.box(
        corner_x - 0.13,
        corner_y - 2.32,
        3.46,
        corner_x - 0.02,
        corner_y - 2.11,
        3.72,
        white,
    )
    g.box(
        corner_x - 0.11,
        corner_y - 2.28,
        3.72,
        corner_x - 0.04,
        corner_y - 2.15,
        3.78,
        oxide,
    )
    # Three arrays of stacked black plant pockets on the outside of the grating.
    for row, (x, y0, dx, dy) in enumerate(
        (
            (u - 0.76, v - 0.98, 0, -1),
            (u - 0.76, v - 2.75, 0, -1),
            (u + 1.15, y - 0.76, 1, 0),
        )
    ):
        for j in range(5):
            for k in range(2):
                xx = x + dx * 0.29 * j
                yy = y0 + dy * 0.29 * j
                bottom = 1.43 - 0.08 * j * abs(dy) - 0.09 * row + k * 0.24
                ramp_pocket(g, xx, yy, bottom, j + row * 5 + k * 15)
        # The horizontal timber cleats take the weight of each row of pockets.
        for h in (1.50 - 0.09 * row, 1.73 - 0.09 * row):
            a = Vector((x + 0.10 * abs(dy), y0 + 0.10 * abs(dx)))
            b = a + Vector((dx, dy)) * 1.27
            g.slope(a, b, 0.055, h, h - 0.31 * abs(dy), 0.082, wood)
        # Timber backing brackets below the pockets.
        for j in (1, 4):
            xx = x + dx * 0.29 * j
            yy = y0 + dy * 0.29 * j
            inside = Vector((abs(dy), abs(dx)))
            along = Vector((dx, dy))
            top = 1.51 - 0.09 * row - 0.08 * j * abs(dy)
            side = Vector((xx, yy))
            tri = [
                (side + inside * 0.19, top - 0.44),
                (side + inside * 0.19, top),
                (side - inside * 0.12, top),
            ]
            g.solid(
                [
                    (*(q + along * thickness), z)
                    for thickness in (-0.018, 0.018)
                    for q, z in tri
                ],
                [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)],
                [ply] * 5,
            )
    g.finish()


def shop_entries():
    rid = "geschaeftstreppen"
    g = Part("Rosenstraße | Ladenportale mit Außentreppen", rid, "access")
    for x, name in zip(shop_centres, ("elwano", "92")):
        y = shop_wall(x) - 0.12
        z = 0.91
        opening(
            (x - 1.20, shop_wall(x - 1.20)), (x + 1.20, shop_wall(x + 1.20)), z, 3.64
        )
        inset = y + 0.30
        for lo, hi in ((-1.17, -0.66), (0.66, 1.17)):
            glass_face(g, (x + lo, inset), (x + hi, inset), z + 0.04, 3.53)
        glass_face(g, (x - 0.66, inset), (x + 0.66, inset), 3.03, 3.53)
        leaf = Part("Ladenportal | Glastür " + name, rid, "access")
        glass_face(leaf, (x - 0.62, inset), (x + 0.62, inset), z + 0.045, 3.01)
        for dx in (-0.62, 0.62):
            leaf.box(
                x + dx - 0.022,
                inset - 0.032,
                z + 0.04,
                x + dx + 0.022,
                inset + 0.032,
                3.01,
                galv,
            )
        for dx in (-1.16, -0.66, 0.66, 1.16):
            g.box(
                x + dx - 0.032,
                inset - 0.045,
                z,
                x + dx + 0.032,
                inset + 0.046,
                3.58,
                galv,
            )
        for h in (z, 3.01, 3.51):
            g.box(x - 1.20, inset - 0.05, h, x + 1.20, inset + 0.05, h + 0.067, frame)
        leaf.box(
            x - 0.61, inset - 0.035, z + 0.07, x + 0.61, inset + 0.038, z + 0.34, navy
        )
        leaf.pipe(
            [
                (x + 0.49, inset - 0.04, 1.69),
                (x + 0.49, inset - 0.12, 1.72),
                (x + 0.49, inset - 0.12, 2.10),
                (x + 0.49, inset - 0.04, 2.13),
            ],
            0.022,
            galv,
        )
        hinged(leaf, (x - 0.62, inset), 87)
        g.box(x - 1.74, y - 1.55, 3.91, x + 1.74, y + 0.20, 4.08, roof)
        g.box(x - 1.75, y - 1.58, 3.86, x + 1.75, y - 1.52, 4.10, galv)
        for dx in (-1.28, 1.28):
            g.pipe([(x + dx, y - 0.04, 3.36), (x + dx, y - 1.28, 3.90)], 0.035, galv)
        g.box(x - 1.48, y - 1.13, 0.019, x + 1.48, y + 0.14, z, concrete)
        for i in range(5):
            y0 = y - 1.13 - (i + 1) * 0.31
            height = z - (i + 1) * (z - 0.037) / 6
            g.box(x - 1.48, y0, 0.018, x + 1.48, y0 + 0.31, height, concrete)
            g.box(x - 1.48, y0, height, x + 1.48, y0 + 0.06, height + 0.009, paver)
        for dx in (-1.46, 1.46):
            for off, h in ((0.39, z), (1.13, z), (2.61, 0.18)):
                g.box(
                    x + dx - 0.027,
                    y - off - 0.027,
                    h,
                    x + dx + 0.027,
                    y - off + 0.027,
                    h + 0.87,
                    galv,
                )
            g.pipe(
                [
                    (x + dx, y - 0.30, z + 0.87),
                    (x + dx, y - 1.13, z + 0.87),
                    (x + dx, y - 2.72, 1.01),
                ],
                0.027,
                galv,
            )
        g.box(x - 1.08, y - 0.155, 3.15, x + 1.08, y - 0.11, 3.66, white)
        add_sign(
            "Ladenportal Rosenstraße " + name,
            name,
            (x - 1, y - 0.16),
            (x + 1, y - 0.16),
            3.40,
            0.30,
            rid,
            kind="access",
            ink=cobalt,
        )
    g.finish()


def barred_panel(g, a, b, height, finish=galv, bottom=0.12):
    """Welded frame with closely spaced upright bars, oriented between its ends."""
    a, b = Vector(a), Vector(b)
    tangent = (b - a).normalized()
    for z in (bottom, height - 0.064):
        g.bar(a, b, 0.055, z, z + 0.064, finish)
    count = math.ceil((b - a).length / 0.12)
    for i in range(count + 1):
        center = a.lerp(b, i / count)
        half = 0.023 if i in (0, count) else 0.009
        g.bar(
            center - tangent * half,
            center + tangent * half,
            0.044 if i in (0, count) else 0.018,
            bottom + 0.064,
            height - 0.064,
            finish,
        )


def rosenstrasse_gate():
    rid = "hoftor-rosenstrasse"
    g = Part(
        "Rosenstraße | zurückgeschobenes Hoftor und feste Zaunfelder", rid, "access"
    )
    u, v = local(next(e["point"] for e in site["accessPoints"] if e["id"] == rid))
    half = 2.96
    left, right = u - half, u + half
    # The sliding leaf is parked along the left boundary. Only the flush runner crosses the drive.
    g.box(left - 6.20, v - 0.035, 0.025, right + 0.12, v + 0.035, 0.037, sill)
    g.prism(
        [
            (left - 0.26, -7.28 - 0.142 * (left - 0.26)),
            (right + 0.26, -7.28 - 0.142 * (right + 0.26)),
            (right + 0.18, v + 2.1),
            (left - 0.18, v + 2.1),
        ],
        -0.036,
        0.022,
        block_paving,
    )
    parked = left - 0.19
    barred_panel(g, (parked - 2 * half, v), (parked, v), 1.62)
    for x in (parked - 2 * half + 0.35, parked - 0.35):
        g.box(x - 0.075, v - 0.050, 0.045, x + 0.075, v + 0.050, 0.125, steel)
    for x in (left - 0.09, right + 0.09, -0.42):
        g.box(x - 0.06, v - 0.15, 0.023, x + 0.06, v - 0.03, 1.66, galv)
    barred_panel(g, (right + 0.15, v - 0.09), (-0.42, v - 0.09), 1.55)
    # Street-facing notice boards and mailboxes visible beside the entrance to No. 92.
    for x, z, w, h, finish in [
        (right + 0.86, 1.07, 0.95, 0.35, white),
        (right + 1.40, 0.63, 1.38, 0.39, white),
    ]:
        g.box(x - w / 2, v - 0.15, z, x + w / 2, v - 0.12, z + h, finish)
        g.box(
            x - w / 2 + 0.02,
            v - 0.159,
            z + h - 0.075,
            x + w / 2 - 0.02,
            v - 0.15,
            z + h - 0.025,
            oxide,
        )
    for x in (left - 0.75, left - 1.48):
        g.box(x - 0.027, v - 0.61, 0.018, x + 0.027, v - 0.56, 1.0, galv)
        g.box(x - 0.20, v - 0.66, 0.85, x + 0.20, v - 0.52, 1.16, frame)
        g.box(x - 0.145, v - 0.668, 1.074, x + 0.145, v - 0.66, 1.096, steel)
    g.finish()


def side_entry():
    rid = "seiteneingang-jagdweg"
    g = Part(
        "Jagdweg | kleines Eingangshäuschen und überdachter Durchgang", rid, "access"
    )
    # North end of the street wing. The roof covers both the booth and a clear pedestrian lane.
    front, back = 80.84, 71.60
    wall, booth_end, roof_end = 83.40, 86.92, 90.14
    g.box(
        back - 0.60,
        wall - 0.02,
        0.018,
        front + 3.15,
        roof_end + 0.60,
        0.064,
        block_paving,
    )
    # A low plinth under the windows leaves the booth floor and door passage clear.
    g.box(front - 0.16, wall - 0.08, 0.064, front, booth_end, 0.92, plaster)
    g.box(back, wall - 0.08, 0.064, front, wall + 0.08, 0.92, plaster)
    g.box(back, wall, 0.064, back + 0.15, booth_end, 0.92, plaster)
    jamb, latch = back + 0.20, back + 1.24
    g.box(latch, booth_end - 0.18, 0.064, front, booth_end, 0.92, plaster)
    g.box(jamb - 0.06, booth_end - 0.18, 0.064, jamb, booth_end, 2.28, cobalt)
    glass_face(
        g, (front - 0.09, booth_end - 0.1), (front - 0.09, wall + 0.04), 0.93, 2.78
    )
    glass_face(
        g,
        (front - 3.45, booth_end - 0.10),
        (front - 0.09, booth_end - 0.10),
        0.93,
        2.78,
    )
    g.box(back, wall, 0.92, back + 0.15, booth_end, 2.79, plaster)
    g.box(front - 1.42, wall + 0.15, 1.01, front - 0.19, booth_end - 0.27, 1.10, wood)
    g.box(front - 0.18, wall, 0.86, front + 0.08, booth_end + 0.06, 0.99, sill)
    g.box(latch, booth_end - 0.18, 0.86, front, booth_end + 0.06, 0.99, sill)
    g.box(latch, booth_end - 0.18, 0.97, front - 3.45, booth_end, 2.80, plaster)
    g.box(back, booth_end - 0.18, 2.29, latch, booth_end, 2.80, plaster)
    for u in (front - 3.45, front - 2.30, front - 1.15, front):
        g.box(
            u - 0.045,
            booth_end - 0.04,
            0.97,
            u + 0.045,
            booth_end + 0.055,
            2.80,
            cobalt,
        )
    for v in (wall + 0.08, wall + 1.16, wall + 2.25, booth_end - 0.02):
        g.box(front - 0.035, v - 0.048, 0.97, front + 0.06, v + 0.048, 2.81, cobalt)
    for h in (1.35, 2.70):
        g.box(front, wall, h, front + 0.07, booth_end, h + 0.075, cobalt)
        g.box(front - 3.45, booth_end, h, front, booth_end + 0.06, h + 0.075, cobalt)
    door = Part("Jagdweg | Tür am Eingangshäuschen", rid, "access")
    door.box(jamb, booth_end, 0.068, latch, booth_end + 0.06, 0.77, cobalt)
    for x in (jamb, latch - 0.08):
        door.box(x, booth_end, 0.77, x + 0.08, booth_end + 0.06, 2.29, cobalt)
    door.box(jamb, booth_end, 2.19, latch, booth_end + 0.06, 2.29, cobalt)
    door.box(jamb + 0.08, booth_end + 0.02, 0.77, latch - 0.08, booth_end + 0.04, 2.19, pane)
    hinged(door, (jamb + 0.02, booth_end + 0.03), -85)
    g.box(back - 0.28, wall - 0.10, 2.80, front + 0.57, roof_end, 3.06, plaster)
    g.box(back - 0.32, wall - 0.11, 3.06, front + 0.61, roof_end + 0.06, 3.15, membrane)
    for u in (back + 0.2, front + 0.18):
        g.box(
            u - 0.095,
            roof_end - 0.25,
            0.064,
            u + 0.095,
            roof_end - 0.05,
            2.80,
            concrete,
        )
    # OSM gate nodes 7122910892 and 11264589295 locate the driveway and 1.30 m wicket.
    # Inward-opening leaves park along the sides of the lane, with the booth on the left.
    for hinge_y, length, side in (
        (89.84, 2.62, 1),
        (95.19, 2.62, -1),
        (87.22, 1.30, 1),
    ):
        hinge = Vector((80.84, hinge_y))
        g.box(
            hinge.x - 0.065,
            hinge.y - 0.065,
            0.028,
            hinge.x + 0.065,
            hinge.y + 0.065,
            1.65,
            navy,
        )
        start = hinge + Vector((-0.07, side * 0.074))
        end = start + Vector((-length, side * 0.12))
        leaf = Part("Jagdweg | Torflügel " + str(hinge_y), rid, "access")
        barred_panel(leaf, start, end, 1.49, bottom=0.15)
        turn = -side * math.degrees(math.atan2(length, 0.12))
        hinged(leaf, start, turn, True)["doorNoun"] = "Tor"
        for z in (0.30, 1.31):
            g.pipe([(*start, z), (*start, z + 0.10)], 0.030, steel)
    g.box(80.78, 88.61, 0.065, 80.90, 88.72, 1.46, navy)
    g.prism(
        [(77.7, 90.18), (85.1, 90.14), (85.3, 95.38), (77.7, 95.56)],
        -0.04,
        0.028,
        block_paving,
    )
    # The directory stands on the approach in front of the booth, next to the open lane.
    u, v = 83.05, 84.84
    for dy in (-0.78, 0.78):
        g.box(u - 0.025, v + dy - 0.031, 0.015, u + 0.045, v + dy + 0.031, 2.28, galv)
    g.box(u - 0.055, v - 0.75, 0.43, u + 0.035, v + 0.75, 2.19, frame)
    g.box(u + 0.035, v - 0.73, 1.83, u + 0.055, v + 0.73, 1.99, oxide)
    for h in np.arange(0.56, 1.79, 0.17):
        g.box(u + 0.035, v - 0.72, h, u + 0.055, v + 0.72, h + 0.012, sill)
    add_sign(
        "Wegweiser | Gewerbehof",
        "Gewerbehof Jagdweg 1–3",
        (u + 0.07, v - 0.69),
        (u + 0.07, v + 0.69),
        2.08,
        0.088,
        rid,
        kind="access",
        ink=navy,
    )
    g.finish()


metal_module = runpy.run_path(str(root / "scripts/rosenwerk/metal_workshop.py"))
metal_details = metal_module["load_details"](
    material, root / "assets/rosenwerk/materialien/metallwerkstatt.jpg"
)


def loading_dock():
    rid = "lkw-laderampe"
    g = Part("LKW-Laderampe | Ladekante, Auffahrt und hintere Treppe", rid, "access")
    start, end = dock_start, dock_end
    deck_z = 1.20
    stairs_at = end + 0.90

    def edge(v):
        return -2.30 + 0.87 * (v - start) / (end - start)

    def strip(v1, v2, inner, outer=0):
        return [
            (edge(v1) + outer, v1),
            (inner, v1),
            (inner, v2),
            (edge(v2) + outer, v2),
        ]

    g.prism(strip(start, end, dock_wall), 0.012, deck_z - 0.07, concrete)
    g.prism(strip(start, end, dock_wall), deck_z - 0.07, deck_z, paver)
    g.bar((edge(start), start), (edge(end), end), 0.065, 1.10, 1.205, steel)
    for v in np.arange(start + 3.25, end, 4.1):
        g.box(edge(v) + 0.04, v, 1.20, dock_wall - 0.03, v + 0.019, 1.204, sill)

    # The approach runs outside the south wing. Its top meets the open end of the platform.
    toe, x, width = 7.85, -1.14, 1.94
    g.slope((x, toe), (x, start), width, 0.034, deck_z, 0, concrete, base_height=0.008)
    rail_x = x - width / 2 + 0.04
    g.slope((rail_x, toe), (rail_x, start), 0.09, 0.115, deck_z + 0.08, 0.085, concrete)
    for h in (0.49, 0.95):
        g.pipe(
            [
                (rail_x, toe - 0.18, 0.034 + h),
                (rail_x, toe, 0.034 + h),
                (rail_x, start, deck_z + h),
                (rail_x, start + 0.85, deck_z + h),
            ],
            0.032,
            galv,
        )
    for v in (toe, toe + 2.1, toe + 4.2, toe + 6.3, start, start + 0.80):
        z = 0.034 + min(1, (v - toe) / (start - toe)) * (deck_z - 0.034)
        g.box(rail_x - 0.03, v - 0.03, z, rail_x + 0.03, v + 0.03, z + 0.96, galv)
    # A separate pair of narrow open steel flights projects into the yard by the workshop gates.
    # Its upper ends meet the platform; the stairs do not split the longitudinal walkway.
    v_step = 33.7
    x_top = edge(v_step) - 0.025
    oxide_steel = material("Laderampe | bewitterter Stahl", "745c4d", 0.34)
    for y0 in (v_step - 0.91, v_step + 0.015):
        y1 = y0 + 0.89
        for k in range(6):
            x1 = x_top - (k + 1) * 0.265
            h = deck_z - (k + 1) * (deck_z - 0.022) / 7
            g.box(x1, y0, h - 0.04, x1 + 0.265, y1, h, oxide_steel)
            for j in range(4):
                g.box(
                    x1 + j * 0.061,
                    y0 + 0.015,
                    h,
                    x1 + j * 0.061 + 0.012,
                    y1 - 0.015,
                    h + 0.009,
                    sill,
                )
        for y in (y0, y1):
            g.slope(
                (x_top - 1.61, y), (x_top, y), 0.053, 0.09, deck_z, 0.095, oxide_steel
            )
            for x, h in ((x_top - 1.53, 0.19), (x_top, deck_z)):
                g.box(
                    x - 0.016,
                    y - 0.02,
                    h - 0.075,
                    x + 0.016,
                    y + 0.02,
                    h + 0.80,
                    oxide_steel,
                )
            g.pipe(
                [
                    (x_top - 1.59, y, 0.96),
                    (x_top, y, deck_z + 0.80),
                    (x_top + 0.19, y, deck_z + 0.80),
                ],
                0.021,
                oxide_steel,
            )
    # The worn diagonal markings follow the load face and continue over the steel lip.
    rng = np.random.default_rng(8440)
    for v in np.arange(23.90, 38.1, 0.26):
        w = rng.uniform(0.08, 0.13)
        if rng.random() < 0.08:
            continue

        def front_edge(y, z):
            return (edge(y) - 0.036, y, z)

        g.solid(
            [
                front_edge(v, 1.109),
                front_edge(v + w, 1.109),
                front_edge(v + w + 0.067, 1.191),
                front_edge(v + 0.067, 1.191),
            ],
            [(3, 2, 1, 0)],
            [yellow],
        )
        g.solid(
            [
                (edge(v) - 0.035, v, 1.206),
                (edge(v) + 0.034, v + 0.04, 1.206),
                (edge(v) + 0.034, v + w + 0.04, 1.206),
                (edge(v) - 0.035, v + w, 1.206),
            ],
            [(0, 1, 2, 3)],
            [yellow],
        )
    # Flush loading plates sit in the concrete deck, with visible angles and recessed handles.
    for v in (27.20, 32.00, 38.50):
        x = edge(v)
        g.box(x + 0.08, v - 1.11, 1.2005, x + 2.02, v + 1.11, 1.205, oxide_steel)
        g.box(x + 0.113, v - 1.08, 1.205, x + 1.985, v + 1.08, 1.208, paver)
        for dy in (-0.83, 0.83):
            g.box(x + 0.25, v + dy, 1.208, x + 0.40, v + dy + 0.031, 1.21, steel)
    for y in (v_step - 0.91, v_step + 0.905):
        g.pipe([(x_top - 1.43, y, 0.085), (x_top - 0.06, y, 1.02)], 0.019, oxide_steel)
        g.pipe([(x_top - 0.06, y, 0.025), (x_top - 0.06, y, 1.12)], 0.023, oxide_steel)
    g.finish()

    rear = Part(
        "Laderampenende | versetztes Podest und Hofstufen",
        "hintere-laderampe",
        "access",
    )
    # Beyond the last canopy bay the ledge turns in towards the recessed end wall.
    rear.prism(
        [
            (-0.30, end),
            (dock_wall, end),
            (4.74, end),
            (4.74, stairs_at),
            (1.91, stairs_at),
            (-0.30, end + 0.20),
        ],
        0.012,
        deck_z,
        concrete,
        paver,
    )
    for k in range(7):
        v = stairs_at + k * 0.30
        z = deck_z - (k + 1) * (deck_z - 0.024) / 8
        rear.box(1.91, v, 0.008, 4.68, v + 0.30, z, concrete)
        rear.box(1.91, v + 0.26, z, 4.68, v + 0.30, z + 0.007, sill)
    rear.box(1.80, stairs_at + 2.10, 0.002, 4.69, 75.64, 0.024, paver)
    for v, z in (
        (end - 0.13, deck_z),
        (stairs_at + 0.78, 0.74),
        (stairs_at + 2.04, 0.17),
    ):
        rear.box(1.88, v - 0.025, z, 1.93, v + 0.025, z + 0.86, galv)
    rear.pipe(
        [
            (1.91, end - 0.23, 2.06),
            (1.91, stairs_at, 2.06),
            (1.91, stairs_at + 2.16, 1.01),
        ],
        0.029,
        galv,
    )
    rear.finish()

    canopy = Part("LKW-Laderampe | Wellblechdach und Stahltragwerk", rid, "access")
    canopy.prism(
        strip(start, end, dock_wall + 0.05, -0.14), 5.10, 5.34, steel, membrane
    )
    canopy.bar(
        (edge(start) - 0.15, start), (edge(end) - 0.15, end), 0.13, 4.92, 5.36, sill
    )
    for v in np.arange(start + 0.12, end, 0.22):
        canopy.bar(
            (edge(v) - 0.14, v), (dock_wall + 0.02, v), 0.051, 5.075, 5.115, roof
        )
    for v in np.linspace(start + 1.35, end - 1.28, 8):
        u = edge(v) + 0.25
        # Painted pillars and the two flanges of the steel rafters are visible in the dock photos.
        foot = deck_z if v < stairs_at else 0.018
        canopy.box(
            u - 0.145, v - 0.145, foot, u + 0.145, v + 0.145, foot + 0.045, steel
        )
        for dx in (-0.104, 0.104):
            for dy in (-0.104, 0.104):
                # Exposed anchors at the corners of the column base plate.
                ring = [
                    (
                        u + dx + 0.016 * math.cos(k * math.tau / 6),
                        v + dy + 0.016 * math.sin(k * math.tau / 6),
                    )
                    for k in range(6)
                ]
                canopy.prism(ring, foot + 0.045, foot + 0.065, galv)
        canopy.box(u - 0.091, v - 0.092, 4.74, u + 0.092, v + 0.092, 4.80, steel)
        canopy.box(
            u - 0.075, v - 0.075, foot + 0.045, u + 0.075, v + 0.075, 3.78, white
        )
        canopy.box(u - 0.075, v - 0.075, 3.78, u + 0.075, v + 0.075, 5.11, steel)
        for bottom, height, width in (
            (4.80, 0.045, 0.14),
            (4.84, 0.21, 0.045),
            (5.04, 0.045, 0.14),
        ):
            canopy.box(
                u - 0.19,
                v - width / 2,
                bottom,
                dock_wall,
                v + width / 2,
                bottom + height,
                steel,
            )
    # The yard photo shows vertical brown corrugations under the outer edge of the workshop canopy.
    fascia = material("Vordach | braunes Profilblech", "815f49", 0.25)
    for v in np.arange(start + 0.05, 38.8, 0.16):
        ring = [
            (edge(v) - 0.092, v),
            (edge(v) - 0.155, v + 0.04),
            (edge(v) - 0.155, v + 0.091),
            (edge(v + 0.16) - 0.092, v + 0.16),
        ]
        verts = [(*point, h) for h in (4.03, 5.12) for point in ring]
        canopy.solid(verts, [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6)], [fascia] * 3)
    for v in (42.5, 49.0, 55.5, 62.0):
        a, b = (edge(v) + 0.08, v), (edge(v + 6.3) + 0.08, v + 6.3)
        canopy.bar(a, b, 0.046, 2.06, 2.12, galv)
        canopy.pipe([(*a, 1.23), (*b, 2.09)], 0.024, steel)
    # The under-roof view shows triangular braces, gutter straps and strip lights.
    canopy.pipe(
        [(edge(start) - 0.19, start, 5.27), (edge(end) - 0.19, end, 5.22)],
        0.075,
        oxide_steel,
    )
    for v in np.linspace(start + 1.35, end - 1.28, 8):
        u = edge(v) + 0.25
        canopy.pipe([(u, v, 4.19), (u + 0.91, v, 4.98)], 0.039, oxide_steel)
        canopy.pipe(
            [(dock_wall - 0.08, v, 4.29), (dock_wall - 0.85, v, 5.01)],
            0.033,
            oxide_steel,
        )
        canopy.pipe(
            [(edge(v) - 0.20, v, 5.25), (edge(v) - 0.20, v + 0.06, 5.25)], 0.086, galv
        )
        canopy.box(0.10, v + 0.17, 4.98, 0.21, v + 1.48, 5.055, steel)
        canopy.box(0.12, v + 0.20, 4.965, 0.19, v + 1.46, 4.981, white)
    canopy.finish()

    gates = Part("LKW-Laderampe | Werkstatttore und Fassadenfelder", rid, "access")
    # The photographed row is tied to the metal- and woodwork inventory footprints.
    # Positions farther down the dock remain approximate (see access-point description).
    gate_bays = (
        (25.2, 1.61),
        (28.88, 1.64),
        (timber["doorCenterV"], timber["doorHalfWidth"]),
        (47.7, 1.60),
        (56.6, 1.62),
        (64.3, 1.60),
    )
    for index, (v, half) in enumerate(gate_bays):
        opening((dock_wall, v - half), (dock_wall, v + half), deck_z, 4.49)
        for dy in (-half, half):
            gates.box(2.54, v + dy - 0.045, deck_z, 2.72, v + dy + 0.045, 4.49, steel)
        gates.box(2.54, v - half, 4.40, 2.72, v + half, 4.52, steel)
        # Four leaves per bay. At the wood-shop entrance the inner pair folds back,
        # giving the central aisle a clear threshold as seen from both sides in IMG_6561/62.
        if index == 0:
            door = Part(
                "Metallwerkstatt | Stahltor zur Laderampe",
                site["interiors"]["Metallwerkstatt"],
                "access",
            )
            wicket = Part("Metallwerkstatt | Personentür", door.rid, "access")
            pivot = metal_module["build_gate"](
                door,
                wicket,
                site["metalWorkshop"],
                v,
                half,
                deck_z,
                boxpaint,
                steel,
                galv,
                metal_details,
                glass_face,
            )
            hinged(wicket, pivot, 80.2, True)["outsideDestination"] = rid
            door.finish()["outsideDestination"] = rid
            window_row(gates, (2.50, 18.8), (2.50, 22.8), 2.04, 1.92, 2.05)
            continue
        for sign in (-1, 1):
            hinge = Vector((2.66, v + sign * (half - 0.045)))
            length = (half - 0.060) / 2
            for leaf in range(2):
                if index == 2:
                    angle = math.radians(84 if leaf == 1 else 0)
                else:
                    angle = math.radians(83 if leaf == 0 else -78)
                tip = (
                    hinge + Vector((-math.sin(angle), -sign * math.cos(angle))) * length
                )
                finish = brown if index == 2 else boxpaint
                gates.bar(hinge, tip, 0.068, deck_z + 0.015, 2.93, finish)
                gates.bar(hinge, tip, 0.085, 2.88, 2.98, finish)
                gates.bar(hinge, tip, 0.083, 4.26, 4.42, finish)
                for t in (0.028, 0.966):
                    q = hinge.lerp(tip, t)
                    gates.bar(
                        q, q + (tip - hinge) * 0.046, 0.091, deck_z + 0.02, 4.42, finish
                    )
                glass_face(
                    gates, hinge.lerp(tip, 0.055), hinge.lerp(tip, 0.95), 2.97, 4.28
                )
                if index != 2:
                    gates.bar(hinge, tip, 0.075, 3.62, 3.66, finish)
                for z in (1.45, 2.77, 4.11):
                    gates.pipe([(*hinge, z), (*hinge, z + 0.108)], 0.022, steel)
                if leaf == 1:
                    q = hinge.lerp(tip, 0.83)
                    gates.pipe(
                        [
                            (*q, 2.12),
                            (q.x - 0.072, q.y, 2.12),
                            (q.x - 0.072, q.y, 2.23),
                            (*q, 2.23),
                        ],
                        0.014,
                        galv,
                    )
                hinge = tip
        if index >= 2 and index + 1 < len(gate_bays):
            window_row(
                gates,
                (2.50, v + half + 0.68),
                (2.50, gate_bays[index + 1][0] - 2.32),
                2.07,
                1.91,
                4.25,
                fraction=0.62,
            )
    first = gate_bays[0][0]
    # The threshold bridges the few centimetres of digitising skew between the
    # inventory quadrilateral and the straight dock face.
    center, half = timber["doorCenterV"], timber["doorHalfWidth"]
    gates.box(
        dock_wall - 0.07,
        center - half + 0.05,
        deck_z - 0.018,
        dock_wall + 0.33,
        center + half - 0.05,
        deck_z + 0.005,
        galv,
    )
    # The first dark metal gate bears the Werkstadtpiraten sign.
    gates.box(2.595, first - 1.57, 3.34, 2.63, first - 0.09, 3.68, wood)
    gates.finish()
    add_sign(
        "Schild Werkstadtpiraten",
        "Werkstadtpiraten",
        (2.59, first - 0.13),
        (2.59, first - 1.53),
        3.51,
        0.14,
        rid,
        kind="access",
        ink=steel,
    )

    jambs = Part("LKW-Laderampe | Torlaibung im Erdgeschossschnitt", rid, "access")
    wall_with_openings(jambs, (dock_wall, 22.28), (dock_wall, 34.85), deck_z, 4.90)
    jambs.finish()["sectionOnly"] = True

    fittings = Part(
        "LKW-Laderampe | Sitzbänke und blauer Handhochhubwagen", rid, "access"
    )
    for v in (24.17, 28.95):
        for dy in (-0.61, 0.61):
            for u in (1.64, 2.0):
                fittings.box(
                    u, v + dy, deck_z, u + 0.034, v + dy + 0.034, deck_z + 0.45, steel
                )
            fittings.pipe(
                [(2.01, v + dy, deck_z + 0.39), (2.10, v + dy, deck_z + 0.83)],
                0.018,
                steel,
            )
        fittings.box(
            1.59, v - 0.72, deck_z + 0.425, 2.06, v + 0.72, deck_z + 0.486, wood
        )
        fittings.box(
            2.05, v - 0.72, deck_z + 0.61, 2.10, v + 0.72, deck_z + 0.81, brown
        )
    # One parked manual stacker; leave the photographed loading area and the through aisle free.
    u, v = 0.88, 36.04
    for side in (-0.29, 0.29):
        x = u + side
        fittings.box(x - 0.038, v - 0.16, 1.31, x + 0.038, v + 0.91, 1.37, cobalt)
        for yy in (v - 0.11, v + 0.83):
            fittings.pipe([(x - 0.04, yy, 1.27), (x + 0.04, yy, 1.27)], 0.066, boxpaint)
        fittings.box(x - 0.031, v - 0.04, 1.33, x + 0.031, v + 0.035, 3.24, cobalt)
        fittings.box(x - 0.047, v + 0.04, 1.52, x + 0.047, v + 0.95, 1.56, steel)
    fittings.box(u - 0.32, v - 0.04, 3.19, u + 0.32, v + 0.035, 3.26, cobalt)
    fittings.box(u - 0.27, v + 0.03, 1.50, u + 0.27, v + 0.083, 1.72, steel)
    fittings.pipe(
        [
            (u, v - 0.24, 1.44),
            (u, v - 0.40, 2.11),
            (u, v - 0.35, 2.22),
            (u, v - 0.22, 2.21),
            (u, v - 0.16, 1.87),
        ],
        0.023,
        cobalt,
    )
    fittings.finish()

    furniture = Part("LKW-Laderampe | Pflanztisch der Holzwerkstatt", rid, "access")
    for x in (-0.90, 0.56):
        for y in (34.3, 34.9):
            furniture.box(x, y, 1.2, x + 0.075, y + 0.075, 1.94, wood)
    for y in (34.29, 34.92):
        furniture.box(-0.93, y, 1.85, 0.68, y + 0.055, 2.15, wood)
    for x in (-0.93, 0.63):
        furniture.box(x, 34.3, 1.85, x + 0.055, 34.98, 2.15, wood)
    furniture.box(-0.92, 34.3, 1.85, 0.66, 34.97, 1.89, ply)
    furniture.finish()


def levels():
    # These structural outlines express the observed bays, without assigning upper-floor rooms.
    posts = Part(
        "Erdgeschoss | Auflager unter den Obergeschossen",
        building["id"],
        "upper_support",
    )
    for u in (2.7, 63.8):
        for v in (15.3, 20.6, 25.9, 31.2, 36.5, 41.8, 47.1):
            # At ground level the pier sits between the two steel gate bays.
            if u == 2.7 and v == 25.9:
                posts.box(u - 0.17, 26.84, 0.08, u + 0.17, 27.19, 5.30, concrete)
            else:
                posts.box(u - 0.17, v - 0.23, 0.08, u + 0.17, v + 0.23, 5.3, concrete)
    for u in (69.2, 80.55):
        for v in (0, 20, 40, 60, 80):
            posts.box(u - 0.16, v - 0.2, 0.08, u + 0.16, v + 0.2, 5.3, concrete)
    posts.finish()
    for level in site["upperFloors"]:
        i, z = level["level"], level["height"]
        g = Part(f"{i}. Obergeschoss | Geschossschnitt", building["id"], "upper")
        rings = [
            [
                (2.5, 15),
                (64, 15),
                (64, 47.5),
                (49.3, 47.5),
                (49.3, 52.8),
                (30.4, 52.8),
                (30.4, 47.5),
                (2.5, 47.5),
            ]
        ]
        if i == 1:
            rings.append(east_ring)
        for ring in rings:
            g.prism(ring, z - 0.22, z, concrete, paver)
            for a, b in zip(ring, ring[1:] + ring[:1]):
                g.bar(a, b, 0.16, z, z + 0.43, plaster)
        # Leave the camera-facing side open; retain the rear facade and vertical frame.
        ceiling = z + (3.86 if i == 3 else 4.60)
        for u in (2.7, 63.8):
            for v in (15.3, 20.6, 25.9, 31.2, 36.5, 41.8, 47.1):
                g.box(u - 0.17, v - 0.23, z, u + 0.17, v + 0.23, ceiling, concrete)
        g.box(2.46, 15.1, z, 2.65, 47.3, z + 0.79, plaster)
        g.box(2.46, 15.1, ceiling - 0.49, 2.65, 47.3, ceiling, plaster)
        window_row(
            g,
            (2.40, 15.4),
            (2.40, 47.1),
            z + 0.89,
            ceiling - z - 1.49,
            4.55,
            fraction=0.85,
        )
        g.box(2.55, 47.25, z, 30.4, 47.45, z + 0.95, concrete)
        if i == 1:
            for u in (69.2, 80.55):
                for v in (0, 20, 40, 60, 80):
                    g.box(u - 0.16, v - 0.2, z, u + 0.16, v + 0.2, 8.35, plaster)
        obj = g.finish()
        obj["level"] = i


def swap_bodies():
    printed = material("Wechselbrücken | GHP-Planendruck", "ffffff", roughness=0.78)
    texture = printed.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(
        str(root / "assets/rosenwerk/materialien/wechselbruecken-ghp.jpg")
    )
    texture.image.pack()
    printed.node_tree.links.new(
        texture.outputs["Color"],
        printed.node_tree.nodes["Principled BSDF"].inputs["Base Color"],
    )
    finishes = [
        material("Wechselbrücke | ultramarin", "183878"),
        material("Wechselbrücke | verblichenes Petrol", "34697d"),
    ]
    g = Part(
        "Wechselbrücken | bodenstehende Wechselbrücken", "pflanzcontainer", "access"
    )
    canopy = material("Wechselbrücken | helle Dachplane", "d8d6c9", roughness=0.84)
    for index, outline_geo in enumerate(site["rampEquipment"]):
        tarp = finishes[index]
        band = 0.5 if index == 0 else 0.0
        ring = [local(p) for p in outline_geo]
        center = sum(ring, Vector((0, 0))) / len(ring)
        along = (ring[2] - ring[1]).normalized()
        width = Vector((-along.y, along.x))

        def at(x, y):
            return center + along * float(x) + width * float(y)

        def panel(x0, y0, x1, y1):
            return [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]

        # The underframe rests directly on the paved yard; there are no extended legs.
        g.prism(panel(-3.68, -1.23, 3.68, 1.23), 0.028, 0.18, steel)
        g.prism(panel(-3.70, -1.25, 3.70, 1.25), 0.18, 2.66, tarp, canopy)
        for sign in (-1, 1):
            y = sign * 1.26
            for z, height in ((0.14, 0.115), (2.61, 0.085)):
                g.bar(
                    at(-3.71, y),
                    at(3.71, y),
                    0.083,
                    z,
                    z + height,
                    steel if z > 2 else galv,
                )
            # Slight sag between the buckles gives the blue curtains a soft-sided silhouette.
            vertices = []
            for i in range(49):
                x = -3.65 + 7.30 * i / 48
                bulge = (1 - math.cos(i * math.pi / 2)) * 0.028
                for z, offset in (
                    (0.24, 0.018),
                    (0.66, 0.04 + bulge),
                    (1.84, 0.02 + 0.45 * bulge),
                    (2.605, 0.012),
                ):
                    vertices.append((*at(x, y + sign * offset), z))
            faces = [
                (4 * i + j, 4 * i + j + 4, 4 * i + j + 5, 4 * i + j + 1)
                for i in range(48)
                for j in range(3)
            ]
            if sign > 0:
                faces = [f[::-1] for f in faces]
            # Letters always read from outside. On the reverse curtain the two printed groups
            # trade places, so the logo stays by the same physical end of the swap body.
            swap_halves = (index == 0) == (sign < 0)
            first_face = len(g.faces)
            heights = (0.24, 0.66, 1.84, 2.605)
            for j, face in enumerate(faces):
                midpoint = ((j // 3) + 0.5) / 48
                if sign > 0:
                    midpoint = 1 - midpoint
                shift = (0.5 if midpoint < 0.5 else -0.5) if swap_halves else 0
                coords = []
                for vertex in face:
                    t = (vertex // 4) / 48
                    x_uv = (t if sign < 0 else 1 - t) + shift
                    z_uv = (heights[vertex % 4] - heights[0]) / (
                        heights[-1] - heights[0]
                    )
                    coords.append((0.001 + 0.998 * x_uv, band + 0.002 + 0.496 * z_uv))
                g.edge_uvs[first_face + j] = coords
            g.solid(vertices, faces, [printed] * len(faces))
            for x in np.arange(-3.43, 3.55, 0.61):
                g.bar(
                    at(x - 0.025, y + sign * 0.066),
                    at(x + 0.025, y + sign * 0.066),
                    0.027,
                    0.25,
                    0.51,
                    steel,
                )
                g.bar(
                    at(x - 0.038, y + sign * 0.085),
                    at(x + 0.038, y + sign * 0.085),
                    0.024,
                    0.29,
                    0.35,
                    galv,
                )
            end = sign * 3.71
            if sign == (1 if index == 0 else -1):
                g.bar(at(end, -1.24), at(end, 1.24), 0.085, 0.18, 2.68, tarp)
                exterior = end + sign * 0.046
                l, r = at(exterior, -sign * 1.17), at(exterior, sign * 1.17)
                g.edge_uvs[len(g.faces)] = [
                    (0.012, band + 0.075),
                    (0.491, band + 0.075),
                    (0.491, band + 0.489),
                    (0.012, band + 0.489),
                ]
                g.solid(
                    [(*l, 0.73), (*r, 0.73), (*r, 2.61), (*l, 2.61)],
                    [(0, 1, 2, 3)],
                    [printed],
                )
                for z in (0.26, 2.62):
                    g.bar(
                        at(exterior, -1.23),
                        at(exterior, 1.23),
                        0.022,
                        z,
                        z + 0.046,
                        yellow,
                    )
                for yy in (-1.21, 1.21):
                    g.bar(
                        at(exterior, yy - 0.022),
                        at(exterior, yy + 0.022),
                        0.025,
                        0.27,
                        2.65,
                        yellow,
                    )
                continue
            g.bar(at(end, -1.24), at(end, 1.24), 0.085, 0.18, 2.68, tarp)
            for yy in (-1.21, 0, 1.21):
                g.bar(
                    at(end + sign * 0.043, yy - 0.024),
                    at(end + sign * 0.043, yy + 0.024),
                    0.028,
                    0.19,
                    2.65,
                    steel,
                )
            for yy in (-0.65, 0.65):
                q = at(end + sign * 0.098, yy)
                g.pipe([(*q, 0.25), (*q, 2.60)], 0.028, galv)
                g.bar(
                    at(end + sign * 0.11, yy),
                    at(end + sign * 0.11, yy + 0.23),
                    0.033,
                    0.73,
                    0.77,
                    steel,
                )
    g.finish()


def pallet_garden():
    g = Part(
        "Pflanzcontainer | Gitterboxen, Paletten und Pflanzkübel",
        "pflanzcontainer",
        "access",
    )
    rust = material("Gitterboxen | Rost", "816b55", 0.27)
    terracotta = material("Pflanztopf | Terrakotta", "b57d67")

    # In the photos some wire cages carry pallet shelves and others hold the shrubs.
    def cage(x, y, w, d, height, finish):
        floor = 0.028
        for xx in (x, x + w - 0.06):
            for yy in (y, y + d - 0.06):
                g.box(xx, yy, floor, xx + 0.06, yy + 0.06, height, finish)
        g.box(x, y, 0.12, x + w, y + d, 0.18, finish)
        for yy in (y, y + d):
            for z in (0.21, height - 0.065):
                g.box(x, yy - 0.018, z, x + w, yy + 0.018, z + 0.062, finish)
            for xx in np.arange(x + 0.10, x + w - 0.03, 0.115):
                g.box(
                    xx, yy - 0.007, 0.23, xx + 0.012, yy + 0.007, height - 0.06, finish
                )
        for xx in (x, x + w):
            for z in (0.21, height - 0.065):
                g.box(xx - 0.018, y, z, xx + 0.018, y + d, z + 0.062, finish)
            for yy in np.arange(y + 0.10, y + d - 0.03, 0.115):
                g.box(
                    xx - 0.007, yy, 0.23, xx + 0.007, yy + 0.012, height - 0.06, finish
                )
        for z in np.arange(0.32, height - 0.05, 0.14):
            for a, b in (
                ((x, y), (x + w, y)),
                ((x + w, y), (x + w, y + d)),
                ((x + w, y + d), (x, y + d)),
                ((x, y + d), (x, y)),
            ):
                g.bar(a, b, 0.016, z, z + 0.012, finish)

    def pallet(x, y, w, d, z):
        for dx in (0.07, w / 2 - 0.048, w - 0.17):
            g.box(x + dx, y, z, x + dx + 0.10, y + d, z + 0.035, weathered)
            for dy in (0.04, d / 2 - 0.055, d - 0.14):
                g.box(
                    x + dx,
                    y + dy,
                    z + 0.035,
                    x + dx + 0.10,
                    y + dy + 0.1,
                    z + 0.12,
                    wood,
                )
            g.box(x + dx, y, z + 0.12, x + dx + 0.10, y + d, z + 0.15, weathered)
        for j in range(6):
            off = j * d / 6
            g.box(
                x,
                y + off,
                z + 0.15,
                x + w,
                y + off + d / 6 - 0.019,
                z + 0.18,
                weathered if j % 3 else wood,
            )

    def shrub(x, y, z, seed, height):
        rng = np.random.default_rng(seed)
        for j in range(7):
            angle = math.tau * j / 7 + rng.uniform(-0.35, 0.35)
            dx, dy = math.cos(angle), math.sin(angle)
            mid = (x + dx * 0.29, y + dy * 0.29, z + height * 0.44)
            reach = rng.uniform(0.46, 0.88)
            tip = (x + reach * dx, y + reach * dy, z + height * rng.uniform(0.74, 1.0))
            g.pipe([(x + dx * 0.08, y + dy * 0.08, z), mid, tip], 0.023, weathered)
            for k in (-1, 1):
                branch = (
                    tip[0] + dy * k * 0.21,
                    tip[1] - dx * k * 0.21,
                    tip[2] + rng.uniform(0.04, 0.25),
                )
                g.pipe([mid, branch], 0.012, weathered)
                # Sparse compound leaves on fine twigs, with daylight between the branches.
                for t in (0.61, 0.81, 1.0):
                    stem = Vector(mid).lerp(Vector(branch), t)
                    turn = angle + k * rng.uniform(0.46, 1.44)
                    forward = Vector(
                        (math.cos(turn), math.sin(turn), rng.uniform(0.16, 0.54))
                    )
                    sideways = Vector((-forward.y, forward.x, -0.30))
                    g.pipe([stem, stem + 0.40 * forward], 0.005, weathered)
                    for n in range(5):
                        root = stem + forward * ((n + 1) * 0.067)
                        for side in (-1, 1):
                            reach = rng.uniform(0.078, 0.14)
                            end = root + sideways * (side * reach) + forward * 0.058
                            middle = (root + end) / 2 + Vector((0, 0, 0.022))
                            wing = forward * 0.029
                            g.solid(
                                [root, middle + wing, end, middle - wing],
                                [(0, 1, 2), (0, 2, 3)],
                                [leaf, foliage],
                            )

    for x, y, w, d, h, finish, shelf in (
        (79.4, -14.50, 1.20, 0.81, 0.66, rust, True),
        (80.65, -14.52, 1.22, 0.84, 1.04, rust, True),
        (81.93, -14.49, 1.19, 0.79, 0.56, green, True),
        (79.40, -15.48, 1.21, 0.86, 0.93, rust, False),
        (81.03, -15.43, 1.20, 0.83, 0.84, steel, False),
        (83.31, -15.20, 0.89, 0.86, 0.74, sill, False),
    ):
        x, y = 80.0 + (y + 15.5), -11.45 - (x - 79.4) * 1.55
        w, d = d, w
        cage(x, y, w, d, h, finish)
        if shelf:
            pallet(x - 0.015, y - 0.016, w + 0.03, d + 0.032, h)
        else:
            # The black liner is tucked under the pale metal rim. The wire stays visible outside.
            for a, b in (
                ((x + 0.033, y + 0.035), (x + w - 0.033, y + 0.035)),
                ((x + 0.033, y + d - 0.035), (x + w - 0.033, y + d - 0.035)),
                ((x + 0.035, y + 0.033), (x + 0.035, y + d - 0.033)),
                ((x + w - 0.035, y + 0.033), (x + w - 0.035, y + d - 0.033)),
            ):
                g.bar(a, b, 0.014, 0.19, h - 0.062, boxpaint)
                g.bar(a, b, 0.065, h - 0.059, h - 0.025, finish)
            g.box(
                x + 0.044,
                y + 0.044,
                0.19,
                x + w - 0.044,
                y + d - 0.044,
                h - 0.10,
                earth,
            )
            shrub(x + w / 2, y + d / 2, h - 0.10, int(x * 11), 1.55 if x < 82 else 1.13)
    # U-shaped bicycle stands in the grass at the Jagdweg corner.
    for y in (-10.6, -12.2, -13.8, -15.4, -17.0):
        x = 83.25
        g.pipe(
            [
                (x, y, 0.02),
                (x, y, 0.64),
                (x + 0.11, y, 0.77),
                (x + 0.78, y, 0.77),
                (x + 0.89, y, 0.65),
                (x + 0.89, y, 0.02),
            ],
            0.028,
            galv,
        )
    # Slightly tapered open clay pot sitting on the light front pallet.
    x, y, z = 81.36, -11.04, 0.84
    rings = [
        (0.115, z),
        (0.17, z + 0.30),
        (0.185, z + 0.31),
        (0.185, z + 0.35),
        (0.157, z + 0.35),
        (0.148, z + 0.27),
    ]
    verts = [
        (x + r * math.cos(j * math.tau / 16), y + r * math.sin(j * math.tau / 16), h)
        for r, h in rings
        for j in range(16)
    ]
    faces = [
        (
            i * 16 + j,
            i * 16 + (j + 1) % 16,
            (i + 1) * 16 + (j + 1) % 16,
            (i + 1) * 16 + j,
        )
        for i in range(5)
        for j in range(16)
    ]
    g.solid(verts, faces + [tuple(range(80, 96))], [terracotta] * len(faces) + [earth])
    g.finish()


build_yard()
main_door()
shop_entries()
rosenstrasse_gate()
side_entry()
ramp_entry()
loading_dock()
levels()
swap_bodies()
pallet_garden()

for n, container in enumerate(site["containers"]):
    rid = container["resourceId"]
    ring = [local(p) for p in container["coordinates"]]
    g = Part("KuSS | Stahlcontainer " + str(n + 1), rid, "container")
    g.prism(ring, 0.22, 2.8, boxpaint, roof)
    # Choose the long side facing the space between the two containers.
    front = (ring[1], ring[2]) if n == 0 else (ring[2], ring[3])
    a, b = front
    t = (b - a).normalized()
    mid = sum(ring, Vector((0, 0))) / 4
    outward = ((a + b) / 2 - mid).normalized()
    for p, q in zip(ring, ring[1:] + ring[:1]):
        g.bar(p, q, 0.14, 0.19, 0.35, steel)
        g.bar(p, q, 0.14, 2.71, 2.86, steel)
        g.bar(p, p + (q - p).normalized() * 0.12, 0.19, 0.2, 2.86, galv)
        if (p - a).length < 0.01 and (q - b).length < 0.01:
            # Broad stiffened door panels run along the working face of these units.
            for level in (0.56, 1.14, 1.72, 2.32):
                g.bar(
                    p + outward * 0.032,
                    q + outward * 0.032,
                    0.07,
                    level,
                    level + 0.035,
                    steel,
                )
            continue
        for j in range(1, round((q - p).length / 0.20)):
            pos = p.lerp(q, j / round((q - p).length / 0.20))
            g.bar(pos, pos + (q - p).normalized() * 0.06, 0.09, 0.35, 2.7, roof)
    for j in range(1, 8):
        pos = a.lerp(b, j / 8) + outward * 0.08
        g.bar(pos, pos + t * 0.03, 0.035, 0.34, 2.7, galv)
        g.bar(pos - t * 0.05, pos + t * 0.12, 0.07, 0.80, 0.85, galv)
    g.finish()
    pad = Part("KuSS | Ladepodest " + str(n + 1), rid, "platform")
    outer_a, outer_b = a + outward * 0.94, b + outward * 0.94
    pad.prism([a, b, outer_b, outer_a], 0.12, 0.24, weathered)
    for j in range(8):
        pad.bar(
            a + outward * (0.12 * j), b + outward * (0.12 * j), 0.012, 0.24, 0.25, steel
        )
    pad.finish()
    # Font local +Z faces the viewer; orient the baseline to the outside.
    if Vector((t.y, -t.x)).dot(outward) < 0:
        a, b = b, a
    for line, z, size in (
        (("MARINE PLASTIC", "OCEAN")[n], 1.89, 0.34),
        (("POLLUTION", "PLASTICS")[n], 1.53, 0.23),
    ):
        add_sign(
            "KuSS | " + line, line, a + outward * 0.13, b + outward * 0.13, z, size, rid
        )


def room(name):
    return Part(name, site["interiors"][name], "interior")


def bench(g, u, v, length, depth, height=1.24, top=ply):
    g.box(u, v, height - 0.10, u + length, v + depth, height, top)
    for x in (u + 0.04, u + length - 0.11):
        for y in (v + 0.04, v + depth - 0.11):
            g.box(x, y, 0.31, x + 0.075, y + 0.075, height - 0.10, steel)


def rack(g, u, v, length, height=2.65):
    for z in (0.55, 1.2, 1.85, height):
        g.box(u, v, z - 0.065, u + length, v + 0.58, z, wood)
    for x in (u, u + length / 2, u + length - 0.045):
        for y in (v, v + 0.53):
            g.box(x, y, 0.31, x + 0.05, y + 0.05, height + 0.05, galv)
    for i, mat in enumerate((pages, wood, green, ply, blue)):
        x = u + 0.13 + (length - 0.4) * i / 5
        for level in (0, 1):
            z = 0.55 + 0.65 * level
            g.box(
                x,
                v + 0.06,
                z,
                x + length / 8,
                v + 0.48,
                z + 0.22 + 0.12 * ((i + level) % 2),
                mat,
            )


def round_top(g, u, v, r, z, h, mat):
    g.prism(
        [
            (u + r * math.cos(i * math.tau / 32), v + r * math.sin(i * math.tau / 32))
            for i in range(32)
        ],
        z,
        z + h,
        mat,
    )


timber_module = runpy.run_path(str(root / "scripts/rosenwerk/timber_workshop.py"))
screed = material("Holzwerkstatt | geschliffener Estrich", "64635e", 0.01, 0.85)
osb = material("Holzwerkstatt | Werkzeugwände aus OSB", "ae8858")
surface_grain(screed, "65645f", 4798, 28, "aggregate")
# Overlapping short, differently oriented wood flakes, at the scale of an OSB strand.
rng_osb = np.random.default_rng(2716)
size = 256
flakes = rng_osb.normal(0, 3.0, (size, size))
for _ in range(4250):
    x, y = rng_osb.integers(0, size, 2)
    length, width = rng_osb.integers(5, 33), rng_osb.integers(1, 6)
    angle = rng_osb.uniform(0, math.pi)
    along, across_flake = np.mgrid[:length, :width]
    xx = (
        np.rint(x + along * math.cos(angle) - across_flake * math.sin(angle)).astype(
            int
        )
        % size
    )
    yy = (
        np.rint(y + along * math.sin(angle) + across_flake * math.cos(angle)).astype(
            int
        )
        % size
    )
    flakes[yy, xx] = rng_osb.normal(0, 14) + rng_osb.normal(0, 2.2, (length, width))
pixels = np.clip(np.array([174, 138, 92]) + flakes[:, :, None], 0, 255).astype(np.uint8)
chip_color = packed_texture(osb, pixels, "Holzspäne")
osb.node_tree.links.new(
    chip_color.outputs["Color"],
    osb.node_tree.nodes["Principled BSDF"].inputs["Base Color"],
)
texture_metres[osb] = 0.54
shop_wood = wood.copy()
shop_wood.name = "Holzwerkstatt | Kantholz"
shop_ply = ply.copy()
shop_ply.name = "Holzwerkstatt | Schichtholz"
texture_metres[shop_wood] = 0.66
texture_metres[shop_ply] = 0.85
shop_light = material("Holzwerkstatt | Röhrendiffusor", "fff4d7")
shader = shop_light.node_tree.nodes["Principled BSDF"]
shader.inputs["Emission Color"].default_value = (1, 0.90, 0.72, 1)
shader.inputs["Emission Strength"].default_value = 2.2
soffit = material("Holzwerkstatt | gekalkte Decke", "e3e0d8")
soffit.use_backface_culling = True
shader = soffit.node_tree.nodes["Principled BSDF"]
shader.inputs["Emission Color"].default_value = (0.56, 0.55, 0.53, 1)
shader.inputs["Emission Strength"].default_value = 0.17
timber_finishes = dict(
    white=white,
    wood=shop_wood,
    ply=shop_ply,
    galv=galv,
    steel=steel,
    frame=frame,
    boxpaint=boxpaint,
    red=red,
    tile=tile,
    blue=blue,
    green=green,
    sill=sill,
    osb=osb,
    screed=screed,
    light=shop_light,
    soffit=soffit,
    dust=material("Holzwerkstatt | Sägemehl", "af9672"),
    hose=material("Absaugung | bernsteinfarbener Spiralschlauch", "bfa772"),
    hoseGray=material("Absaugung | grauer Spiralschlauch", "808577"),
    dustbag=material("Absaugung | gefüllte Spänesäcke", "c9b699"),
)
contact_bake = runpy.run_path(str(root / "scripts/rosenwerk/laser_workshop.py"))[
    "bake_contacts"
]
timber_module["build_workshop"](
    Part,
    site,
    local,
    timber_finishes,
    bench,
    round_top,
    contact_bake,
)

metal_floor = material("Metallwerkstatt | abgelaufener Beton", "8d877a", 0.02, 0.88)
surface_grain(metal_floor, "8d877a", 3026, 13, "mineral")
metal_module["build_workshop"](
    Part,
    site,
    local,
    {
        **timber_finishes,
        "screed": metal_floor,
        "cobalt": cobalt,
        "yellow": yellow,
        "mustard": material(
            "Metallwerkstatt | Bohrmaschinenlack ocker", "c3ad70", 0.14
        ),
    },
    material,
    metal_details,
    bench,
    round_top,
    contact_bake,
)

g = room("Siebdruckwerkstatt")
g.box(74.94, 2.2, 0.32, 75.09, 11.66, 3.15, white)
rack(g, 75.18, 10.95, 2.85)
bench(g, 75.25, 5.1, 1.0, 3.6)
# Vertical screen storage and a drying rack from the room photographs.
for j in range(13):
    u = 75.46 + j * 0.135
    g.box(u, 8.95, 0.35, u + 0.065, 10.02, 1.68, wood if j % 3 else galv)
for j in range(19):
    g.box(79.3, 3.0, 0.58 + j * 0.078, 80.48, 3.83, 0.605 + j * 0.078, galv)
g.box(80.37, 3.03, 0.32, 80.48, 3.82, 2.1, red)
g.finish()

runpy.run_path(str(root / "scripts/rosenwerk/laser_workshop.py"))["build_workshop"](
    Part,
    site,
    local,
    material,
    (white, steel, galv, wood, ply, frame, blue, red, green, yellow),
    swatches / "laserwerkstatt.png",
    surface_grain,
)

# Galvanized angle shelving, trays, spools and sorting boxes in the Zündstoffe stockroom.
g = room("Materialvermittlung")
# Two cut faces leave the central aisle and the stock behind the racks visible.
g.box(49.10, 23.66, 0.31, 49.23, 34.47, 3.16, plaster)
g.box(49.10, 34.36, 0.31, 60.53, 34.49, 3.16, plaster)
g.box(49.23, 34.31, 0.31, 60.53, 34.36, 0.45, sill)
card = material("Materiallager | Karton und Wickelkerne", "ac8358")
crate = material("Materiallager | rote Stapelkisten", "9f3932")
stock_colours = (oxide, ply, navy, green, frame, brown)
rng = np.random.default_rng(419)
for bay, (u, v, length) in enumerate(
    ((49.5, 24.25, 3.8), (49.5, 29.4, 3.8), (53.8, 27.3, 3.6), (55.2, 32.75, 4.9))
):
    depth = 0.65
    for x in (u, u + length / 2, u + length):
        for y in (v, v + depth):
            g.box(x, y, 0.31, x + 0.055, y + 0.018, 2.95, galv)
            g.box(x, y, 0.31, x + 0.018, y + 0.055, 2.95, galv)
    for tier, top in enumerate((0.51, 1.12, 1.70, 2.30, 2.89)):
        g.box(u, v, top - 0.043, u + length, v + depth, top, galv)
        if tier == 4:
            continue
        # Small handwritten stock cards on the front rail, visible in the inventory photo.
        if tier in (1, 2):
            for slot in (1, 4):
                x = u + slot * length / 6
                g.box(x, v - 0.014, top - 0.08, x + 0.15, v, top + 0.012, pages)
        for slot in range(6):
            x = u + 0.12 + slot * (length - 0.12) / 6
            variant = (slot + tier + bay) % 4
            if variant == 0:
                # Low open-front picking bins with contents visible from the aisle.
                g.box(x, v + 0.05, top, x + 0.42, v + 0.51, top + 0.07, crate)
                for xx in (x, x + 0.39):
                    g.box(
                        xx, v + 0.05, top + 0.07, xx + 0.03, v + 0.51, top + 0.24, crate
                    )
                g.box(x, v + 0.48, top + 0.07, x + 0.42, v + 0.51, top + 0.24, crate)
                for k in range(3):
                    round_top(
                        g,
                        x + 0.10 * k + 0.09,
                        v + 0.22,
                        0.05,
                        top + 0.07,
                        0.13,
                        stock_colours[(k + slot) % 6],
                    )
            elif variant == 1:
                # Broad-flanged reels visible on the upper shelves.
                for z, r, h in (
                    (top, 0.20, 0.032),
                    (top + 0.032, 0.09, 0.235),
                    (top + 0.267, 0.20, 0.032),
                ):
                    round_top(
                        g, x + 0.22, v + 0.32, r, z, h, stock_colours[(bay + tier) % 6]
                    )
            elif variant == 2:
                for k in range(5):
                    g.box(
                        x + 0.013 * (k % 2),
                        v + 0.045,
                        top + k * 0.033,
                        x + 0.49,
                        v + 0.54,
                        top + k * 0.033 + 0.027,
                        ply if k % 2 else card,
                    )
            else:
                for k in range(3):
                    r = 0.065 + 0.012 * (k % 2)
                    g.pipe(
                        [
                            (x + 0.09 + k * 0.14, v + 0.22, top),
                            (x + 0.09 + k * 0.14, v + 0.22, top + 0.22 + 0.035 * k),
                        ],
                        r,
                        stock_colours[(tier + k) % 6],
                    )
# Flat board offcuts and slotted trays fill the tall rear run.
for x in (52.5, 57.2):
    for k in range(10):
        g.box(
            x + 0.016 * (k % 3),
            33.83,
            0.31 + k * 0.045,
            x + 1.45,
            34.30,
            0.348 + k * 0.045,
            wood if k % 3 else ply,
        )
for k in range(7):
    z = 2.30 + k * 0.063
    g.box(58.56, 32.83, z, 59.12, 33.32, z + 0.024, navy)
    for x in (58.56, 59.10):
        g.box(x, 32.84, z + 0.024, x + 0.02, 33.32, z + 0.056, navy)
# Tall cardboard sorting boxes hold loosely leaning rolls with open, shadowed ends.
for u, v, h in ((53.5, 26.0, 0.75), (58.5, 30.8, 0.86)):
    for dx in (0, 0.60):
        g.box(u + dx, v, 0.31, u + dx + 0.028, v + 0.61, 0.31 + h, card)
    for dy in (0, 0.58):
        g.box(u, v + dy, 0.31, u + 0.63, v + dy + 0.028, 0.31 + h, card)
    for i in range(9):
        x, y = u + 0.12 + 0.18 * (i % 3), v + 0.12 + 0.18 * (i // 3)
        end = (
            x + rng.uniform(-0.21, 0.21),
            y + rng.uniform(-0.18, 0.18),
            1.55 + rng.uniform(0, 0.56),
        )
        g.pipe([(x, y, 0.42), end], 0.048 + 0.012 * (i % 2), ply if i % 4 else white)
a, b = Vector((50.1, 29.45, 2.90)), Vector((59.9, 32.8, 2.67))
line = [
    a.lerp(b, i / 20) - Vector((0, 0, 0.22 * math.sin(i * math.pi / 20)))
    for i in range(21)
]
g.pipe(line, 0.009, weathered)
for i in range(1, 19):
    l, r = line[i], line[i + 1]
    tip = (l + r) / 2 - Vector((0, 0.035, 0.21))
    g.solid([tuple(l), tuple(r), tuple(tip)], [(0, 1, 2)], [stock_colours[(i * 5) % 6]])
g.finish()

g = room("Raum ohne Namen (RON)")
# The open laser-room door looks across the RON toward shelves of books.
g.box(68.59, -3.48, 0.31, 68.72, 2.05, 3.54, white)
for z in (0.48, 1.00, 1.52, 2.04, 2.56):
    g.box(68.74, -1.23, z, 69.08, 1.02, z + 0.034, ply)
for y in (-1.23, -0.14, 0.99):
    g.box(68.74, y, 0.32, 69.08, y + 0.034, 2.61, wood)
for tier in range(4):
    for i in range(23):
        y = -1.13 + i * 0.086
        z = 0.517 + tier * 0.52
        g.box(
            68.79,
            y,
            z,
            69.064,
            y + 0.046 + 0.009 * (i % 4),
            z + 0.20 + 0.046 * ((i + tier) % 5),
            (pages, navy, wood, green, red, white)[(i * 5 + tier) % 6],
        )
g.box(69.05, -3.47, 0.32, 74.57, 1.7, 0.34, oxide)
rack(g, 69.29, 1.07, 2.4, 2.05)
round_top(g, 72, -0.6, 0.98, 1.13, 0.09, ply)
round_top(g, 72, -0.6, 0.22, 0.33, 0.8, steel)
for u, v in ((70.85, -0.9), (72.1, -1.85), (73.1, -0.1), (71.8, 0.55)):
    g.box(u - 0.26, v - 0.26, 0.34, u + 0.26, v + 0.26, 0.78, wood)
g.box(69.25, -2.8, 0.34, 70.05, -1.14, 0.79, red)
g.box(69.25, -2.8, 0.78, 69.47, -1.14, 1.21, red)
g.finish()

g = room("Darkroom (Fotolabor)")
g.box(76.88, 34.05, 0.32, 80.68, 40.48, 0.35, oxide)
g.box(77.0, 40.45, 0.35, 80.73, 40.62, 2.94, white)
bench(g, 77.05, 38.9, 2.55, 1.1, 1.21)
rack(g, 77.09, 34.4, 1.45, 2.22)
bench(g, 77.08, 35.02, 0.75, 3.66, 1.16)
g.box(77.1, 35.31, 1.16, 77.75, 36.53, 1.24, sill)
g.box(77.16, 35.40, 1.24, 77.68, 36.45, 1.26, steel)
g.box(79.65, 35.70, 0.35, 80.48, 37.62, 1.24, wood)
g.box(79.66, 35.74, 1.24, 80.47, 37.42, 1.62, frame)
round_top(g, 80.08, 36.22, 0.22, 1.62, 0.20, sill)
g.pipe(
    [
        (77.21, 40.2, 2.66),
        (78.80, 40.2, 2.66),
        (79.0, 40.1, 2.66),
        (79.18, 39.88, 2.66),
        (79.22, 37.9, 2.66),
    ],
    0.085,
    galv,
)
for u in (77.55, 78.8):
    g.box(u, 39.01, 1.21, u + 0.65, 39.7, 1.27, steel)
    g.box(u + 0.28, 39.57, 1.25, u + 0.33, 39.63, 2.18, galv)
    g.box(u + 0.10, 39.17, 1.89, u + 0.51, 39.56, 2.12, steel)
# The inventory photographs show the wet bench, processors, enlargers and exposed services.
photo_black = material("Fotolabor | Geräte und Vorhang", "282a2c")
enamel = material("Fotolabor | Geräteblech elfenbein", "d6cdb5")
for x in (77.55, 78.8):
    for i in range(6):
        k = 0.012 * (i % 2)
        g.box(
            x + 0.16 - k,
            39.24 - k,
            1.71 + i * 0.032,
            x + 0.44 + k,
            39.50 + k,
            1.735 + i * 0.032,
            photo_black,
        )
    round_top(g, x + 0.30, 39.36, 0.064, 1.64, 0.083, photo_black)
    g.box(x + 0.085, 39.04, 1.27, x + 0.58, 39.50, 1.289, frame)
# Ivory film processor on its plywood trolley, with the two open lower compartments.
g.box(79.67, 35.75, 1.30, 80.47, 37.4, 1.64, enamel)
g.box(79.66, 35.76, 1.32, 79.67, 37.39, 1.344, oxide)
g.box(79.68, 35.76, 0.40, 79.71, 37.40, 1.18, wood)
for j in range(3):
    v = 35.8 + j * 0.51
    g.box(79.646, v, 0.45, 79.67, v + 0.46, 1.14, steel if j == 0 else ply)
    g.box(79.63, v + 0.16, 0.99, 79.647, v + 0.31, 1.02, sill)
# Angled exit cover, film-feed gap and a folded lead on the tabletop.
g.slope((80.07, 36.70), (80.07, 37.34), 0.63, 1.83, 1.65, 0.04, enamel)
g.box(79.72, 36.65, 1.64, 80.42, 36.70, 1.69, photo_black)
g.pipe(
    [
        (79.69, 36.88, 1.62),
        (79.59, 36.88, 1.34),
        (79.55, 36.70, 0.89),
        (79.55, 36.55, 0.85),
        (79.56, 36.47, 1.17),
    ],
    0.008,
    photo_black,
)
# Narrow ribbed radiator and small open crate beneath the processor.
for k in range(8):
    y = 37.52 + k * 0.066
    g.box(79.77, y, 0.40, 80.06, y + 0.042, 0.99, white)
for z in (0.49, 0.91):
    g.pipe([(79.89, 37.53, z), (79.89, 38.03, z)], 0.024, white)
g.box(79.57, 35.83, 0.40, 79.65, 36.18, 0.48, navy)
for y in (35.83, 36.16):
    g.box(79.57, y, 0.48, 79.65, y + 0.025, 0.65, navy)
# A tiled splashback, mixer tap and two shallow processing trays along the wet bench.
g.box(76.98, 35.14, 1.20, 77.06, 38.62, 1.95, white)
for j in range(15):
    y = 35.17 + j * 0.235
    g.box(77.06, y, 1.21, 77.065, y + 0.008, 1.95, sill)
for h in (1.45, 1.69, 1.93):
    g.box(77.06, 35.17, h, 77.065, 38.59, h + 0.008, sill)
g.pipe(
    [
        (77.13, 36.41, 1.26),
        (77.13, 36.41, 1.55),
        (77.36, 36.41, 1.55),
        (77.36, 36.41, 1.48),
    ],
    0.018,
    galv,
)
for j in range(2):
    y = 37.01 + j * 0.62
    g.box(77.15, y, 1.16, 77.70, y + 0.47, 1.18, enamel)
    for x in (77.15, 77.67):
        g.box(x, y, 1.18, x + 0.03, y + 0.47, 1.23, enamel)
    for yy in (y, y + 0.44):
        g.box(77.15, yy, 1.18, 77.7, yy + 0.03, 1.23, enamel)
# Overhead ladder cable tray and its two wall brackets.
for y in (38.16, 38.42):
    g.box(77.03, y, 2.79, 80.37, y + 0.023, 2.87, galv)
for i in range(16):
    x = 77.06 + i * 0.21
    g.box(x, 38.17, 2.79, x + 0.023, 38.42, 2.81, galv)
for x in (77.18, 79.9):
    g.pipe([(x, 38.3, 2.83), (x, 38.3, 2.98), (x, 38.58, 2.98)], 0.013, galv)
# Light-excluding curtain drawn back at the corner of the wet area.
for j in range(14):
    a = (76.99 + j * 0.041, 34.15 + 0.044 * math.sin(j * 1.6))
    b = (a[0] + 0.041, 34.15 + 0.044 * math.sin((j + 1) * 1.6))
    g.bar(a, b, 0.016, 0.34 + 0.025 * math.cos(j), 2.75, photo_black)
g.finish()

for name, near, far, upper in (
    ("Toilette", 29.07, 32.48, navy),
    ("Kleines Badezimmer mit Waschbecken und kleinem Becken", 25.1, 28.67, white),
):
    g = room(name)
    g.box(68.95, near, 0.32, 73.15, far, 0.35, tile)
    g.box(68.95, far - 0.15, 0.35, 73.15, far, 1.55, tile)
    g.box(68.95, far - 0.15, 1.55, 73.15, far, 2.98, upper)
    for i in range(14):
        u = 69.0 + i * 0.30
        g.box(u, far - 0.159, 0.36, u + 0.012, far - 0.147, 1.55, white)
    for i in range(4):
        z = 0.36 + i * 0.30
        g.box(68.95, far - 0.161, z, 73.15, far - 0.145, z + 0.012, white)
    for u in (69.6, 71.15):
        g.box(u, far - 0.64, 0.99, u + 0.72, far - 0.15, 1.04, white)
        g.box(u, far - 0.63, 1.04, u + 0.72, far - 0.55, 1.15, white)
        for x in (u, u + 0.65):
            g.box(x, far - 0.62, 1.04, x + 0.07, far - 0.15, 1.15, white)
        g.box(u + 0.32, far - 0.26, 1.1, u + 0.37, far - 0.20, 1.32, galv)
    g.finish()


# Fixed machines use the four mapped corners, so the meshes retain both scale and bearing.
for machine in site["machines"]:
    g = Part(machine["name"], machine["id"], "machine")
    quad = [local(p) for p in machine["coordinates"]]
    if machine["name"].startswith(("Formatkreissäge", "CNC")):
        quad = [p + Vector((timber["inventoryOffsetU"], 0)) for p in quad]
    if machine["name"].startswith("Formatkreissäge"):
        # Slide runs into the room from the dock, on the aisle side of the casting.
        quad = [quad[i] for i in (1, 2, 3, 0)]
    left, right, back = quad[0], quad[1] - quad[0], quad[-1] - quad[0]

    def block(x, y, z, X, Y, Z, m):
        g.prism(
            [left + right * a + back * b for a, b in ((x, y), (X, y), (X, Y), (x, Y))],
            z,
            Z,
            m,
        )

    if machine["name"].startswith("Formatkreissäge"):
        block(0.12, 0.41, 0.34, 0.83, 0.81, 0.44, steel)
        block(0.11, 0.39, 0.44, 0.85, 0.83, 0.96, green)
        block(0.09, 0.355, 0.96, 0.88, 0.85, 1.15, frame)
        for x in (0.15, 0.35, 0.55, 0.76):
            block(x, 0.383, 0.49, x + 0.013, 0.39, 0.87, steel)
        for y in (0.090, 0.147, 0.206):
            block(-0.001, y, 1.214, 0.0001, y + 0.036, 1.277, steel)
        for x in (0.25, 0.72):
            block(x, 0.035, 0.99, x + 0.053, 0.40, 1.06, sill)

        block(0.02, 0.26, 1.15, 0.98, 0.91, 1.23, galv)
        block(0, 0.08, 1.20, 1, 0.27, 1.30, frame)
        block(0.05, 0.02, 1.18, 0.96, 0.055, 1.28, galv)
        block(0.11, 0.68, 1.23, 0.89, 0.716, 1.37, sill)
        block(0.39, 0.55, 1.26, 0.65, 0.61, 1.39, steel)
        block(0.53, 0.82, 1.18, 0.57, 0.86, 2.20, sill)
        block(0.53, 0.52, 2.08, 0.57, 0.86, 2.20, sill)
        block(0.53, 0.52, 1.47, 0.57, 0.56, 2.09, sill)
        for y in (0.103, 0.138, 0.173, 0.208, 0.243):
            block(0.002, y, 1.30, 0.998, y + 0.005, 1.303, sill)
        for x in (0.10, 0.82):
            for y in (0.40, 0.76):
                block(x, y, 0.314, x + 0.08, y + 0.082, 0.36, wood)
        block(0.10, 0.358, 0.87, 0.36, 0.376, 1.06, steel)
        for i, button in enumerate((green, white, red, yellow)):
            block(
                0.13 + i * 0.053, 0.349, 0.935, 0.159 + i * 0.053, 0.363, 1.005, button
            )
        # Guard and hose meet the overhead extraction branch at the slide.
        arm = left + 0.55 * right + 0.54 * back
        g.pipe(
            [(*arm, 1.48), (*arm, 1.86), (6.67, 31.07, 1.86)],
            0.073,
            timber_finishes["hoseGray"],
        )
        a = left + 0.45 * right + 0.52 * back
        b = left + 0.68 * right + 0.52 * back
        g.slope(a, b, 0.18, 1.36, 1.52, 0.09, frame)
        g.bar(a, b, 0.025, 1.28, 1.32, steel)
    elif machine["name"].startswith("CNC"):
        for x in (0.04, 0.90):
            for y in (0.04, 0.88):
                block(x, y, 0.33, x + 0.057, y + 0.071, 1.15, shop_wood)
        for y in (0.035, 0.90):
            block(0.03, y, 0.94, 0.97, y + 0.065, 1.18, shop_wood)
            block(0.04, y, 0.48, 0.96, y + 0.043, 0.55, shop_wood)
        for x in (0.031, 0.92):
            block(x, 0.03, 0.94, x + 0.052, 0.97, 1.18, shop_wood)
        block(0.04, 0.05, 0.54, 0.96, 0.93, 0.57, shop_ply)
        for i in range(5):
            block(
                0.12,
                0.16,
                0.57 + i * 0.035,
                0.74 - i * 0.035,
                0.69,
                0.60 + i * 0.035,
                shop_ply,
            )
        block(0.02, 0.02, 1.17, 0.98, 0.98, 1.24, shop_wood)
        block(0.035, 0.033, 1.24, 0.965, 0.97, 1.27, shop_ply)
        for y in (0.09, 0.87):
            block(0.05, y, 1.28, 0.96, y + 0.045, 1.35, galv)
            block(0.46, y, 1.34, 0.55, y + 0.06, 1.82, steel)
        block(0.45, 0.08, 1.76, 0.55, 0.94, 1.88, galv)
        block(0.43, 0.47, 1.46, 0.58, 0.58, 1.83, steel)
        spindle = left + 0.50 * right + 0.52 * back
        u, v = spindle
        timber_module["hose"](
            g,
            [
                (u, v, 1.62),
                (u + 0.13, v - 0.20, 1.39),
                (u + 0.41, v - 0.36, 1.48),
                (u + 0.53, v - 0.25, 2.35),
                (u + 0.41, v + 0.13, 2.67),
                (u + 0.20, v + 0.53, 2.36),
                (u + 0.20, v + 0.88, 2.67),
            ],
            0.082,
            timber_finishes["hoseGray"],
            frame,
        )
        # Extraction takeoff and hangers over the back bench keep the loop suspended.
        g.pipe(
            [
                (u + 0.20, v + 0.88, 2.67),
                (u + 0.20, v + 0.97, 2.77),
                (u + 0.42, v + 1.06, 2.84),
                (u + 1.42, v + 1.06, 2.84),
                (u + 1.63, v + 0.91, 2.84),
                (u + 1.63, 29.18, 2.84),
            ],
            0.085,
            galv,
        )
        for dx in (0.50, 1.22):
            g.pipe([(u + dx, v + 1.06, 2.91), (u + dx, v + 1.06, 3.89)], 0.009, steel)
        round_top(g, u, v, 0.055, 1.35, 0.32, galv)
        round_top(g, u, v, 0.014, 1.285, 0.10, steel)
        for yy in (0.102, 0.887):
            block(0.06, yy, 1.35, 0.95, yy + 0.009, 1.365, steel)
        block(-0.23, 0.42, 1.05, 0.045, 0.81, 1.10, shop_ply)
        block(-0.20, 0.455, 1.10, 0.004, 0.78, 1.122, galv)
        block(-0.040, 0.477, 1.122, -0.012, 0.76, 1.13, steel)
        block(-0.010, 0.463, 1.122, 0.001, 0.771, 1.42, steel)
        block(-0.013, 0.478, 1.15, -0.010, 0.754, 1.397, blue)
        for j in range(3):
            block(
                -0.014,
                0.487,
                1.20 + j * 0.057,
                -0.013,
                0.68 - j * 0.025,
                1.208 + j * 0.057,
                frame,
            )
        for x in (0.41, 0.46, 0.51, 0.56):
            block(x, 0.19, 1.271, x + 0.006, 0.38, 1.273, wood)
    else:
        for x in (0.04, 0.91):
            for y in (0.05, 0.89):
                block(x, y, 0.32, x + 0.05, y + 0.055, 1.19, steel)
        block(0.03, 0.03, 1.08, 0.97, 0.97, 1.22, blue)
        block(0.08, 0.08, 1.22, 0.92, 0.92, 1.26, galv)
        for x in (0.05, 0.91):
            block(x, 0.85, 1.22, x + 0.05, 0.92, 1.71, steel)
            block(x, 0.1, 1.50, x + 0.04, 0.91, 1.57, galv)
        for y in (0.1, 0.87):
            block(0.05, y, 1.50, 0.95, y + 0.035, 1.57, galv)
    g.finish()

scene["origin_longitude"], scene["origin_latitude"] = origin
scene["source"] = (
    "OSM w150966263, Konglomerat-Inventar, Ortsfotos, GeoSN DOM1/DGM1/DOP20, Apple Karten"
)
scene["height_note"] = (
    "Dachhöhen aus DOM1 minus DGM1; Geschossdecken, Zugangshöhen und Ausstattung angenähert"
)


def rear_roof():
    g = part("Dächer | Dachaufbau, Abluft und Lichtkuppeln")
    # Raised rectangle on the western high roof, also distinct in DOM1 and Flyover.
    u, v = 10.6, 42.2
    g.box(u - 2.8, v - 2.9, 18.86, u + 2.8, v + 2.9, 21.17, plaster)
    g.box(u - 2.94, v - 3.04, 21.17, u + 2.94, v + 3.04, 21.34, membrane)
    g.box(u - 1.35, v + 2.90, 19.79, u - 0.45, v + 2.97, 20.52, steel)
    for h in np.arange(19.82, 20.53, 0.115):
        g.box(u - 1.35, v + 2.97, h, u - 0.45, v + 3.02, h + 0.033, sill)
    # Box duct and cylindrical terminals on the stairhead. Fine sections are inferred.
    for x, y, w, h in (
        (41.2, 49.3, 1.38, 0.63),
        (43.8, 49.3, 1.30, 0.79),
        (46.9, 49.0, 1.62, 1.62),
    ):
        g.box(
            x - w * 0.63, y - w * 0.70, 22.16, x + w * 0.63, y + w * 0.70, 22.31, sill
        )
        g.box(x - w / 2, y - w / 2, 22.31, x + w / 2, y + w / 2, 22.16 + h, galv)
        g.box(
            x - w * 0.56,
            y - w * 0.56,
            22.16 + h,
            x + w * 0.56,
            y + w * 0.56,
            22.23 + h,
            roof,
        )
        for z in np.arange(22.40, 22.10 + h, 0.12):
            g.box(
                x - w * 0.41,
                y + w * 0.5,
                z,
                x + w * 0.41,
                y + w * 0.5 + 0.052,
                z + 0.036,
                steel,
            )
    # Bright junctions and the L-shaped strip around the roof field are visible from above.
    g.box(41.7, 49.03, 22.38, 46.35, 49.45, 22.64, galv)
    for x in (42.35, 43.02, 44.82, 45.65):
        g.box(x, 49.0, 22.36, x + 0.06, 49.48, 22.67, sill)
    for a, b in (
        ((31.2, 44.8), (61.1, 44.8)),
        ((61.1, 44.8), (61.1, 31.25)),
        ((61.1, 31.25), (61.1, 17.1)),
    ):
        g.slope(a, b, 0.16, roof_z(a[1]) + 0.11, roof_z(b[1]) + 0.11, 0.05, galv)
    for x, y, r, h in (
        (10.5, 18.25, 0.19, 0.62),
        (46.5, 18.1, 0.14, 0.43),
        (51.1, 40.8, 0.16, 0.53),
    ):
        z = roof_z(y) + 0.05
        round_top(g, x, y, r * 1.65, z, 0.09, sill)
        round_top(g, x, y, r, z + 0.08, h, galv)
        round_top(g, x, y, r * 1.38, z + h + 0.08, 0.065, steel)
    for x, y, w, base in (
        (15.9, 57.0, 1.55, 5.18),
        (30.5, 57.1, 1.32, 5.18),
        (35.3, 56.9, 1.3, 5.18),
        (40.3, 56.9, 1.35, 5.18),
        (48.1, 56.8, 1.35, 5.18),
        (55.6, 56.6, 1.34, 5.18),
        (62.5, 56.5, 1.45, 5.18),
        (16.9, 67.1, 2.4, 5.70),
        (26.9, 67.0, 2.45, 5.70),
    ):
        g.box(x - w * 0.60, y - 0.89, base, x + w * 0.60, y + 0.89, base + 0.10, sill)
        g.box(
            x - w * 0.52,
            y - 0.78,
            base + 0.10,
            x + w * 0.52,
            y + 0.78,
            base + 0.28,
            frame,
        )
        # Rounded glazing cap on a dark gasket and a folded retaining frame.
        g.box(
            x - w * 0.51,
            y - 0.76,
            base + 0.28,
            x + w * 0.51,
            y + 0.76,
            base + 0.305,
            steel,
        )
        rings = []
        for ax, ay, h in (
            (w * 0.50, 0.746, 0.305),
            (w * 0.47, 0.71, 0.365),
            (w * 0.40, 0.64, 0.414),
            (w * 0.27, 0.46, 0.449),
            (w * 0.12, 0.22, 0.465),
        ):
            radius = min(ax, ay) * 0.16
            ring = []
            for a in range(4):
                sx, sy = ((1, 1), (-1, 1), (-1, -1), (1, -1))[a]
                for j in range(4):
                    angle = (a + j / 3) * math.pi / 2
                    ring.append(
                        (
                            x + sx * (ax - radius) + radius * math.cos(angle),
                            y + sy * (ay - radius) + radius * math.sin(angle),
                            base + h,
                        )
                    )
            rings.append(ring)
        n = len(rings[0])
        faces = [
            (k * n + j, k * n + (j + 1) % n, (k + 1) * n + (j + 1) % n, (k + 1) * n + j)
            for k in range(len(rings) - 1)
            for j in range(n)
        ]
        faces.append(tuple(range((len(rings) - 1) * n, len(rings) * n)))
        g.solid(
            [vertex for ring in rings for vertex in ring],
            faces,
            [rooflight] * len(faces),
        )
    for x in (10.5, 28, 45.5, 63):
        g.bar((x, 70.45), (x, 74.9), 0.065, 5.181, 5.215, sill)
    g.finish()


def building_walls():
    g = part("Mauerwerk | Außenwände mit durchgehenden Fensteröffnungen")
    # North loading apron lies below an overhang. Keep a solid end bay at its west end.
    a, b = outline[:2]
    p = a.lerp(b, (18.7 - a.x) / (b.x - a.x))
    rear_ring = [
        a,
        p,
        Vector((p.x, 70.25)),
        Vector((67.5, 69.78)),
        Vector((67.5, b.y)),
        b,
    ]
    # The west dock has its own setback behind the loading platform.
    boundary = [
        *rear_ring,
        *outline[2:14],
        Vector((0.18, dock_start)),
        Vector((dock_wall, dock_start)),
        Vector((dock_wall, 69.85)),
        outline[17],
    ]
    shutter_bays = ((24.5, 3.0), (38.5, 3.1), (52.1, 2.8))
    for x, w in shutter_bays:
        y = 70.25 - (x - 18.7) * 0.0096
        opening((x - w / 2, y), (x + w / 2, y), 0.14, 3.31)
    for a, b in zip(boundary, boundary[1:] + boundary[:1]):
        wall_with_openings(g, a, b, -0.88, 5.05)
    # The courtyard opening continues down through the low wing.
    cr = list(court)
    if sum(a.x * b.y - b.x * a.y for a, b in zip(cr, cr[1:] + cr[:1])) < 0:
        cr.reverse()
    for a, b in zip(cr, cr[1:] + cr[:1]):
        wall_with_openings(g, a, b, 1.18, 4.98)
    for a, b in zip(east_ring, east_ring[1:] + east_ring[:1]):
        wall_with_openings(g, a, b, 5.18, 8.27)
    high = [
        (2.5, 15),
        (2.5, 47.5),
        (30.4, 47.5),
        (30.4, 52.8),
        (49.3, 52.8),
        (49.3, 47.5),
        (64, 47.5),
        (64, 15),
    ]
    for a, b in zip(high, high[1:] + high[:1]):
        wall_with_openings(
            g, a, b, 5.18, 18.90, white if a[0] == b[0] == 2.5 else concrete
        )
    tower = [(30.4, 45.2), (30.4, 52.8), (49.3, 52.8), (49.3, 45.2)]
    for a, b in zip(tower, tower[1:] + tower[:1]):
        wall_with_openings(g, a, b, 18.90, 21.85)
    # Internal walls from the public ground-floor inventory. The full-height partitions
    # give depth to the views through the Jagdweg windows.
    for v1, v2 in ((2.10, 10.8), (12.1, 16.2)):
        g.box(74.77, v1, 1.18, 74.90, v2, 4.93, plaster)
    for v in (12.0, 17.25):
        g.box(76.66, v, 1.18, 80.51, v + 0.12, 4.93, plaster)
    # The rear facade has vertical fluting and concrete bands between its blind panels.
    for l, r in ((2.7, 30.3), (49.4, 63.8)):
        for h in (9.75, 14.37):
            g.box(l, 47.48, h, r, 47.59, h + 0.11, sill)
        for x in np.arange(l + 0.91, r - 0.2, 1.65):
            g.box(x, 47.47, 5.24, x + 0.045, 47.55, 18.73, plaster)
    g.finish()
    g = Part("Nordhof | Rücksprung und Unterfahrt", "rueckseite", "access")
    for x in (19, 26.4, 33.8, 41.3, 48.7, 56.2, 63.5):
        y = 75.94 - 0.011 * x
        g.box(x - 0.085, y - 0.10, 0.016, x + 0.085, y + 0.10, 5.01, steel)
    g.bar(rear_ring[1], rear_ring[-1], 0.18, 4.69, 5.02, roof)
    # The roller shutters are raised in their guide rails below the overhang.
    for x, w in shutter_bays:
        y = 70.25 - (x - 18.7) * 0.0096
        for side in (-1, 1):
            jamb = x + side * w / 2
            g.box(jamb - 0.048, y, 0.14, jamb + 0.048, y + 0.10, 3.42, steel)
        g.box(x - w / 2 - 0.08, y - 0.02, 3.22, x + w / 2 + 0.08, y + 0.21, 3.59, steel)
        for z in (3.07, 3.14, 3.21):
            g.box(x - w / 2, y + 0.06, z, x + w / 2, y + 0.09, z + 0.067, sill)
    x, y = 61.5, 69.84
    g.box(x - 0.62, y, 0.14, x + 0.62, y + 0.09, 3.42, steel)
    # The orthophoto and both oblique views show two parallel concrete edges in the parking apron.
    for x in (31.8, 34.9):
        g.slope((x, 75.4), (x, 85.1), 0.17, 0.76, 0.19, 0, concrete, base_height=-0.02)
        g.slope((x, 75.4), (x, 85.1), 0.21, 0.79, 0.22, 0.045, sill)
    g.slope(
        (33.35, 75.4), (33.35, 85.1), 2.9, 0.12, 0.012, 0.040, paver, base_height=-0.026
    )
    markings = material("Nordhof | verblasste Stellplatzmarkierung", "cbc9b9")
    for x in (
        6.3,
        9.1,
        11.9,
        14.7,
        17.5,
        20.3,
        23.1,
        40.6,
        43.4,
        46.2,
        49.0,
        51.8,
        54.6,
    ):
        g.bar((x, 76.5), (x, 81.4), 0.046, -0.023, -0.016, markings)
        g.bar((x, 81.42), (x + 0.41, 81.42), 0.046, -0.023, -0.016, markings)
    g.finish()

    interior = part("Tragwerk | Geschossdecken hinter dem Glas")
    floor = part("Erdgeschoss | Fußboden hinter den Fassaden")
    floor.prism(boundary, 0.98, 1.18, concrete, paver)
    obj = floor.finish()
    cut_court(obj, court)
    for z in (5.30, 9.90, 14.50):
        interior.prism(high, z - 0.20, z, concrete, paver)
        for x in (3.0, 16.7, 32.2, 47.8, 63.4):
            for y in (17.3, 31.1, 45.6):
                interior.box(
                    x - 0.17,
                    y - 0.19,
                    z,
                    x + 0.17,
                    y + 0.19,
                    min(z + 4.6, 18.82),
                    concrete,
                )
    for u in (69.2, 80.2):
        for v in (4.2, 17.8, 32.5, 48.5, 66.5, 79.1):
            interior.box(u - 0.15, v - 0.17, 1.18, u + 0.15, v + 0.17, 8.23, concrete)
    interior.finish()


def neighbors():
    # Independent survey buildings follow the neighborhood visibility switch.
    white_mass = material("Nachbarhäuser | mattweiß", "ffffff", roughness=0.94)
    for f in survey["neighbors"]:
        part_id = "osm-" + f["osm"]
        g = Part("Nachbargebäude | " + part_id, part_id, "neighbor")
        g.prism(f["outline"], -0.10, f["height"], white_mass)
        obj = g.finish()
        if f["osm"] == "w150966261":
            # Recess the two window rows of No. 15 into the same white mass as its roof.
            # The small end windows face the Jagdweg, the taller ones face the driveway.
            cuts = Part("Fensterlaibungen Jagdweg 15", part_id, "neighbor")
            for z in (1.08, 3.98):
                for v in (96.99, 97.99, 98.99):
                    x = 81.76 + (v - 95.53) * 0.029
                    cuts.box(
                        x - 0.26,
                        v - 0.28,
                        z + 0.40,
                        x + 0.25,
                        v + 0.28,
                        z + 1.02,
                        white_mass,
                    )
                for u in np.arange(53.95, 81.2, 3.25):
                    v = 96.43 - (u - 52.17) * 0.0304
                    cuts.box(
                        u - 0.96, v - 0.22, z, u + 0.96, v + 0.28, z + 1.57, white_mass
                    )
            tool = cuts.finish()
            modifier = obj.modifiers.new("Fensterlaibungen", "BOOLEAN")
            modifier.operation, modifier.object = "DIFFERENCE", tool
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            bpy.data.objects.remove(tool, do_unlink=True)
        for hole in f["holes"]:
            cut_court(obj, hole)


rear_roof()
building_walls()
neighbors()

model = root / "public/models/rosenwerk/context.glb"
project = root / "assets/rosenwerk/context.blend"
model.parent.mkdir(parents=True, exist_ok=True)
project.parent.mkdir(parents=True, exist_ok=True)
# The source project keeps shell, cutaway and equipment independently editable.
collection_names = {
    "building": "01 · Gebäudehülle",
    "exterior": "01 · Gebäudehülle",
    "container": "02 · Kunststoffschmiede",
    "platform": "02 · Kunststoffschmiede",
    "slab": "03 · Schnittmodell",
    "interior": "03 · Schnittmodell",
    "machine": "04 · Maschinen",
    "access": "06 · Zugänge",
    "ground": "07 · Freiflächen",
    "surround": "07 · Freiflächen",
    "neighbor": "09 · Nachbargebäude",
    "upper": "08 · Obergeschosse",
    "upper_support": "08 · Obergeschosse",
}
collections = {}
for obj in list(scene.objects):
    if obj["kind"] == "machine" or (
        obj["kind"] == "interior" and obj["id"] != court_id
    ):
        level = site["roomLevels"].get(obj["id"], 0)
        obj["level"] = level
        if level:
            floor = next(
                f
                for f in [site["basement"], *site["upperFloors"]]
                if f["level"] == level
            )
            obj.location.z += floor["height"] - 0.31
        else:
            obj.location.z += site["inventoryLift"]
    name = collection_names[obj["kind"]]
    if obj["kind"] == "interior" and obj["id"] != court_id:
        name = "04 · Maschinen"
    if name not in collections:
        collections[name] = bpy.data.collections.new(name)
        scene.collection.children.link(collections[name])
    collections[name].objects.link(obj)
    scene.collection.objects.unlink(obj)
bpy.context.view_layer.update()
bake_daylight = runpy.run_path(str(root / "scripts/rosenwerk/bake_daylight.py"))[
    "bake_daylight"
]
bake_daylight(
    scene,
    {
        verge_finish,
        yard_concrete,
        asphalt,
        drive_asphalt,
        block_paving,
        grass,
        worn_edge,
    },
    {tar, membrane, roof},
    world,
    axis,
    across,
    anchor,
    packed_texture,
)
bpy.ops.export_scene.gltf(
    filepath=str(model),
    export_format="GLB",
    export_vertex_color="ACTIVE",
    use_active_scene=True,
    export_extras=True,
    export_cameras=False,
    export_lights=False,
)
# Open the authoring file in the same exterior view as the website. The complete
# cutaway is already present in the GLB and can be toggled by collection in Blender.
for name in ("03 · Schnittmodell", "08 · Obergeschosse"):
    collections[name].hide_render = True
    collections[name].hide_viewport = True
# A source-only camera and lighting make the saved Blender scene ready for inspection.
view = bpy.data.collections.new("05 · Modellansicht")
scene.collection.children.link(view)
target = Vector((-17, 5, 2))
camera = bpy.data.objects.new("Übersicht", bpy.data.cameras.new("Übersicht"))
view.objects.link(camera)
camera.location = target + Vector((42, 112, 86))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type, camera.data.ortho_scale = "ORTHO", 150
scene.camera = camera
light = bpy.data.objects.new("Tageslicht", bpy.data.lights.new("Tageslicht", "SUN"))
view.objects.link(light)
light.rotation_euler = Vector((64, 72, -87)).to_track_quat("-Z", "Y").to_euler()
light.data.energy, light.data.angle = 1.92, math.radians(5)
light.data.color = (1.0, 0.91, 0.80)
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.world = bpy.data.worlds.new("Bedeckter Himmel")
scene.world.use_nodes = True
env = scene.world.node_tree.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(str(model.parent / "licht/himmel.hdr"))
env.image.pack()
scene.world.node_tree.links.new(
    env.outputs["Color"], scene.world.node_tree.nodes["Background"].inputs[0]
)
scene.render.resolution_x, scene.render.resolution_y = 1400, 1000
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D" and screen == bpy.context.screen:
            viewport = area.spaces.active.region_3d
            viewport.view_rotation = camera.rotation_euler.to_quaternion()
            viewport.view_distance, viewport.view_location = 140, target
if bpy.app.background and not bpy.data.filepath:
    # A clean headless build produces an ordinary project with its own opening viewport.
    for unused_scene in list(bpy.data.scenes):
        if unused_scene != scene:
            bpy.data.scenes.remove(unused_scene)
    bpy.data.orphans_purge(do_recursive=True)
    with tempfile.TemporaryDirectory(dir=project.parent) as staging:
        output = Path(staging) / project.name
        bpy.ops.wm.save_as_mainfile(filepath=str(output), copy=True, compress=True)
        os.replace(output, project)
else:
    # When modelling in an open Blender session, export only the Rosenwerk scene.
    bpy.data.libraries.write(str(project), {scene}, fake_user=True, compress=True)
runpy.run_path(str(root / "scripts/rosenwerk/bake_reflections.py"))["bake_reflections"](
    scene,
    world,
    probe_positions,
    model.parent / "licht",
    json.loads((root / "src/lib/rosenwerk/arrival-context.json").read_text())[
        "streets"
    ],
    east_north,
)
print(f"{len(scene.objects)} Teile, {model.stat().st_size:,} Byte GLB")
