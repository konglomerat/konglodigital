export type PrinterStatus =
  | "idle"
  | "printing"
  | "paused"
  | "offline"
  | "error";

export interface BambuPrinter {
  id: string;
  name: string;
  model: string;
  serial: string;
  status: PrinterStatus;
  progress: number;
  jobName?: string;
  updatedAt: string;
}

export const mockPrinters: BambuPrinter[] = [
  {
    id: "p1s-01",
    name: "Studio P1S",
    model: "P1S",
    serial: "BLP1S-3F2A19",
    status: "printing",
    progress: 62,
    jobName: "Enclosure bracket v4",
    updatedAt: "2026-01-29T10:12:00Z",
  },
  {
    id: "x1c-02",
    name: "Workshop X1C",
    model: "X1 Carbon",
    serial: "BLX1C-9B77C0",
    status: "idle",
    progress: 0,
    updatedAt: "2026-01-29T10:08:00Z",
  },
  {
    id: "a1-03",
    name: "A1 Mini",
    model: "A1 Mini",
    serial: "BLA1M-0D12F8",
    status: "paused",
    progress: 34,
    jobName: "Desk organizer",
    updatedAt: "2026-01-29T09:51:00Z",
  },
  {
    id: "x1c-04",
    name: "Print Lab X1C",
    model: "X1 Carbon",
    serial: "BLX1C-1A3344",
    status: "offline",
    progress: 0,
    updatedAt: "2026-01-29T08:26:00Z",
  },
  {
    id: "p1p-05",
    name: "P1P Prototype",
    model: "P1P",
    serial: "BLP1P-7C21D1",
    status: "error",
    progress: 12,
    jobName: "Gear housing",
    updatedAt: "2026-01-29T10:01:00Z",
  },
];
