import { loadInventoryPlace } from "@/lib/inventory-place-server";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { getServerI18n } from "@/i18n/server";
import { localizePathname } from "@/i18n/config";
import ResourcesMapView from "../resources/ResourcesMapView";
import { getPointFeatures } from "../resources/map-features";

export default async function InventoryPlaceMap({ identifier }: { identifier: string }) {
  const [place, { locale }] = await Promise.all([loadInventoryPlace(identifier), getServerI18n()]);
  if (!place) return <p>Der Ort ist gerade nicht verfügbar.</p>;
  const point = getPointFeatures(place.mapFeatures)[0]?.point;
  return <div className="space-y-4" data-inventory-place={place.id}>
    <a className="block font-bold text-primary hover:underline" href={localizePathname(buildResourcePath(place), locale)}>{place.name}</a>
    {point ? <>
      <ResourcesMapView resources={[place]} pointResources={[place]} initialMaxZoom={18} className="inventory-place-map h-64 w-full overflow-hidden knglmrt-border" />
      <a className="inline-block text-sm font-bold text-primary hover:underline" href={`https://www.google.com/maps?q=${point[1]},${point[0]}`} target="_blank" rel="noreferrer">Route planen →</a>
    </> : <p>Für diesen Ort ist noch keine Position hinterlegt.</p>}
  </div>;
}
