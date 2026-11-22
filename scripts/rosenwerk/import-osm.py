"""Refresh only the Rosenwerk footprint from an OSM XML extract containing the complete way."""
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

site_path = Path(__file__).resolve().parents[2] / "src/lib/rosenwerk/site.json"
site = json.loads(site_path.read_text())
data = ET.parse(sys.argv[1]).getroot()
building = site["buildings"][0]
way_id = building["id"].removeprefix("osm-")
way = data.find(f"way[@id='{way_id}']")
if way is None:
    raise ValueError(f"XML enthält den Rosenwerk-Grundriss {way_id} nicht")
nodes = {n.get("id"): [float(n.get("lon")), float(n.get("lat"))] for n in data.findall("node")}
ring = [nodes[n.attrib["ref"]] for n in way.findall("nd")]
if len(ring) < 4 or ring[0] != ring[-1]:
    raise ValueError("Der Gebäudegrundriss muss geschlossen sein")
building["coordinates"] = ring
site_path.write_text(json.dumps(site, ensure_ascii=False, indent=2)+"\n")
