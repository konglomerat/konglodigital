export type MaterialInvoiceParticipantPosition = {
  id: string;
  description: string;
  articleDescription?: string;
  quantity: number;
  unit: string;
  unitAmountEuro: number;
  taxRate: 0 | 7 | 19;
  lineTotalEuro: number;
  sourceText?: string;
};

export type MaterialInvoiceParticipant = {
  id: string;
  name: string;
  notes?: string;
  positions: MaterialInvoiceParticipantPosition[];
};

export type MaterialInvoiceParseResult = {
  supplierName: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  currency: string;
  shippingAmountEuro: number;
  totalAmountEuro: number;
  participants: MaterialInvoiceParticipant[];
  issues: string[];
};



