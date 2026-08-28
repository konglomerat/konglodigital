// Portiert aus knglmrt/components/ui/DataTable.jsx.
// Die Tabelle aus Daten statt aus Markup: Spalten beschreiben, Zeilen
// durchreichen. Optisch ist das keine zweite Tabelle — darunter liegen die
// Primitiven aus Table.tsx, also dieselbe Kontur, derselbe Kopf, dieselben
// Haarlinien.
//
// Anders als der Export trägt eine Zelle keine `badge`- oder `faceNumber`-Prop
// mehr: eine Spalte rendert, was sie will (`cell` gibt einen ReactNode zurück).
// Ein Badge ist dann ein Badge und keine Aufzählung, die DataTable kennen muss.
import type { ReactNode } from "react";

import {
  Table,
  TBody,
  Td,
  TFoot,
  THead,
  Th,
  Tr,
  TableEmpty,
  type TrTone,
} from "@/components/knglmrt/Table";

export type DataTableColumn<Row> = {
  /** Eindeutig je Spalte — wird als React-key benutzt. */
  key: string;
  label: ReactNode;
  /** Was in der Zelle steht. */
  cell: (row: Row, index: number) => ReactNode;
  /** Jeder Wert, den <col> versteht: "110px", "1fr", "20%". */
  width?: string;
  align?: "left" | "right";
  /** Zahlen, Daten, Beträge, IDs — Fira Mono. */
  mono?: boolean;
};

export type DataTableProps<Row> = {
  columns: ReadonlyArray<DataTableColumn<Row>>;
  rows: ReadonlyArray<Row>;
  /** Stabiler Schlüssel je Zeile. Ohne das zählt der Index. */
  rowKey?: (row: Row, index: number) => string;
  /** Färbt jede zweite Zeile. Standard aus. */
  zebra?: boolean;
  /** `rosa` markiert die eigene Zeile, nie eine fremde. */
  rowTone?: (row: Row, index: number) => TrTone | undefined;
  /** Stumme Zeile — storniert, vergangen, inaktiv. */
  rowMuted?: (row: Row, index: number) => boolean;
  onRowClick?: (row: Row, index: number) => void;
  /** Was statt erfundener Zeilen dasteht, wenn nichts da ist. */
  empty?: ReactNode;
  /** Abschlusszeile (Summe, Saldo) — so viele Zellen wie Spalten. */
  footer?: ReactNode;
  className?: string;
};

function cellClassName<Row>(column: DataTableColumn<Row>) {
  return [
    column.align === "right" ? "text-right" : "",
    column.mono ? "knglmrt-num" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function DataTable<Row>({
  columns,
  rows,
  rowKey,
  zebra = false,
  rowTone,
  rowMuted,
  onRowClick,
  empty = "Nichts gefunden.",
  footer,
  className,
}: DataTableProps<Row>) {
  return (
    <Table className={className}>
      {columns.some((column) => column.width) ? (
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: column.width }} />
          ))}
        </colgroup>
      ) : null}
      <THead>
        {columns.map((column) => (
          <Th
            key={column.key}
            className={column.align === "right" ? "text-right" : undefined}
          >
            {column.label}
          </Th>
        ))}
      </THead>
      <TBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={columns.length}>{empty}</TableEmpty>
        ) : (
          rows.map((row, index) => (
            <Tr
              key={rowKey ? rowKey(row, index) : index}
              tone={
                rowTone?.(row, index) ??
                (zebra && index % 2 === 1 ? "zebra" : "weiss")
              }
              muted={rowMuted?.(row, index)}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
            >
              {columns.map((column) => (
                <Td key={column.key} className={cellClassName(column)}>
                  {column.cell(row, index)}
                </Td>
              ))}
            </Tr>
          ))
        )}
      </TBody>
      {footer ? <TFoot>{footer}</TFoot> : null}
    </Table>
  );
}
