import { Children, isValidElement } from "react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

type ButtonKind =
  | "primary"
  | "secondary"
  | "danger-primary"
  | "danger-secondary";

type ButtonSize = "small" | "medium" | "large";

type ButtonAsButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: ButtonKind;
  size?: ButtonSize;
  icon?: IconProp | null;
  iconPosition?: "left" | "right";
  iconReverse?: boolean;
  children: ReactNode;
  href?: undefined;
};

type ButtonAsLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  kind?: ButtonKind;
  size?: ButtonSize;
  icon?: IconProp | null;
  iconPosition?: "left" | "right";
  iconReverse?: boolean;
  children: ReactNode;
  href: string;
};

type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

const baseClassName =
  "inline-flex items-center justify-center gap-2 rounded-md border font-bold transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";

const sizeClassName: Record<ButtonSize, string> = {
  small: "px-4 py-2 text-sm",
  medium: "px-4 py-2 text-md",
  large: "px-5 py-2.5 text-lg",
};

const kindClassName: Record<ButtonKind, string> = {
  primary:
    "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
  secondary:
    "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
  "danger-primary":
    "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
  "danger-secondary":
    "border-destructive-border bg-card text-destructive hover:bg-destructive-soft",
};

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
  const mergedClassName = className
    ? `${baseClassName} ${sizeClassName[size]} ${kindClassName[kind]} ${className}`
    : `${baseClassName} ${sizeClassName[size]} ${kindClassName[kind]}`;

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
