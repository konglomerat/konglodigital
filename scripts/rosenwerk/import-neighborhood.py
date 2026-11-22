"""Build the local approach map from a complete OSM XML map extract."""

import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).resolve().parents[2] / "src/lib/rosenwerk"
west, south, east, north = 13.7100, 51.0440, 13.7251, 51.0522
widths = {
    "primary": 10,
    "secondary": 10,
    "tertiary": 12,
    "residential": 7,
    "unclassified": 6,
    "living_street": 5,
    "primary_link": 4,
    "secondary_link": 4,
}
# The mapped service and pedestrian connections between the station and the street.
station_links = {
    "755148634",
    "26737625",
    "1193831368",
    "760035192",
    "1263015960",
    "26737664",
}


def clip_lines(points):
    lines = []
    for (x, y), (xx, yy) in zip(points, points[1:]):
        dx, dy = xx - x, yy - y
        start, end = 0.0, 1.0
        for k, q in (
            (-dx, x - west),
            (dx, east - x),
            (-dy, y - south),
            (dy, north - y),
        ):
            if k == 0 and q < 0:
                end = -1
                break
            if k < 0:
                start = max(start, q / k)
            elif k > 0:
                end = min(end, q / k)
        if start >= end:
            continue
        a, b = ([round(x + t * dx, 6), round(y + t * dy, 6)] for t in (start, end))
        if a == b:
            continue
        if lines and lines[-1][-1] == a:
            lines[-1].append(b)
        else:
            lines.append([a, b])
    return lines


def height(tags):
    for key, factor, source in (
        ("height", 1, "height"),
        ("building:levels", 3, "levels"),
    ):
        try:
            n = float(tags.get(key, "").removesuffix(" m"))
        except ValueError:
            continue
        if math.isfinite(n) and n > 0:
            return round(n * factor, 1), source
    estimate = {
        "garage": 3,
        "garages": 3,
        "roof": 4,
        "service": 3.5,
        "apartments": 12,
        "office": 12,
        "ruins": 3,
    }
    return estimate.get(tags.get("building"), 7), "estimate"


def tags(element):
    return {t.get("k"): t.get("v") for t in element.findall("tag")}


def read_context(xml):
    nodes = {
        n.get("id"): (float(n.get("lon")), float(n.get("lat")))
        for n in xml.findall("node")
    }
    ways = {w.get("id"): w for w in xml.findall("way")}
    site = json.loads((root / "site.json").read_text())
    survey = json.loads((root / "survey.json").read_text())
    modeled = {n["osm"] for n in survey["neighbors"]} | {
        "w" + b["id"].removeprefix("osm-") for b in site["buildings"]
    }
    modeled.update(survey["modeledEntranceFootprints"])
    streets, rails, trams, buildings = [], [], [], []

    def points(way):
        return [nodes[nd.get("ref")] for nd in way.findall("nd")]

    def ring(way):
        coords = points(way)
        if len(coords) < 4 or coords[0] != coords[-1]:
            return None
        return [[round(x, 6), round(y, 6)] for x, y in coords[:-1]]

    def building(key, t, outline, holes):
        if not any(west <= x <= east and south <= y <= north for x, y in outline):
            return
        if key in modeled:
            return
        h, source = height(t)
        record = dict(
            id=key, outline=outline, holes=holes, height=h, heightSource=source
        )
        if t.get("building") == "roof":
            record["baseHeight"] = round(max(0, h - 0.24), 2)
        buildings.append(record)

    # In this extract the complete building multipolygons have a single closed
    # outer way and closed courtyard ways. Do not fill a partial relation.
    for rel in xml.findall("relation"):
        t = tags(rel)
        if t.get("type") != "multipolygon" or "building" not in t:
            continue
        members = [
            m for m in rel.findall("member") if m.get("role") in ("outer", "inner")
        ]
        rings = [
            ring(ways[m.get("ref")]) if m.get("ref") in ways else None for m in members
        ]
        if not all(rings):
            continue
        outers = [r for m, r in zip(members, rings) if m.get("role") == "outer"]
        if len(outers) != 1:
            continue
        building(
            "r" + rel.get("id"),
            t,
            outers[0],
            [r for m, r in zip(members, rings) if m.get("role") == "inner"],
        )
        modeled.update("w" + m.get("ref") for m in members)
    for way_id, w in ways.items():
        t = tags(w)
        key = "w" + way_id
        width = widths.get(t.get("highway"), 4 if way_id in station_links else None)
        if width and t.get("area") != "yes":
            streets.extend(dict(width=width, points=p) for p in clip_lines(points(w)))
        if t.get("railway") == "tram" and not t.get("service"):
            trams.extend(clip_lines(points(w)))
        if (
            t.get("railway") == "rail"
            and t.get("usage") != "industrial"
            and not t.get("service")
        ):
            rails.extend(clip_lines(points(w)))
        if t.get("building") and t["building"] != "no" and key not in modeled:
            outline = ring(w)
            if outline:
                building(key, t, outline, [])
    return dict(streets=streets, rails=rails, trams=trams, buildings=buildings)


if __name__ == "__main__":
    context = read_context(ET.parse(sys.argv[1]).getroot())
    (root / "arrival-context.json").write_text(
        json.dumps(context, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    print({key: len(records) for key, records in context.items()})
