// Ausklappbare Kurzfassung der Rechte-Logik auf der Benutzerseite. Die
// Rollenliste kommt aus role-config.ts, damit sie nicht veraltet.
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ROLE_CONFIG, ROLE_NAMES } from "@/lib/access/role-config";

const SCOPING_LABELS = {
  global: "nur global",
  global_or_scope: "global oder pro Bereich",
} as const;

export default function AccessRulesExplainer() {
  return (
    <details className="group knglmrt-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-bold [&::-webkit-details-marker]:hidden">
        So funktionieren Rollen und Zugriffe
        <FontAwesomeIcon
          icon={faChevronDown}
          aria-hidden="true"
          className="h-3 w-3 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-4 border-t border-border px-5 pb-5 pt-4">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            Ohne Rolle hat ein Mitglied nur sein eigenes Konto. Alles in der
            Verwaltung braucht eine Rolle.
          </li>
          <li>
            Eine Rolle gilt <strong>global</strong> oder für einen{" "}
            <strong>Bereich</strong>, also einen Werkbereich oder ein Projekt.
            Global heißt: in allen Bereichen.
          </li>
          <li>
            Buchhaltung für einen Bereich zeigt nur Belege, Kassen und
            Kostenstellen dieses Bereichs, samt Unterprojekten (Holz 57 →
            571, 572 …). Ändern lässt sich ein Beleg nur, wenn alle seine
            Positionen im eigenen Bereich liegen.
          </li>
          <li>
            Rollen vergeben und entziehen dürfen nur Admins, in der
            Profilansicht einer Person.
          </li>
          <li>
            Der letzte globale Admin kann nicht entfernt werden.
          </li>
          <li>
            Eigene Inventar- und Showcase-Einträge darf jedes Mitglied
            bearbeiten; fremde nur mit der Rolle Inventar bzw. Showcase.
          </li>
          <li>
            Das Verwaltungsmenü zeigt nur, was man öffnen darf. Geprüft wird
            trotzdem auf jeder Seite und in jeder Schnittstelle.
          </li>
        </ul>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="knglmrt-border-b">
              <tr>
                <th className="knglmrt-caption px-3 py-2 text-muted-foreground">
                  Rolle
                </th>
                <th className="knglmrt-caption px-3 py-2 text-muted-foreground">
                  Gilt
                </th>
                <th className="knglmrt-caption px-3 py-2 text-muted-foreground">
                  Darf
                </th>
              </tr>
            </thead>
            <tbody>
              {ROLE_NAMES.map((name) => (
                <tr key={name} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-semibold">
                    {ROLE_CONFIG[name].label}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {SCOPING_LABELS[ROLE_CONFIG[name].scoping]}
                  </td>
                  <td className="px-3 py-2">{ROLE_CONFIG[name].description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
