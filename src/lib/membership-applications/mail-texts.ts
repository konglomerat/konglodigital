// Mitgliedsanträge — Texte der Mails, die vor dem Annehmen per SMTP rausgehen.
// Rückfrage und Absage füllt die Inbox damit vor; verschickt wird, was danach
// im Textfeld steht. Ohne Server-Abhängigkeit, damit der Client sie nutzt.

const SIGNATURE = "Viele Grüße\nDer Vorstand des Konglomerat e.V.";

export const inquiryDraft = (firstName: string) =>
  `Hallo ${firstName},\n\ndanke für deinen Mitgliedsantrag! Bevor wir ihn annehmen können, haben wir noch eine Frage:\n\n\n\nAntworte einfach auf diese Mail.\n\n${SIGNATURE}`;

export const rejectionDraft = (firstName: string) =>
  `Hallo ${firstName},\n\ndanke für deinen Mitgliedsantrag. Leider können wir ihn nicht annehmen.\n\n\n\nBei Fragen antworte einfach auf diese Mail.\n\n${SIGNATURE}`;

export const INQUIRY_SUBJECT = "Rückfrage zu deinem Mitgliedsantrag";
export const REJECTION_SUBJECT = "Dein Mitgliedsantrag beim Konglomerat e.V.";

export const receiptConfirmation = (firstName: string, number: string) => ({
  subject: `Dein Mitgliedsantrag ${number} ist bei uns eingegangen`,
  text: `Hallo ${firstName},\n\ndanke für deinen Mitgliedsantrag beim Konglomerat e.V.! Er ist bei uns eingegangen (${number}). Der Vorstand schaut ihn sich an und meldet sich bei dir — sobald er angenommen ist, bekommst du eine Willkommensmail mit der ersten Rechnung.\n\nFragen? Antworte einfach auf diese Mail.\n\n${SIGNATURE}`,
});
