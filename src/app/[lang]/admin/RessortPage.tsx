import type { ReactNode } from "react";

import PageTitle from "@/app/[lang]/components/PageTitle";

import { loadNavBadges } from "./nav-badges";
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
// Unterzeile und Kacheln beim Navigieren an derselben Stelle stehen. Die
// Kacheln tragen dieselben Zahlen wie die Leiste.
export default async function RessortPage({
  title,
  subTitle,
  links,
  wrapLinks,
  children,
}: RessortPageProps) {
  const badges = links?.length ? await loadNavBadges() : {};
  const linksWithBadges = links?.map((link) =>
    link.href && badges[link.href] ? { ...link, badge: badges[link.href] } : link,
  );
  return (
    <div className="flex flex-col gap-6">
      <PageTitle headingLevel={2} title={title} subTitle={subTitle} />
      {linksWithBadges && linksWithBadges.length > 0 ? (
        <RessortLinks links={linksWithBadges} wrap={wrapLinks} />
      ) : null}
      {children}
    </div>
  );
}
