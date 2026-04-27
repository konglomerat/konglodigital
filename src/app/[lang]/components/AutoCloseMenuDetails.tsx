"use client";

import { useRef } from "react";

type AutoCloseMenuDetailsProps = {
  className?: string;
  summary: React.ReactNode;
  children: React.ReactNode;
};

export default function AutoCloseMenuDetails({
  className,
  summary,
  children,
}: AutoCloseMenuDetailsProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const handleClickCapture = (event: React.MouseEvent<HTMLDetailsElement>) => {
    const target = event.target as HTMLElement | null;

    if (!target || !detailsRef.current?.open) {
      return;
    }

    const clickedNavigationTarget = target.closest(
      "a, button[type='submit'], [data-autoclose-menu='true']",
    );

    if (clickedNavigationTarget) {
      detailsRef.current.open = false;
    }
  };

  return (
    <details
      ref={detailsRef}
      className={className}
      onClickCapture={handleClickCapture}
    >
      {summary}
      {children}
    </details>
  );
}
