// Allgemeines Skelett für jeden Seitenwechsel unter /[lang]. Ohne diese
// Grenze bliebe nach einem Klick die alte Seite stehen, bis der Server die
// neue komplett fertig hat — und es sähe aus, als wäre nichts passiert.
import { PageSkeleton } from "./components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton />;
}
