// src/app/[lang]/werkbereiche/layout.tsx
// Grid mit stabiler linker Werkbereichs-Navigation — Sidemenü bleibt bei
// Übersicht UND Subpage an identischer Position.
import WerkbereichSideNav from "./WerkbereichSideNav";

export default function WerkbereicheLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-start gap-8 md:grid-cols-[212px_minmax(0,1fr)]">
      <WerkbereichSideNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
