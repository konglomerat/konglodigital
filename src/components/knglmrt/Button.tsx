// Die eine Taste des Systems. Portiert aus
// public/branding/controls_surfaces_tables-export/react/ui/Button.jsx und um
// die Rollen erweitert, die die App wirklich braucht (Icon-Tasten, Ladezustand,
// stille Toolbar-Tasten). Wer eine Taste baut, nimmt diese Datei — es gibt
// keine zweite.
//
// Werte 1:1 aus dem Export:
//   Schale   700 13/16, padding 8px 16px, Kontur (--hairline), Radius 0,
//            background-Transition 200ms cubic-bezier(.2,0,0,1)
//   chip     700 11/16, padding 5px 11px — die "sm"-Größe des DS
//   primary  Fläche pink, Hover braun, Schrift weiß
//   emphasis wie primary plus der eine 3px-Offset-Schatten (max. 1× pro View),
//            beim Druck wandert die Taste in den Schatten
//   quiet    keine Kontur, paper-grey, Hover --ui-quiet-hover
//   ghost    keine Kontur, keine Fläche — Hover paper-grey. Für Toolbars,
//            Schließen-Kreuze, Sortierköpfe: alles, was im Ruhezustand
//            unsichtbar bleiben soll.
//   tertiary keine Taste: pinker Fettsatz mit gezeichneter Linie darunter
//   disabled Kontur --border, Fläche --muted, Schrift --muted-foreground
//
// Anders als im Export ist die Größe unabhängig von der Variante: eine kleine
// primäre Taste ist pink, nicht weiß. Sonst hieße "size" heimlich auch "kind".
import { Children, isValidElement } from "react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

import Divider from "@/components/knglmrt/Divider";

export type ButtonKind =
  /** Die Handlung, die die Seite meint. Pink, Hover braun. */
  | "primary"
  /** Der Normalfall: weiß mit Kontur, Hover paper-pink. */
  | "secondary"
  /** Wie primary plus der eine Offset-Schatten. Höchstens einmal pro View. */
  | "emphasis"
  /** Leise Fläche ohne Kontur — Filterleisten, Nebenhandlungen. */
  | "quiet"
  /** Unsichtbar bis zum Hover — Toolbars, Schließen-Kreuze, Sortierköpfe. */
  | "ghost"
  /** Keine Taste: pinker Fettsatz mit gezeichneter Linie darunter. */
  | "tertiary"
  /** Löschen und Verwerfen, gefüllt. */
  | "danger-primary"
  /** Löschen und Verwerfen, als Kontur-Taste. */
  | "danger-secondary";

export type ButtonSize = "chip" | "small" | "medium" | "large";

type ButtonOwnProps = {
  kind?: ButtonKind;
  /** Alias für `kind` — beide Namen laufen auf dieselbe Variante. */
  variant?: ButtonKind;
  size?: ButtonSize;
  icon?: IconProp | null;
  iconPosition?: "left" | "right";
  iconReverse?: boolean;
  /**
   * Quadratische Taste ohne Beschriftung. `children` wandert dann in
   * `aria-label` — das muss der Aufrufer selbst setzen.
   */
  iconOnly?: boolean;
  /** Zeigt den Spinner und sperrt die Taste. */
  loading?: boolean;
  /** Füllt die Zeile. Ersetzt das verstreute `className="w-full"`. */
  fullWidth?: boolean;
  children?: ReactNode;
};

type ButtonAsButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  keyof ButtonOwnProps
> &
  ButtonOwnProps & { href?: undefined };

type ButtonAsLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  keyof ButtonOwnProps
> &
  ButtonOwnProps & { href: string };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

// Fokus ist im DS eine schwarze Outline, kein Ring und kein Schatten.
const focusClassName =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] focus-visible:outline-solid";

const baseClassName = `inline-flex cursor-pointer items-center justify-center gap-2 rounded-none knglmrt-border text-center align-middle font-[family-name:var(--font-core)] font-bold transition-[background-color,color,box-shadow,transform] duration-200 ease-[cubic-bezier(.2,0,0,1)] ${focusClassName} disabled:pointer-events-none disabled:cursor-default disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none aria-disabled:pointer-events-none aria-disabled:cursor-default aria-disabled:border-border aria-disabled:bg-muted aria-disabled:text-muted-foreground`;

const sizeClassName: Record<ButtonSize, string> = {
  chip: "px-[11px] py-[5px] text-[11px] leading-4",
  small: "px-4 py-2 text-[13px] leading-4",
  medium: "px-[18px] py-2.5 text-[13px] leading-4",
  large: "px-[22px] py-3 text-[13px] leading-4",
};

// Quadratisch: die Höhe der Zeile bleibt, die Breite folgt ihr.
const iconOnlySizeClassName: Record<ButtonSize, string> = {
  chip: "h-[26px] w-[26px] p-0 text-[11px]",
  small: "h-8 w-8 p-0 text-[13px]",
  medium: "h-9 w-9 p-0 text-[13px]",
  large: "h-11 w-11 p-0 text-[13px]",
};

const iconPixelSize: Record<ButtonSize, string> = {
  chip: "h-3 w-3",
  small: "h-3.5 w-3.5",
  medium: "h-4 w-4",
  large: "h-4 w-4",
};

const kindClassName: Record<ButtonKind, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-[var(--ui-action-hover)]",
  secondary: "bg-card text-foreground hover:bg-primary-soft",
  emphasis:
    "bg-primary text-primary-foreground shadow-[3px_3px_0_var(--hairline-color)] hover:bg-[var(--ui-action-hover)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  quiet: "border-0 bg-muted text-foreground hover:bg-[var(--ui-quiet-hover)]",
  ghost:
    "border-0 bg-transparent text-foreground hover:bg-muted disabled:bg-transparent aria-disabled:bg-transparent",
  tertiary: "",
  "danger-primary":
    "bg-destructive text-destructive-foreground hover:bg-[var(--ui-action-hover)]",
  "danger-secondary": "bg-card text-destructive hover:bg-destructive-soft",
};

// next/link ist für Seiten der App. Downloads, API-Routen, mailto: und fremde
// Hosts laufen über ein blankes <a> — Link würde sie prefetchen.
function isExternalHref(href: string) {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(href) ||
    href.startsWith("//") ||
    href.startsWith("/api/") ||
    href.startsWith("#")
  );
}

export default function Button({
  kind,
  variant,
  size = "small",
  className,
  children,
  icon,
  iconPosition = "left",
  iconReverse = false,
  iconOnly = false,
  loading = false,
  fullWidth = false,
  ...rest
}: ButtonProps) {
  const resolvedKind = kind ?? variant ?? "secondary";
  const hasIconChild = Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === FontAwesomeIcon,
  );
  const resolvedIcon = loading ? faSpinner : (icon ?? null);
  const resolvedPosition = iconReverse
    ? iconPosition === "left"
      ? "right"
      : "left"
    : iconPosition;
  const iconElement =
    resolvedIcon && (loading || !hasIconChild) ? (
      <FontAwesomeIcon
        icon={resolvedIcon}
        className={`${iconPixelSize[size]}${loading ? " animate-spin" : ""}`}
      />
    ) : null;

  // Icon-Tasten tragen nur das Zeichen; die Beschriftung lebt im aria-label.
  const content = iconOnly ? (
    (iconElement ?? children)
  ) : iconElement ? (
    <>
      {resolvedPosition === "left" ? iconElement : null}
      <span className="inline-flex items-center gap-2">{children}</span>
      {resolvedPosition === "right" ? iconElement : null}
    </>
  ) : (
    children
  );

  // Tertiär ist keine Taste, sondern der pinke Fettsatz mit gezeichneter Linie.
  if (resolvedKind === "tertiary") {
    const tertiaryClassName = `relative inline-block w-max cursor-pointer pb-[9px] text-[13px] font-bold leading-4 text-primary transition-colors duration-200 hover:text-[var(--ui-action-hover)] ${focusClassName}${
      className ? ` ${className}` : ""
    }`;
    const tertiaryContent = (
      <>
        {content}
        <span className="absolute inset-x-0 bottom-0 block">
          <Divider number={4} height={7} color="currentColor" />
        </span>
      </>
    );

    if ("href" in rest && typeof rest.href === "string") {
      const { href, ...anchorProps } = rest;
      if (isExternalHref(href)) {
        return (
          <a href={href} className={tertiaryClassName} {...anchorProps}>
            {tertiaryContent}
          </a>
        );
      }
      return (
        <Link href={href} className={tertiaryClassName} {...anchorProps}>
          {tertiaryContent}
        </Link>
      );
    }

    const { type = "button", ...buttonProps } = rest;
    return (
      <button
        type={type}
        className={tertiaryClassName}
        {...buttonProps}
        disabled={loading || buttonProps.disabled}
      >
        {tertiaryContent}
      </button>
    );
  }

  const mergedClassName = [
    baseClassName,
    iconOnly ? iconOnlySizeClassName[size] : sizeClassName[size],
    kindClassName[resolvedKind],
    fullWidth ? "w-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if ("href" in rest && typeof rest.href === "string") {
    const { href, ...anchorProps } = rest;
    if (isExternalHref(href)) {
      return (
        <a href={href} className={mergedClassName} {...anchorProps}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={mergedClassName} {...anchorProps}>
        {content}
      </Link>
    );
  }

  const { type = "button", ...buttonProps } = rest;
  return (
    <button
      type={type}
      className={mergedClassName}
      {...buttonProps}
      disabled={loading || buttonProps.disabled}
    >
      {content}
    </button>
  );
}
