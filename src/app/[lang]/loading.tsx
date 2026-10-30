// Allgemeines Skelett für jeden Seitenwechsel unter /[lang]. Ohne diese
// Grenze bliebe nach einem Klick die alte Seite stehen, bis der Server die
// neue komplett fertig hat — und es sähe aus, als wäre nichts passiert.
// In der Verwaltung steht die Leiste schon im Skelett, solange ihr Rahmen lädt.
import { RouteSkeleton } from "./components/RouteSkeleton";

export default function Loading() {
  return <RouteSkeleton />;
}
