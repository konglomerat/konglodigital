import ModuleAccessGuard from "../../ModuleAccessGuard";

// Anträge ans Gremium: nur der Vorstand entscheidet, deshalb hier das engere
// Gate als im Ressort selbst (das auch VHC sehen dürfen).
export default function VorstandEhrenamtsbonusLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleAccessGuard module="admin">{children}</ModuleAccessGuard>;
}
