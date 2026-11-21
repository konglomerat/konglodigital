import type { ReactNode } from "react";

import PageTitle from "@/app/[lang]/components/PageTitle";

import RessortLinks, { type RessortLink } from "./RessortLinks";

type RessortPageProps = {
  title: ReactNode;
  subTitle?: ReactNode;
  links?: RessortLink[];
  /** Kacheln umbrechen statt in einer Reihe. */
  wrapLinks?: boolean;
  children?: ReactNode;
};

// Einheitliches Grundskelett aller Verwaltungsseiten, damit Überschrift,
// Unterzeile und Kacheln beim Navigieren an derselben Stelle stehen.
export default function RessortPage({
  title,
  subTitle,
  links,
  wrapLinks,
  children,
}: RessortPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle headingLevel={2} title={title} subTitle={subTitle} />
      {links && links.length > 0 ? <RessortLinks links={links} wrap={wrapLinks} /> : null}
      {children}
    </div>
  );
}
