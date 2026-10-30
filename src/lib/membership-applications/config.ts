// Mitgliedsanträge — feste IDs in Campai.

/** Gestaltete Campai-Vorlagen (crm/messageTemplates); den Text pflegt der Vorstand in Campai. */
export const WELCOME_TEMPLATE_ID = "6a85d1b6087ed5f40420c311";
export const COMPLETION_TEMPLATE_ID = "6ab6c38894f108c02a7c87eb";
/** Teil 2/2 ohne Abholung der Karte und ohne Roseguarden — nur Jahresbeitrag. */
export const COMPLETION_NO_CARD_TEMPLATE_ID = "6ae4dbc3d52c0593dc8659d5";
/** Tarifwechsel auf ein Abo mit Karte (Self-Service): Dauerauftrag + Roseguarden. */
export const CARD_TARIFF_INSTRUCTIONS_TEMPLATE_ID = "6ad1f4991df1fe49049a5102";

/**
 * Posteingang in Campai (crm/conversations/inbox-email). Antworten der
 * Antragstellenden landen dort, auch auf die Mails vor dem Annehmen.
 */
export const CAMPAI_INBOX_EMAIL = "office@portal.konglomerat.org";

/** Empfänger der Info über neue Anträge. In der Testphase nur Vincent statt des ganzen Vorstands. */
export const NEW_APPLICATION_NOTIFY_EMAIL = "vincent@konglomerat.org";
