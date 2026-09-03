// Portiert aus knglmrt/components/ui/DataTable.jsx als Satz von Primitiven.
// Die Tabelle des DS: 1px schwarze Kontur außen, 1px unter dem Kopf,
// 0.5px Haarlinie zwischen den Zeilen, Radius 0, kein Schatten.
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-x-auto knglmrt-border bg-card${
        className ? ` ${className}` : ""
      }`}
    >
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="knglmrt-border-b">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({
  children,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      className={`knglmrt-caption whitespace-nowrap px-3.5 py-2 text-muted-foreground${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="[&>tr+tr]:border-t [&>tr+tr]:border-border">
      {children}
    </tbody>
  );
}

/** Die Fläche einer Zeile. `rosa` markiert die eigene Zeile, nie eine fremde. */
export type TrTone = "weiss" | "zebra" | "rosa";

const TR_TONE_CLASSNAME: Record<TrTone, string> = {
  weiss: "",
  zebra: "bg-ui-tint-zebra",
  rosa: "bg-primary-soft",
};

export function Tr({
  children,
  interactive = false,
  tone = "weiss",
  /** Stumme Zeile — storniert, vergangen, inaktiv. */
  muted = false,
  onClick,
}: {
  children: ReactNode;
  interactive?: boolean;
  tone?: TrTone;
  muted?: boolean;
  onClick?: () => void;
}) {
  // Der Zeiger nur da, wo wirklich etwas passiert: `interactive` ist die
  // Hover-Fläche, `onClick` erst die Handlung.
  return (
    <tr
      onClick={onClick}
      className={[
        TR_TONE_CLASSNAME[tone],
        muted ? "text-muted-foreground" : "",
        interactive || onClick ? "transition hover:bg-ui-tint-zebra" : "",
        onClick ? "cursor-pointer" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  className,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...rest}
      className={`px-3.5 py-2.5 align-top${className ? ` ${className}` : ""}`}
    >
      {children}
    </td>
  );
}

/** Abschlusszeile (Saldo, Summe) — 1px Kontur oben, paper-grey. */
export function TFoot({ children }: { children: ReactNode }) {
  return (
    <tfoot className="knglmrt-border-t bg-muted font-bold">
      <tr>{children}</tr>
    </tfoot>
  );
}

/** Leerzustand in einer Tabelle — nie erfundene Zeilen. */
export function TableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3.5 py-6 text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
