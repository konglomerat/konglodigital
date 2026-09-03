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
      <SubPageTitle ressort="buchhaltung" title={title} subTitle={description} />
      {helperText ? (
        <p className="text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}
