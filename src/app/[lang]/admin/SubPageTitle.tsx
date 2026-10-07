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
  // Zurück-Ziel, falls nicht die Ressort-Startseite (z. B. eine Liste darüber).
  backHref?: string;
};

// Unterseite eines Ressorts: Zurück-Taste oben, darunter die kleinere Überschrift.
export default function SubPageTitle({
  ressort,
  title,
  subTitle,
  links,
  customActions,
  backHref,
}: SubPageTitleProps) {
  const parent = getRessort(ressort);

  return (
    <PageTitle
      backLink={{ href: backHref ?? parent.href, label: "Zurück" }}
      title={title}
      subTitle={subTitle}
      links={links}
      customActions={customActions}
      titleClassName="text-[length:var(--ui-size-section)]"
    />
  );
}
