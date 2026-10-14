// Textbausteine aus „Texte Konglo digital“ für die Eingangsantwort.
export const VOLKSHAUS_WAITLIST_EMAIL = "mitmachen@neuesvolkshaus.de";

export const VOLKSHAUS_FUTURE_REQUEST_PARAGRAPHS = [
  "Es tut uns leid, Ihnen mitzuteilen, dass wir Terminanfragen ab 2027 noch nicht annehmen, da sich unser Neues Volkshaus Cotta in einer Transformation der Trägerschaft befindet. Wir würden uns jedoch über Ihre Anfrage im kommenden Jahr freuen und würden Sie auch gern auf unsere Warteliste 2027 setzen, wenn dies für Sie okay wäre.",
  `Bitte schreiben Sie uns erneut an ${VOLKSHAUS_WAITLIST_EMAIL}, damit wir Ihrem Wunsch auf Vormerkung und dem Datenschutz genügen können.`,
] as const;

// Entscheidend ist der angefragte Veranstaltungstermin, nicht das Eingangsdatum.
export const isVolkshausFutureRequest = (bookingDate: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(bookingDate) && bookingDate >= "2027-01-01";

export const getVolkshausRequestReply = (bookingDate: string) =>
  isVolkshausFutureRequest(bookingDate)
    ? {
        paragraphs: [
          "Vielen Dank für Ihre Raumanfrage an unser Kultur- und Nachbarschaftszentrum!",
          "Der wichtigste Punkt zuerst für Sie:",
          ...VOLKSHAUS_FUTURE_REQUEST_PARAGRAPHS,
        ],
        closing: "Mit herzlichen Grüßen",
      }
    : {
        paragraphs: [
          "Vielen Dank für Ihre Raumanfrage an das Neue Volkshaus Cotta, unser Kultur- und Nachbarschaftszentrum, und dafür, dass Sie unser Verlängertes Wohnzimmer nutzen möchten.",
          "Bitte haben Sie ein wenig Geduld – wir werden uns Ihrer Anfrage in Bälde widmen.",
        ],
        closing: "Mit freundlichen Grüßen",
      };

const receivedAtFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

export const formatVolkshausRequestReceivedAt = (createdAt: string) => {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? "Unbekannt"
    : `${receivedAtFormatter.format(date)} Uhr`;
};
