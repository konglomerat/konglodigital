export const VOLKSHAUS_TIME_ZONE = "Europe/Berlin";
export const VOLKSHAUS_TAX_RATE = 19;
export const VOLKSHAUS_TARIFF_VERSION = "vhc-2026-07";
export const VOLKSHAUS_CONTRACT_TEMPLATE_VERSION = "vhc-nutzung-2026-01";

export const ROOM_IDS = ["saal", "stube", "garten"] as const;
export type VolkshausRoomId = (typeof ROOM_IDS)[number];

export const USAGE_TYPES = ["commercial", "neighborhood"] as const;
export type VolkshausUsageType = (typeof USAGE_TYPES)[number];

export const BOOKING_FREQUENCIES = ["one_time", "recurring"] as const;
export type VolkshausBookingFrequency = (typeof BOOKING_FREQUENCIES)[number];

export const EQUIPMENT_IDS = [
  "projector",
  "bluetooth_speaker",
  "pa_system",
  "mixer",
  "microphone",
  "laptop",
  "tablet",
  "pavilion",
  "cable_reel",
] as const;
export type VolkshausEquipmentId = (typeof EQUIPMENT_IDS)[number];

export type VolkshausRequestStatus =
  | "new"
  | "in_review"
  | "needs_info"
  | "approved"
  | "rejected";

export type VolkshausReservationStatus =
  | "none"
  | "held"
  | "confirmed"
  | "cancelled"
  | "completed";

export type VolkshausContractStatus =
  | "draft"
  | "sent"
  | "customer_signed"
  | "fully_signed"
  | "cancelled";

export type VolkshausInvoiceStatus =
  | "not_created"
  | "creating"
  | "configuration_required"
  | "draft_created"
  | "created"
  | "error"
  | "cancelled";

export type VolkshausPaymentStatus =
  | "not_due"
  | "open"
  | "paid"
  | "overdue"
  | "refunded";

export type VolkshausPriceLine = {
  code: string;
  description: string;
  quantity: number;
  unitNetCents: number;
  totalNetCents: number;
  taxRate: number;
};

export type VolkshausPriceSnapshot = {
  tariffVersion: string;
  currency: "EUR";
  lines: VolkshausPriceLine[];
  netCents: number;
  taxCents: number;
  grossCents: number;
  requiresManualReview: boolean;
  reviewReasons: string[];
};

export type VolkshausSignature = {
  name: string;
  signedAt: string;
  contractHash: string;
  ipHash?: string | null;
  userAgent?: string | null;
};

export type VolkshausContractSnapshot = {
  templateVersion: string;
  referenceCode: string;
  createdAt: string;
  provider: {
    name: string;
    address: string;
  };
  customer: {
    name: string;
    organization: string | null;
    address: string;
  };
  event: {
    title: string;
    description: string;
    rooms: string[];
    date: string;
    startTime: string;
    endTime: string;
    setupStartTime: string | null;
    teardownEndTime: string | null;
    frequency: VolkshausBookingFrequency;
    recurringOccurrences: number;
  };
  price: VolkshausPriceSnapshot;
  terms: Array<{
    heading: string;
    paragraphs: string[];
  }>;
};

export type VolkshausBooking = {
  id: string;
  referenceCode: string;
  accessToken: string;
  requestStatus: VolkshausRequestStatus;
  reservationStatus: VolkshausReservationStatus;
  contractStatus: VolkshausContractStatus;
  invoiceStatus: VolkshausInvoiceStatus;
  paymentStatus: VolkshausPaymentStatus;
  customerName: string;
  organization: string | null;
  email: string;
  phone: string | null;
  billingAddressLine: string;
  billingZip: string;
  billingCity: string;
  eventTitle: string;
  eventDescription: string;
  usageType: VolkshausUsageType;
  frequency: VolkshausBookingFrequency;
  recurringOccurrences: number;
  expectedAttendees: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  setupStartTime: string | null;
  teardownEndTime: string | null;
  startAt: string;
  endAt: string;
  setupStartAt: string | null;
  teardownEndAt: string | null;
  requestedRooms: VolkshausRoomId[];
  equipment: Partial<Record<VolkshausEquipmentId, number>>;
  specialRequirements: string | null;
  priceSnapshot: VolkshausPriceSnapshot;
  priceAdjustmentCents: number;
  priceAdjustmentReason: string | null;
  internalNotes: string | null;
  holdExpiresAt: string | null;
  assignedUserId: string | null;
  backupAssignedUserId: string | null;
  contractVersion: number;
  contractSnapshot: VolkshausContractSnapshot | null;
  contractHash: string | null;
  customerSignature: VolkshausSignature | null;
  customerSignedAt: string | null;
  staffSignature: VolkshausSignature | null;
  staffSignedAt: string | null;
  staffSignedBy: string | null;
  campaiDebtorAccount: number | null;
  campaiInvoiceId: string | null;
  campaiError: string | null;
  notificationStatus: string | null;
  notificationError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VolkshausBookingRequestInput = {
  customerName: string;
  organization?: string | null;
  email: string;
  phone?: string | null;
  billingAddressLine: string;
  billingZip: string;
  billingCity: string;
  eventTitle: string;
  eventDescription: string;
  usageType: VolkshausUsageType;
  frequency: VolkshausBookingFrequency;
  recurringOccurrences: number;
  expectedAttendees: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  setupStartTime?: string | null;
  teardownEndTime?: string | null;
  requestedRooms: VolkshausRoomId[];
  equipment: Partial<Record<VolkshausEquipmentId, number>>;
  specialRequirements?: string | null;
  acceptedPrivacy: boolean;
  acceptedHouseRules: boolean;
  website?: string;
};

export type BusySlot = {
  id: string;
  date: string;
  roomId: VolkshausRoomId;
  startTime: string;
  endTime: string;
  source: "mock" | "booking";
};

export const VOLKSHAUS_ROOMS: Array<{
  id: VolkshausRoomId;
  label: string;
  contractLabel: string;
  number: string | null;
  capacity: number | null;
  description: string;
}> = [
  {
    id: "saal",
    label: "Veranstaltungssaal",
    contractLabel: "Veranstaltungsraum (Raum 6)",
    number: "6",
    capacity: 50,
    description: "Großer Saal für Veranstaltungen, Workshops und Feiern.",
  },
  {
    id: "stube",
    label: "Stube",
    contractLabel: "Stube (Raum 5)",
    number: "5",
    capacity: 10,
    description: "Kleiner Raum für Besprechungen und ruhige Angebote.",
  },
  {
    id: "garten",
    label: "Garten",
    contractLabel: "Garten (anteilige Nutzung)",
    number: null,
    capacity: null,
    description: "Anteilig nutzbarer Außenbereich.",
  },
];

export const VOLKSHAUS_EQUIPMENT: Array<{
  id: VolkshausEquipmentId;
  label: string;
  maxQuantity: number;
  unitNetCents: number;
  included?: boolean;
  description?: string;
}> = [
  {
    id: "projector",
    label: "Beamer",
    maxQuantity: 1,
    unitNetCents: 2_500,
  },
  {
    id: "bluetooth_speaker",
    label: "Bluetoothbox",
    maxQuantity: 1,
    unitNetCents: 2_500,
  },
  {
    id: "pa_system",
    label: "PA-Anlage / Musikboxen",
    maxQuantity: 1,
    unitNetCents: 7_500,
    description: "Set aus zwei Musikboxen; Mixer ist bei Buchung inklusive.",
  },
  {
    id: "mixer",
    label: "Mixer",
    maxQuantity: 1,
    unitNetCents: 3_000,
    description: "Bei Buchung der PA-Anlage inklusive.",
  },
  {
    id: "microphone",
    label: "Mikrofon",
    maxQuantity: 2,
    unitNetCents: 1_000,
  },
  {
    id: "laptop",
    label: "Laptop",
    maxQuantity: 1,
    unitNetCents: 2_500,
  },
  {
    id: "tablet",
    label: "Tablet",
    maxQuantity: 1,
    unitNetCents: 2_500,
  },
  {
    id: "pavilion",
    label: "Pavillon (3 × 3 m)",
    maxQuantity: 1,
    unitNetCents: 2_000,
  },
  {
    id: "cable_reel",
    label: "Kabeltrommel",
    maxQuantity: 2,
    unitNetCents: 0,
    included: true,
  },
];

export const STATUS_LABELS = {
  request: {
    new: "Neu",
    in_review: "In Prüfung",
    needs_info: "Rückfrage",
    approved: "Freigegeben",
    rejected: "Abgelehnt",
  } satisfies Record<VolkshausRequestStatus, string>,
  reservation: {
    none: "Nicht reserviert",
    held: "Vorläufig reserviert",
    confirmed: "Bestätigt",
    cancelled: "Storniert",
    completed: "Abgeschlossen",
  } satisfies Record<VolkshausReservationStatus, string>,
  contract: {
    draft: "Entwurf",
    sent: "Versendet",
    customer_signed: "Kundenseitig unterschrieben",
    fully_signed: "Vollständig unterschrieben",
    cancelled: "Storniert",
  } satisfies Record<VolkshausContractStatus, string>,
  invoice: {
    not_created: "Nicht angelegt",
    creating: "Wird angelegt",
    configuration_required: "Konfiguration fehlt",
    draft_created: "Entwurf in Campai",
    created: "In Campai angelegt",
    error: "Fehler",
    cancelled: "Storniert",
  } satisfies Record<VolkshausInvoiceStatus, string>,
  payment: {
    not_due: "Noch nicht fällig",
    open: "Offen",
    paid: "Bezahlt",
    overdue: "Überfällig",
    refunded: "Erstattet",
  } satisfies Record<VolkshausPaymentStatus, string>,
};

const ONE_TIME_ROOM_PRICES: Record<
  Exclude<VolkshausRoomId, "garten">,
  Record<VolkshausUsageType, [number, number, number, number, number]>
> = {
  saal: {
    commercial: [2_500, 5_000, 7_500, 10_000, 20_000],
    neighborhood: [1_500, 2_500, 3_500, 4_500, 8_000],
  },
  stube: {
    commercial: [2_000, 4_000, 6_000, 8_000, 15_000],
    neighborhood: [1_000, 2_000, 3_000, 4_000, 6_000],
  },
};

const RECURRING_ROOM_PRICES: Record<
  Exclude<VolkshausRoomId, "garten">,
  Record<
    VolkshausUsageType,
    {
      upToTwoHours: [number, number, number, number];
      upToFourHours: [number, number, number, number];
    }
  >
> = {
  saal: {
    commercial: {
      upToTwoHours: [5_000, 10_000, 12_000, 15_000],
      upToFourHours: [10_000, 15_000, 23_000, 28_000],
    },
    neighborhood: {
      upToTwoHours: [2_000, 3_000, 4_000, 5_000],
      upToFourHours: [3_000, 5_000, 6_000, 7_000],
    },
  },
  stube: {
    commercial: {
      upToTwoHours: [4_000, 8_000, 10_000, 13_000],
      upToFourHours: [8_000, 13_000, 18_000, 22_000],
    },
    neighborhood: {
      upToTwoHours: [1_000, 2_000, 3_000, 4_000],
      upToFourHours: [2_000, 4_000, 5_000, 6_000],
    },
  },
};

const timeToMinutes = (value: string) => {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
};

export const calculateDurationMinutes = (startTime: string, endTime: string) => {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || end <= start) {
    return 0;
  }
  return end - start;
};

const roundTax = (netCents: number) =>
  Math.round((netCents * VOLKSHAUS_TAX_RATE) / 100);

export const calculateVolkshausPrice = (
  input: Pick<
    VolkshausBookingRequestInput,
    | "requestedRooms"
    | "usageType"
    | "frequency"
    | "recurringOccurrences"
    | "startTime"
    | "endTime"
    | "equipment"
  >,
): VolkshausPriceSnapshot => {
  const durationMinutes = calculateDurationMinutes(
    input.startTime,
    input.endTime,
  );
  const billedHours = Math.max(1, Math.ceil(durationMinutes / 60));
  const occurrences = Math.max(
    1,
    Math.min(4, Math.trunc(input.recurringOccurrences || 1)),
  );
  const lines: VolkshausPriceLine[] = [];
  const reviewReasons: string[] = [];

  for (const roomId of input.requestedRooms) {
    const room = VOLKSHAUS_ROOMS.find((entry) => entry.id === roomId);
    if (!room) {
      continue;
    }

    let netCents = 0;
    let description = room.label;

    if (roomId === "garten") {
      netCents = 4_000 * (input.frequency === "recurring" ? occurrences : 1);
      description =
        input.frequency === "recurring"
          ? `${room.label} · vorläufig ${occurrences} × monatlich`
          : `${room.label} · Pauschale`;
      if (input.frequency === "recurring") {
        reviewReasons.push(
          "Für regelmäßige Gartennutzung ist kein eigener Tarif hinterlegt.",
        );
      }
    } else if (input.frequency === "recurring") {
      const tariffs = RECURRING_ROOM_PRICES[roomId][input.usageType];
      if (durationMinutes <= 120) {
        netCents = tariffs.upToTwoHours[occurrences - 1];
        description = `${room.label} · ${occurrences} × monatlich, bis 2 Stunden`;
      } else if (durationMinutes <= 240) {
        netCents = tariffs.upToFourHours[occurrences - 1];
        description = `${room.label} · ${occurrences} × monatlich, bis 4 Stunden`;
      } else {
        netCents = tariffs.upToFourHours[occurrences - 1];
        description = `${room.label} · vorläufig ${occurrences} × monatlich, über 4 Stunden`;
        reviewReasons.push(
          `Regelmäßige Nutzung des Raums „${room.label}“ über vier Stunden benötigt eine individuelle Preisprüfung.`,
        );
      }
    } else {
      const tierIndex = billedHours > 4 ? 4 : billedHours - 1;
      netCents = ONE_TIME_ROOM_PRICES[roomId][input.usageType][tierIndex];
      description = `${room.label} · ${
        billedHours > 4 ? "mehr als 4 Stunden" : `${billedHours} Stunden`
      }`;
    }

    lines.push({
      code: `room:${roomId}`,
      description,
      quantity: 1,
      unitNetCents: netCents,
      totalNetCents: netCents,
      taxRate: VOLKSHAUS_TAX_RATE,
    });
  }

  for (const item of VOLKSHAUS_EQUIPMENT) {
    const requestedQuantity = Math.max(
      0,
      Math.min(
        item.maxQuantity,
        Math.trunc(Number(input.equipment[item.id] ?? 0)),
      ),
    );
    if (requestedQuantity === 0) {
      continue;
    }

    const isMixerIncluded =
      item.id === "mixer" && Number(input.equipment.pa_system ?? 0) > 0;
    const unitNetCents = isMixerIncluded ? 0 : item.unitNetCents;
    const frequencyMultiplier =
      input.frequency === "recurring" ? occurrences : 1;
    const quantity = requestedQuantity * frequencyMultiplier;

    lines.push({
      code: `equipment:${item.id}`,
      description: `${item.label}${
        isMixerIncluded ? " · in PA-Anlage enthalten" : ""
      }${
        input.frequency === "recurring"
          ? ` · für ${occurrences} Termine/Monat`
          : ""
      }`,
      quantity,
      unitNetCents,
      totalNetCents: unitNetCents * quantity,
      taxRate: VOLKSHAUS_TAX_RATE,
    });
  }

  if (input.requestedRooms.length > 1) {
    reviewReasons.push(
      "Raumkombinationen werden vor Vertragsfreigabe noch einmal geprüft.",
    );
  }

  const netCents = lines.reduce(
    (sum, line) => sum + line.totalNetCents,
    0,
  );
  const taxCents = roundTax(netCents);

  return {
    tariffVersion: VOLKSHAUS_TARIFF_VERSION,
    currency: "EUR",
    lines,
    netCents,
    taxCents,
    grossCents: netCents + taxCents,
    requiresManualReview: reviewReasons.length > 0,
    reviewReasons,
  };
};

export const applyPriceAdjustment = (
  snapshot: VolkshausPriceSnapshot,
  adjustmentCents: number,
  reason?: string | null,
): VolkshausPriceSnapshot => {
  const normalizedAdjustment = Math.trunc(adjustmentCents || 0);
  const lines = snapshot.lines.filter((line) => line.code !== "adjustment");

  if (normalizedAdjustment !== 0) {
    lines.push({
      code: "adjustment",
      description: reason?.trim() || "Individuelle Preisanpassung",
      quantity: 1,
      unitNetCents: normalizedAdjustment,
      totalNetCents: normalizedAdjustment,
      taxRate: VOLKSHAUS_TAX_RATE,
    });
  }

  const netCents = Math.max(
    0,
    lines.reduce((sum, line) => sum + line.totalNetCents, 0),
  );
  const taxCents = roundTax(netCents);

  return {
    ...snapshot,
    lines,
    netCents,
    taxCents,
    grossCents: netCents + taxCents,
  };
};

export const formatEuro = (cents: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);

export const getRoomLabel = (roomId: VolkshausRoomId) =>
  VOLKSHAUS_ROOMS.find((room) => room.id === roomId)?.label ?? roomId;

export const getEquipmentLabel = (equipmentId: VolkshausEquipmentId) =>
  VOLKSHAUS_EQUIPMENT.find((item) => item.id === equipmentId)?.label ??
  equipmentId;

export const getMockBusySlots = (date: string): BusySlot[] => {
  const dateValue = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(dateValue.getTime())) {
    return [];
  }

  const day = dateValue.getUTCDay();
  const dayOfMonth = dateValue.getUTCDate();
  const slots: Array<Omit<BusySlot, "id" | "date" | "source">> = [];

  if (day === 1) {
    slots.push({ roomId: "stube", startTime: "10:00", endTime: "12:30" });
  }
  if (day === 2) {
    slots.push({ roomId: "saal", startTime: "18:00", endTime: "21:00" });
  }
  if (day === 3) {
    slots.push(
      { roomId: "saal", startTime: "16:00", endTime: "19:00" },
      { roomId: "stube", startTime: "14:00", endTime: "16:00" },
    );
  }
  if (day === 4) {
    slots.push({ roomId: "stube", startTime: "18:00", endTime: "20:00" });
  }
  if (day === 5) {
    slots.push(
      { roomId: "saal", startTime: "17:00", endTime: "22:00" },
      { roomId: "garten", startTime: "16:00", endTime: "20:00" },
    );
  }
  if (day === 6 && dayOfMonth % 2 === 0) {
    slots.push(
      { roomId: "saal", startTime: "12:00", endTime: "19:00" },
      { roomId: "garten", startTime: "12:00", endTime: "19:00" },
    );
  }
  if (day === 0 && dayOfMonth % 3 === 0) {
    slots.push({ roomId: "stube", startTime: "11:00", endTime: "14:00" });
  }

  return slots.map((slot, index) => ({
    ...slot,
    id: `mock-${date}-${slot.roomId}-${index}`,
    date,
    source: "mock",
  }));
};

export const timeIntervalsOverlap = (
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
) => {
  const leftStartMinutes = timeToMinutes(leftStart);
  const leftEndMinutes = timeToMinutes(leftEnd);
  const rightStartMinutes = timeToMinutes(rightStart);
  const rightEndMinutes = timeToMinutes(rightEnd);

  if (
    leftStartMinutes === null ||
    leftEndMinutes === null ||
    rightStartMinutes === null ||
    rightEndMinutes === null
  ) {
    return false;
  }

  return leftStartMinutes < rightEndMinutes && rightStartMinutes < leftEndMinutes;
};

export const findBusySlotConflicts = ({
  slots,
  requestedRooms,
  startTime,
  endTime,
}: {
  slots: BusySlot[];
  requestedRooms: VolkshausRoomId[];
  startTime: string;
  endTime: string;
}) =>
  slots.filter(
    (slot) =>
      requestedRooms.includes(slot.roomId) &&
      timeIntervalsOverlap(startTime, endTime, slot.startTime, slot.endTime),
  );

const contractDateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "long",
  timeZone: VOLKSHAUS_TIME_ZONE,
});

export const buildVolkshausContractSnapshot = (
  booking: VolkshausBooking,
): VolkshausContractSnapshot => {
  const date = new Date(`${booking.bookingDate}T12:00:00Z`);
  const price = applyPriceAdjustment(
    booking.priceSnapshot,
    booking.priceAdjustmentCents,
    booking.priceAdjustmentReason,
  );
  const roomLabels = booking.requestedRooms.map((roomId) => {
    const room = VOLKSHAUS_ROOMS.find((entry) => entry.id === roomId);
    return room?.contractLabel ?? roomId;
  });
  const frequencyText =
    booking.frequency === "recurring"
      ? `${booking.recurringOccurrences} Termin(e) pro Monat`
      : "einmalige Nutzung";
  const accessParagraphs = [
    `Die Nutzung findet am ${Number.isNaN(date.getTime()) ? booking.bookingDate : contractDateFormatter.format(date)} von ${booking.startTime} bis ${booking.endTime} Uhr statt.`,
  ];
  if (booking.setupStartTime) {
    accessParagraphs.push(
      `Der Zugang für den Aufbau ist ab ${booking.setupStartTime} Uhr vereinbart.`,
    );
  }
  if (booking.teardownEndTime) {
    accessParagraphs.push(
      `Die Rückgabe der Räume und Ausstattung erfolgt bis ${booking.teardownEndTime} Uhr.`,
    );
  }

  return {
    templateVersion: VOLKSHAUS_CONTRACT_TEMPLATE_VERSION,
    referenceCode: booking.referenceCode,
    createdAt: new Date().toISOString(),
    provider: {
      name: "Konglomerat e.V.",
      address: "Jagdweg 1-3, 01159 Dresden",
    },
    customer: {
      name: booking.customerName,
      organization: booking.organization,
      address: `${booking.billingAddressLine}, ${booking.billingZip} ${booking.billingCity}`,
    },
    event: {
      title: booking.eventTitle,
      description: booking.eventDescription,
      rooms: roomLabels,
      date: Number.isNaN(date.getTime())
        ? booking.bookingDate
        : contractDateFormatter.format(date),
      startTime: booking.startTime,
      endTime: booking.endTime,
      setupStartTime: booking.setupStartTime,
      teardownEndTime: booking.teardownEndTime,
      frequency: booking.frequency,
      recurringOccurrences: booking.recurringOccurrences,
    },
    price,
    terms: [
      {
        heading: "1. Vertragsgegenstand und Nutzungszweck",
        paragraphs: [
          `Der Konglomerat e.V. überlässt der nutzenden Partei die aufgeführten Räume ausschließlich für den beschriebenen Zweck. Art und Umfang: ${frequencyText}.`,
        ],
      },
      {
        heading: "2. Übergabe und Rückgabe",
        paragraphs: [
          "Die nutzende Partei hat die Möglichkeit, die Räumlichkeiten vor Vertragsabschluss zu besichtigen.",
          "Räume und ausgeliehene Gegenstände sind nach der Nutzung in ihrem ursprünglichen Zustand und besenrein zurückzugeben. Selbst verursachter Abfall wird eigenständig entsorgt.",
        ],
      },
      {
        heading: "3. Beginn und Dauer",
        paragraphs: accessParagraphs,
      },
      {
        heading: "4. Nutzungsentgelt",
        paragraphs: [
          `Das vereinbarte Nutzungsentgelt beträgt ${formatEuro(price.grossCents)} brutto einschließlich ${VOLKSHAUS_TAX_RATE} % Umsatzsteuer.`,
          "Das Nutzungsentgelt ist entsprechend der nach Vertragsabschluss ausgestellten Rechnung zu zahlen.",
        ],
      },
      {
        heading: "5. Nutzung",
        paragraphs: [
          "Die Nutzung erfolgt rücksichtsvoll unter Wahrung der Interessen anderer Mitnutzender. Schäden, die fahrlässig, grob fahrlässig oder vorsätzlich verursacht werden, sind durch die nutzende Partei zu regulieren.",
          "Die nutzende Partei erkennt das Leitbild sowie die Haus- und Raumordnung des Neuen Volkshauses Cotta an.",
        ],
      },
      {
        heading: "6. Stornierung",
        paragraphs: [
          booking.frequency === "recurring"
            ? "Für regelmäßige Nutzungen gelten die im Vertrag individuell ergänzten Kündigungsbedingungen."
            : "Die Buchung kann bis eine Woche vor Nutzungsbeginn schriftlich storniert werden.",
        ],
      },
      {
        heading: "7. Haftungsausschluss",
        paragraphs: [
          "Der Anbieter haftet nicht für Schäden, die durch schädigende Handlungen Dritter oder durch höhere Gewalt entstehen.",
        ],
      },
      {
        heading: "8. Schlussbestimmungen",
        paragraphs: [
          "Änderungen und Ergänzungen bedürfen der Textform. Sollten einzelne Regelungen unwirksam sein, bleiben die übrigen Bestimmungen unberührt. Gerichtsstand ist Dresden.",
        ],
      },
    ],
  };
};

export const getEffectiveVolkshausPrice = (booking: VolkshausBooking) =>
  applyPriceAdjustment(
    booking.priceSnapshot,
    booking.priceAdjustmentCents,
    booking.priceAdjustmentReason,
  );
