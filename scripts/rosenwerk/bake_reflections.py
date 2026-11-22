"""Capture linear-HDR local reflection environments from the actual exterior."""

import tempfile
from pathlib import Path

import bpy
from mathutils import Vector


def capture_streets(scene, streets, east_north):
    # Extend the real road alignments below the site's own pavement. The main
    # map uses a light cartographic ground, which overexposes reflected streets.
    verts, faces = [], []
    for road in streets:
        points = [east_north(p) for p in road["points"]]
        for a, b in zip(points, points[1:]):
            if min(a.length, b.length) > 150 or (b - a).length < 0.1:
                continue
            tangent = (b - a).normalized()
            offset = Vector((-tangent.y, tangent.x)) * (road["width"] / 2)
            idx = len(verts)
            verts.extend(
                [(*p, -0.084) for p in (a - offset, b - offset, b + offset, a + offset)]
            )
            faces.append((idx, idx + 1, idx + 2, idx + 3))
    mesh = bpy.data.meshes.new("Straßenflächen im Spiegelbild")
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(mesh.name, mesh)
    scene.collection.objects.link(obj)
    mat = bpy.data.materials.new("Straßenasphalt im Spiegelbild")
    mat.diffuse_color = (0.12, 0.118, 0.114, 1)
    mat.use_nodes = True
    asphalt = mat.node_tree.nodes["Principled BSDF"]
    asphalt.inputs["Base Color"].default_value = mat.diffuse_color
    asphalt.inputs["Roughness"].default_value = 0.91
    mesh.materials.append(mat)
    return obj, mesh, mat


def bake_reflections(scene, world, positions, directory, streets, east_north):
    camera = scene.camera
    neighbors = next(c for c in scene.collection.children if c.name.startswith("09 ·"))
    render = scene.render
    street, mesh, mat = capture_streets(scene, streets, east_north)
    surround = next(obj for obj in scene.objects if obj.get("kind") == "surround")
    base = (
        surround.data.materials[0]
        .node_tree.nodes["Principled BSDF"]
        .inputs["Base Color"]
    )
    neutral = base.default_value[:]
    transform, look = scene.view_settings.view_transform, scene.view_settings.look
    old = (
        camera.data.type,
        camera.rotation_euler.copy(),
        camera.location.copy(),
        render.resolution_x,
        render.resolution_y,
        render.filepath,
        render.image_settings.file_format,
        scene.cycles.samples,
        neighbors.hide_render,
        camera.data.panorama_type,
        render.resolution_percentage,
    )
    try:
        base.default_value = (0.30, 0.285, 0.26, 1)
        scene.view_settings.view_transform = "Raw"
        scene.view_settings.look = "None"
        camera.data.type = "PANO"
        camera.data.panorama_type = "EQUIRECTANGULAR"
        # For Three's equirectangular lookup, U=.5 is east and U=.75 is south.
        camera.rotation_euler = Vector((1, 0, 0)).to_track_quat("-Z", "Y").to_euler()
        render.resolution_x, render.resolution_y, render.resolution_percentage = (
            512,
            256,
            100,
        )
        render.image_settings.file_format = "HDR"
        scene.cycles.samples = 12
        with tempfile.TemporaryDirectory(dir=directory) as staging:
            for zone, pos in positions.items():
                camera.location = world(*pos)
                for hidden in ((False,) if zone == "innenhof" else (False, True)):
                    neighbors.hide_render = hidden
                    name = zone + ("-offen" if hidden else "") + ".hdr"
                    render.filepath = str(Path(staging) / name)
                    bpy.ops.render.render(write_still=True, scene=scene.name)
            for result in Path(staging).glob("*.hdr"):
                result.replace(directory / result.name)
    finally:
        bpy.data.objects.remove(street, do_unlink=True)
        bpy.data.meshes.remove(mesh)
        bpy.data.materials.remove(mat)
        base.default_value = neutral
        scene.view_settings.view_transform, scene.view_settings.look = transform, look
        (
            camera.data.type,
            camera.rotation_euler,
            camera.location,
            render.resolution_x,
            render.resolution_y,
            render.filepath,
            render.image_settings.file_format,
            scene.cycles.samples,
            neighbors.hide_render,
            camera.data.panorama_type,
            render.resolution_percentage,
        ) = old
