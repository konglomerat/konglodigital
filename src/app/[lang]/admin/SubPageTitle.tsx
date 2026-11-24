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
  // Ohne Zurück-Taste, wenn die Ressort-Startseite übersprungen wird, weil es
  // nur diese eine Unterseite gibt.
  hideBack?: boolean;
  // Zurück zur vorherigen App-Seite statt zum festen Ziel, falls es eine gibt
  // (z. B. Formulare, die man aus verschiedenen Listen heraus öffnet).
  preferHistory?: boolean;
};

// Unterseite eines Ressorts: Zurück-Taste oben, darunter die kleinere Überschrift.
export default function SubPageTitle({
  ressort,
  title,
  subTitle,
  links,
  customActions,
  backHref,
  hideBack = false,
  preferHistory = false,
}: SubPageTitleProps) {
  const parent = getRessort(ressort);

  return (
    <PageTitle
      backLink={
        hideBack
          ? undefined
          : { href: backHref ?? parent.href, label: "Zurück", preferHistory }
      }
      title={title}
      subTitle={subTitle}
      links={links}
      customActions={customActions}
      titleClassName="text-[length:var(--ui-size-section)]"
    />
  );
}
