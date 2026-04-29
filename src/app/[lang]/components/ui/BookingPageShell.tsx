import type { ReactNode } from "react";

type BookingPageShellProps = {
  children: ReactNode;
};

export default function BookingPageShell({ children }: BookingPageShellProps) {
  return <div className="mx-auto w-full max-w-5xl space-y-6">{children}</div>;
}