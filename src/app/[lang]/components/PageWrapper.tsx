import type { ElementType, ReactNode } from "react";

type PageWrapperProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  spacing?: "page" | "none";
};

const pageWrapperWidthClassName = "mx-auto w-full max-w-7xl px-4 md:px-0";
const pageWrapperSpacingClassName = "py-6 md:py-0";

export default function PageWrapper({
  children,
  as: Component = "div",
  className,
  spacing = "page",
}: PageWrapperProps) {
  const baseClassName =
    spacing === "page"
      ? `${pageWrapperWidthClassName} ${pageWrapperSpacingClassName}`
      : pageWrapperWidthClassName;

  return (
    <Component
      className={className ? `${baseClassName} ${className}` : baseClassName}
    >
      {children}
    </Component>
  );
}
