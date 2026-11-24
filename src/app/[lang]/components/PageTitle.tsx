import type { ReactNode } from "react";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

import Button from "@/components/knglmrt/Button";
import BackLink from "./BackLink";

type PageTitleButtonKind =
  "primary" | "secondary" | "emphasis" | "danger-primary" | "danger-secondary";

type PageTitleButtonSize = "small" | "medium" | "large";

type PageTitleActionBase = {
  id?: string;
  label: ReactNode;
  icon?: IconProp;
  kind?: PageTitleButtonKind;
  size?: PageTitleButtonSize;
  className?: string;
};

type PageTitleLink = PageTitleActionBase & {
  href: string;
  target?: string;
  rel?: string;
};

type PageTitleButtonAction = PageTitleActionBase & {
  onClick: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
};

export type PageTitleAction = PageTitleLink | PageTitleButtonAction;

type PageTitleBackLink = {
  href: string;
  label: ReactNode;
  icon?: IconProp;
  // Zur vorherigen App-Seite zurück statt zu `href`, falls es eine gibt.
  preferHistory?: boolean;
};

type PageTitleProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  headingLevel?: 1 | 2;
  subTitle?: ReactNode;
  links?: PageTitleAction[];
  customActions?: ReactNode;
  backLink?: PageTitleBackLink;
  className?: string;
  eyebrowClassName?: string;
  titleClassName?: string;
  subTitleClassName?: string;
};

// Rasterplätze für Augenbraue, Zurück-Taste, Überschrift und Aktionen. Die
// Klassen stehen ausgeschrieben, damit Tailwind sie findet.
const getTitleLayout = ({
  hasBack,
  hasEyebrow,
}: {
  hasBack: boolean;
  hasEyebrow: boolean;
}) => {
  const titleRow = hasEyebrow ? "row-start-2" : "row-start-1";
  const titleCol = hasBack ? "col-start-2" : "col-start-1";
  return {
    columns: hasBack
      ? "grid-cols-[auto_minmax(0,1fr)_auto]"
      : "grid-cols-[minmax(0,1fr)_auto]",
    eyebrow: `${titleCol} row-start-1`,
    back: `col-start-1 ${titleRow}`,
    // Neben Taste und Aktionen wird es schmal: lange Wörter trennen statt
    // unter die Aktionen laufen.
    heading: `${titleCol} ${titleRow} hyphens-auto break-words`,
    actions: `${hasBack ? "col-start-3" : "col-start-2"} ${titleRow}`,
  };
};

export default function PageTitle({
  eyebrow,
  title,
  headingLevel = 1,
  subTitle,
  links,
  customActions,
  backLink,
  className,
  eyebrowClassName,
  titleClassName,
  subTitleClassName,
}: PageTitleProps) {
  const wrapperClassName = className
    ? `flex flex-col gap-4 ${className}`
    : "flex flex-col gap-4";
  // Typografie nach Konglomerat-DS: Augenbraue = knglmrt-caption,
  // Titel = Fengardo Neue Black 32/34, Untertitel = UI-Text.
  const baseEyebrowClassName = "knglmrt-caption mb-1.5 text-primary";
  const baseTitleClassName = "text-foreground";
  const baseSubTitleClassName =
    "mt-2 max-w-[620px] text-[length:var(--ui-size-body)] leading-[var(--ui-line-body)] text-muted-foreground";
  const resolvedEyebrowClassName = eyebrowClassName
    ? `${baseEyebrowClassName} ${eyebrowClassName}`
    : baseEyebrowClassName;
  const resolvedTitleClassName = titleClassName
    ? `${baseTitleClassName} ${titleClassName}`
    : baseTitleClassName;
  const resolvedSubTitleClassName = subTitleClassName
    ? `${baseSubTitleClassName} ${subTitleClassName}`
    : baseSubTitleClassName;
  const Heading = headingLevel === 2 ? "h2" : "h1";
  const backLinkElement = backLink ? (
    <BackLink
      href={backLink.href}
      label={backLink.label}
      icon={backLink.icon}
      preferHistory={backLink.preferHistory}
    />
  ) : null;

  const hasActions = Boolean(customActions) || (links?.length ?? 0) > 0;
  const layout = getTitleLayout({
    hasBack: Boolean(backLinkElement),
    hasEyebrow: Boolean(eyebrow),
  });

  return (
    <header className={wrapperClassName}>
      {/* Eine Zeile aus Zurück-Taste, Überschrift und Aktionen, vertikal
          mittig zueinander; die Augenbraue steht darüber in der Titelspalte.
          Lange Überschriften brechen um, die Aktionen bleiben rechts. */}
      <div className={`grid items-center gap-x-4 gap-y-3 ${layout.columns}`}>
        {eyebrow ? (
          <p className={`${resolvedEyebrowClassName} ${layout.eyebrow}`}>
            {eyebrow}
          </p>
        ) : null}
        {backLinkElement ? (
          <div className={layout.back}>{backLinkElement}</div>
        ) : null}
        <Heading className={`${resolvedTitleClassName} ${layout.heading}`}>
          {title}
        </Heading>

        {hasActions ? (
          <div
            className={`flex flex-wrap items-center justify-end gap-2 ${layout.actions}`}
          >
            {customActions}
            {(links ?? []).map((link, index) => {
              const actionKey =
                link.id ??
                `${typeof link.label === "string" ? link.label : "action"}-${index}`;

              if ("href" in link) {
                return (
                  <Button
                    key={actionKey}
                    href={link.href}
                    target={link.target}
                    rel={link.rel}
                    kind={link.kind ?? "secondary"}
                    size={link.size ?? "small"}
                    className={link.className}
                    icon={link.icon}
                  >
                    {link.label}
                  </Button>
                );
              }

              return (
                <Button
                  key={actionKey}
                  type={link.type ?? "button"}
                  onClick={link.onClick}
                  disabled={link.disabled}
                  kind={link.kind ?? "secondary"}
                  size={link.size ?? "small"}
                  className={link.className}
                  icon={link.icon}
                >
                  {link.label}
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>

      {subTitle ? (
        <p className={resolvedSubTitleClassName}>{subTitle}</p>
      ) : null}
    </header>
  );
}
