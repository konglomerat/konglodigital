import type { ReactNode } from "react";
import Link from "next/link";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "./Button";

type PageTitleButtonKind =
  | "primary"
  | "secondary"
  | "danger-primary"
  | "danger-secondary";

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
    <Link
      href={backLink.href}
      className="inline-flex w-fit shrink-0 items-center gap-2 border border-foreground bg-card px-4 py-2 text-sm font-bold text-foreground transition hover:bg-primary-soft"
    >
      <FontAwesomeIcon
        icon={backLink.icon ?? faArrowLeft}
        className="h-3.5 w-3.5"
      />
      <span>{backLink.label}</span>
    </Link>
  ) : null;

  return (
    <header className={wrapperClassName}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {backLinkElement}
          {eyebrow ? (
            <p className={`${resolvedEyebrowClassName} ${backLink ? "mt-4" : ""}`}>
              {eyebrow}
            </p>
          ) : null}
          <Heading
            className={`${resolvedTitleClassName}${
              backLink && !eyebrow ? " mt-4" : ""
            }`}
          >
            {title}
          </Heading>
        </div>

        {customActions || (links && links.length > 0) ? (
          <div className="flex flex-wrap items-center gap-2">
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
