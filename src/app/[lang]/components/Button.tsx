import { Children, isValidElement } from "react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

import Divider from "@/components/knglmrt/Divider";

// Werte 1:1 aus knglmrt/components/ui/Button.jsx:
//   Schale   700 13/16 Fira Sans Condensed, padding 8px 16px, 1px schwarze
//            Kontur, Radius 0, background-Transition 200ms cubic-bezier(.2,0,0,1)
//   chip     700 11/16, padding 5px 11px — im DS „sm"; dort ist jede kleine
//            Taste weiß mit paper-pink Hover, unabhängig von der Variante
//   primary  Fläche pink, Hover braun, Schrift weiß, Kontur bleibt schwarz
//   emphasis wie primary plus der eine 3px-Offset-Schatten (max. 1× pro View)
//   quiet    keine Kontur, paper-grey, padding 9px 17px
//   tertiary keine Taste: pinker Fettsatz mit gezeichneter Linie darunter
//   disabled dark-30 Kontur, paper-grey Fläche, dark-60 Schrift
// Das DS kennt nur zwei Größen. "small" ist hier die Standardtaste und trifft
// die md-Werte exakt; "medium"/"large" setzen nur mehr Innenabstand.

type ButtonKind =
  | "primary"
  | "secondary"
  | "emphasis"
  | "quiet"
  | "tertiary"
  | "danger-primary"
  | "danger-secondary";

type ButtonSize = "chip" | "small" | "medium" | "large";

type ButtonOwnProps = {
  kind?: ButtonKind;
  size?: ButtonSize;
  icon?: IconProp | null;
  iconPosition?: "left" | "right";
  iconReverse?: boolean;
  children: ReactNode;
};

type ButtonAsButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonOwnProps & { href?: undefined };

type ButtonAsLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  ButtonOwnProps & { href: string };

type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

const baseClassName =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-none border border-foreground font-[family-name:var(--font-core)] font-bold transition-colors duration-200 ease-[cubic-bezier(.2,0,0,1)] disabled:cursor-default disabled:border-border disabled:bg-muted disabled:text-muted-foreground";

const sizeClassName: Record<ButtonSize, string> = {
  chip: "px-[11px] py-[5px] text-[11px] leading-4",
  small: "px-4 py-2 text-[13px] leading-4",
  medium: "px-[18px] py-2.5 text-[13px] leading-4",
  large: "px-[22px] py-3 text-[13px] leading-4",
};

const kindClassName: Record<ButtonKind, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-[var(--knglmrt-brown-100)]",
  secondary: "bg-card text-foreground hover:bg-primary-soft",
  emphasis:
    "bg-primary text-primary-foreground shadow-[3px_3px_0_var(--foreground)] hover:bg-[var(--knglmrt-brown-100)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  quiet:
    "border-0 bg-muted px-[17px] py-[9px] text-foreground hover:bg-[var(--ui-quiet-hover)]",
  tertiary: "",
  "danger-primary":
    "bg-destructive text-destructive-foreground hover:bg-[var(--knglmrt-brown-100)]",
  "danger-secondary": "bg-card text-destructive hover:bg-destructive-soft",
};

// Im DS gewinnt die kleine Größe über die Variante: weiß, schwarze Kontur,
// paper-pink im Hover.
const chipKindClassName = "bg-card text-foreground hover:bg-primary-soft";

export default function Button({
  kind = "secondary",
  size = "small",
  className,
  children,
  icon,
  iconPosition = "left",
  iconReverse = false,
  ...rest
}: ButtonProps) {
  const hasIconChild = Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === FontAwesomeIcon,
  );
  const resolvedIcon = icon ?? null;
  const resolvedPosition = iconReverse
    ? iconPosition === "left"
      ? "right"
      : "left"
    : iconPosition;
  const iconElement =
    resolvedIcon && !hasIconChild ? (
      <FontAwesomeIcon icon={resolvedIcon} className="h-3.5 w-3.5" />
    ) : null;
  const content = iconElement ? (
    <>
      {resolvedPosition === "left" ? iconElement : null}
      <span className="inline-flex items-center">{children}</span>
      {resolvedPosition === "right" ? iconElement : null}
    </>
  ) : (
    children
  );

  // Tertiär ist keine Taste, sondern der pinke Fettsatz mit gezeichneter Linie.
  if (kind === "tertiary") {
    const tertiaryClassName = `relative inline-block w-max cursor-pointer pb-[9px] text-[13px] font-bold leading-4 text-primary${
      className ? ` ${className}` : ""
    }`;
    const tertiaryContent = (
      <>
        {content}
        <span className="absolute inset-x-0 bottom-0 block">
          <Divider number={4} height={7} color="var(--primary)" />
        </span>
      </>
    );

    if ("href" in rest && typeof rest.href === "string") {
      const { href, ...anchorProps } = rest;
      return (
        <Link href={href} className={tertiaryClassName} {...anchorProps}>
          {tertiaryContent}
        </Link>
      );
    }

    const { type = "button", ...buttonProps } = rest;
    return (
      <button type={type} className={tertiaryClassName} {...buttonProps}>
        {tertiaryContent}
      </button>
    );
  }

  const look = size === "chip" ? chipKindClassName : kindClassName[kind];
  const mergedClassName = `${baseClassName} ${sizeClassName[size]} ${look}${
    className ? ` ${className}` : ""
  }`;

  if ("href" in rest && typeof rest.href === "string") {
    const { href, ...anchorProps } = rest;
    return (
      <Link href={href} className={mergedClassName} {...anchorProps}>
        {content}
      </Link>
    );
  }

  const { type = "button", ...buttonProps } = rest;
  return (
    <button type={type} className={mergedClassName} {...buttonProps}>
      {content}
    </button>
  );
}
