import routes from "./walking-routes.json";

export const walkingRoutes = routes;

export function walkingRoute(id: string) {
  return routes.find((route) => route.id === id) ?? routes[0];
}

export function walkSummary(route: (typeof routes)[number]) {
  return `ca. ${Math.round(route.seconds / 60)} Min. · ${Math.round(route.meters / 10) * 10} m`;
}

export function walkDirections(id: string) {
  const steps =
    id === "freiberger-strasse"
      ? [
          "Am Bahnsteigende die Treppe zur Unterführung nehmen. Unten links in Richtung Freiberger Straße gehen.",
          "Dem Fußweg und der Zufahrt bis zur Freiberger Straße folgen. Dort links in Richtung Florastraße gehen.",
        ]
      : id === "florastrasse-2"
        ? [
            "Von Steig 2 auf die Jagdwegseite der Freiberger Straße wechseln. Dem Gehweg Richtung Südwesten folgen.",
          ]
        : [
            "Von Steig 1 auf der Jagdwegseite der Freiberger Straße Richtung Südwesten gehen.",
          ];
  return [
    ...steps,
    "Links in den Jagdweg einbiegen und dem Gehweg bis zur Hausnummer 1–3 folgen.",
    "Rechts über den kurzen Zugangsweg und die Außentreppe zum Haupteingang gehen.",
  ];
}
