import type { ReactNode } from "react";

import PageTitle, {
  type PageTitleAction,
} from "@/app/[lang]/components/PageTitle";

import { getRessort, type RessortId } from "./ressorts";

type SubPageTitleProps = {
  ressort: RessortId;
  title: ReactNode;
  subTitle?: ReactNode;
  links?: PageTitleAction[];
  customActions?: ReactNode;
};

// Unterseite eines Ressorts: Zurück-Taste oben, darunter die kleinere Überschrift.
export default function SubPageTitle({
  ressort,
  title,
  subTitle,
  links,
  customActions,
}: SubPageTitleProps) {
  const parent = getRessort(ressort);

  return (
    <PageTitle
      backLink={{ href: parent.href, label: "Zurück" }}
      title={title}
      subTitle={subTitle}
      links={links}
      customActions={customActions}
      titleClassName="text-[length:var(--ui-size-section)]"
    />
  );
}
