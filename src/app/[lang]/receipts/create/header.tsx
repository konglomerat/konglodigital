import SubPageTitle from "@/app/[lang]/admin/SubPageTitle";

type ReceiptsPageHeaderProps = {
  title: string;
  description?: string;
  helperText?: string;
};

export default function ReceiptsPageHeader({
  title,
  description,
  helperText,
}: ReceiptsPageHeaderProps) {
  return (
    <div className="space-y-2">
      {/* Buchungsformulare öffnet man aus der Übersicht wie aus einem
          Werkbereich — „Zurück" soll dorthin, woher man kam. */}
      <SubPageTitle
        ressort="buchhaltung"
        title={title}
        subTitle={description}
        preferHistory
      />
      {helperText ? (
        <p className="text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}
