"""Bake exterior sky visibility into glTF occlusion maps using Blender's ray tree."""

import math

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree


def bake_daylight(
    scene, ground_finishes, roof_finishes, world, axis, across, anchor, packed_texture
):
    # Horizontal receivers use site coordinates for a second UV set. The highest
    # roof and the ground beneath it need independent maps in the same plan area.
    u0, v0, extent, size = -42, -25, 140, 512
    uv_name = "Himmelslicht"
    vertices, blockers = [], []
    receivers = {"Boden": [], "Dach": []}
    assignments = []
    for obj in scene.objects:
        if obj.type != "MESH" or obj.get("kind") not in {
            "building",
            "exterior",
            "ground",
            "access",
            "platform",
            "container",
        }:
            continue
        kind = obj["kind"]
        mesh = obj.data
        start = len(vertices)
        vertices.extend(obj.matrix_world @ vertex.co for vertex in mesh.vertices)
        mesh.calc_loop_triangles()
        selected = {}
        for face in mesh.polygons:
            mat = mesh.materials[face.material_index]
            if face.normal.z < 0.70:
                continue
            if kind in {"ground", "exterior"} and mat in ground_finishes:
                selected[face.index] = "Boden"
            elif kind == "building" and mat in roof_finishes:
                selected[face.index] = "Dach"
        for tri in mesh.loop_triangles:
            indices = tuple(start + i for i in tri.vertices)
            layer = selected.get(tri.polygon_index)
            if layer:
                receivers[layer].append(indices)
            if (
                kind != "ground"
                and mesh.materials[tri.material_index].diffuse_color[3] > 0.95
            ):
                blockers.append(indices)
        if selected:
            assignments.append((mesh, selected))
    caster = BVHTree.FromPolygons(vertices, blockers, all_triangles=True)
    outputs = {}
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket(
            "Occlusion", in_out="INPUT", socket_type="NodeSocketFloat"
        )

    # Cosine-weighted sky samples. Rotate the pattern per texel to avoid repeating
    # ray bands; use a short spatial filter to integrate neighbouring samples.
    count = 40
    rings = []
    for phase in range(8):
        samples = []
        for i in range(count):
            r = math.sqrt((i + 0.5) / count)
            phi = math.tau * (i * 0.61803398875 + phase / 8)
            samples.append((r * math.cos(phi), r * math.sin(phi), math.sqrt(1 - r * r)))
        rings.append(samples)

    for layer, faces in receivers.items():
        receiver = BVHTree.FromPolygons(vertices, faces, all_triangles=True)
        mask = np.zeros((size, size), dtype=bool)
        visibility = np.ones((size, size), dtype=np.float32)
        for row in range(size):
            v = v0 + extent * (row + 0.5) / size
            for col in range(size):
                u = u0 + extent * (col + 0.5) / size
                hit = receiver.ray_cast(world(u, v, 40), (0, 0, -1), 45)[0]
                if hit is None:
                    continue
                hit.z += 0.065
                blocked = 0
                for direction in rings[(row * 5 + col * 3) % 8]:
                    distance = caster.ray_cast(hit, direction, 16)[3]
                    if distance is not None:
                        blocked += (1 - distance / 16) ** 1.4
                visibility[row, col] = 1.0 - 0.88 * blocked / count
                mask[row, col] = True
        # Spread values across atlas boundaries so bilinear filtering and lower
        # mip levels do not introduce a light border beside a wall or parapet.
        for _ in range(3):
            valid = mask.astype(np.float32)
            values = visibility * valid
            total, weight = 4 * values, 4 * valid
            for shift in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                total += np.roll(values, shift, (0, 1))
                weight += np.roll(valid, shift, (0, 1))
            visibility = np.divide(
                total, weight, out=visibility.copy(), where=weight > 0
            )
            mask = weight > 0
        outputs[layer] = np.uint8(np.rint(visibility[::-1] * 255))

    materials, images = {}, {}
    for mesh, selected in assignments:
        uv = mesh.uv_layers.new(name=uv_name)
        coords = np.empty((len(mesh.vertices), 3), dtype=np.float32)
        mesh.vertices.foreach_get("co", coords.ravel())
        xy = coords[:, :2] - np.array(anchor)
        plan = np.column_stack(
            ((xy @ np.array(axis) - u0) / extent, (xy @ np.array(across) - v0) / extent)
        )
        loops = np.empty(len(mesh.loops), dtype=np.int32)
        mesh.loops.foreach_get("vertex_index", loops)
        uv.data.foreach_set("uv", plan[loops].astype(np.float32).ravel())
        mesh.uv_layers.active_index = 0
        for face_index, layer in selected.items():
            face = mesh.polygons[face_index]
            base = mesh.materials[face.material_index]
            key = (base, layer)
            if key not in materials:
                # Retain the public material names on the visible baked surfaces.
                name = base.name
                base.name = name + " | ohne Lichtkarte"
                mat = base.copy()
                mat.name = name
                materials[key] = mat
                tree = mat.node_tree
                if layer not in images:
                    node = packed_texture(
                        mat, outputs[layer], "Himmelslicht " + layer, True
                    )
                    images[layer] = node.image
                else:
                    node = tree.nodes.new("ShaderNodeTexImage")
                    node.image = images[layer]
                node.extension = "EXTEND"
                coords_node = tree.nodes.new("ShaderNodeUVMap")
                coords_node.uv_map = uv_name
                tree.links.new(coords_node.outputs["UV"], node.inputs["Vector"])
                settings = tree.nodes.new("ShaderNodeGroup")
                settings.node_tree = group
                tree.links.new(node.outputs["Color"], settings.inputs["Occlusion"])
            mat = materials[key]
            idx = mesh.materials.find(mat.name)
            if idx < 0:
                idx = len(mesh.materials)
                mesh.materials.append(mat)
            face.material_index = idx
