import type { ReactNode } from "react";

type BookingPageShellProps = {
  children: ReactNode;
};

export default function BookingPageShell({ children }: BookingPageShellProps) {
  return <div className="w-full space-y-6">{children}</div>;
}