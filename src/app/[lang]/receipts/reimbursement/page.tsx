import ReimbursementForm from "./ReimbursementForm";

// Buchhaltung: volle Kreditorensuche, Kostenstellen nur aus den eigenen
// Bereichen. Mitglieder reichen über /account/rueckerstattung ein.
export default function ReimbursementPage() {
  return <ReimbursementForm mode="buchhaltung" />;
}
