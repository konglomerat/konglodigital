// Brotkrumen im Muster des Prototyps: Fira Mono 12/16, dark-60,
// Trenner " / ", der letzte Eintrag ohne Link.
import Link from "next/link";
import { Fragment } from "react";

export type Crumb = { label: string; href?: string };

export default function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Brotkrumen"
      className={`knglmrt-num mb-2.5 text-muted-foreground${
        className ? ` ${className}` : ""
      }`}
    >
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 ? <span aria-hidden="true"> / </span> : null}
          {item.href ? (
            <Link href={item.href} className="hover:text-primary">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
