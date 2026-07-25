import type { ReactNode } from "react";

import PageWrapper from "../PageWrapper";

type BookingPageShellProps = {
  children: ReactNode;
};

export default function BookingPageShell({ children }: BookingPageShellProps) {
  return <PageWrapper className="space-y-6">{children}</PageWrapper>;
}
