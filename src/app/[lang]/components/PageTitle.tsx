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

type PageTitleAction = PageTitleLink | PageTitleButtonAction;

type PageTitleBackLink = {
  href: string;
  label: ReactNode;
  icon?: IconProp;
};

type PageTitleProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
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
  const resolvedEyebrowClassName = eyebrowClassName
    ? `text-sm font-semibold uppercase tracking-widest text-primary ${eyebrowClassName}`
    : "text-sm font-semibold uppercase tracking-widest text-primary";
  const resolvedTitleClassName = titleClassName
    ? `text-4xl font-extrabold tracking-tight text-foreground md:text-5xl ${titleClassName}`
    : "text-4xl font-extrabold tracking-tight text-foreground md:text-5xl";
  const resolvedSubTitleClassName = subTitleClassName
    ? `mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground ${subTitleClassName}`
    : "mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground";

  return (
    <header className={wrapperClassName}>
      {backLink ? (
        <Link
          href={backLink.href}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary transition hover:text-primary/80"
        >
          <FontAwesomeIcon
            icon={backLink.icon ?? faArrowLeft}
            className="h-3.5 w-3.5"
          />
          <span>{backLink.label}</span>
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow ? <p className={resolvedEyebrowClassName}>{eyebrow}</p> : null}
          <h1 className={resolvedTitleClassName}>
            {title}
          </h1>
          {subTitle ? (
            <p className={resolvedSubTitleClassName}>
              {subTitle}
            </p>
          ) : null}
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
    </header>
  );
}
