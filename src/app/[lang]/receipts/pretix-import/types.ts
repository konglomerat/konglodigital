export type PretixItem = {
  id: number;
  name: string;
  tax_rate?: string | number;
};

export type PretixSubevent = {
  id: number;
  name?: string;
};

export type PretixOrderPosition = {
  id: number;
  positionid?: number;
  item: number;
  subevent?: number | null;
  price: string | number;
  tax_rate?: string | number;
  attendee_name?: string | null;
};

export type PretixOrder = {
  code: string;
  status: string;
  user?: string | null;
  email?: string | null;
  total: string | number;
  positions: PretixOrderPosition[];
};

export type PretixEvent = {
  name?: string;
  slug?: string;
  items?: PretixItem[];
  orders?: PretixOrder[];
  subevents?: PretixSubevent[];
};

export type PretixDocument = {
  event?: PretixEvent;
};

export type PretixRow = {
  key: string;
  orderCode: string;
  user: string;
  email: string;
  totalAmountCents: number;
  totalDisplay: string;
  status: string;
  statusLabel: string;
  attendeeName: string;
  itemName: string;
  unitAmountCents: number;
  taxRate: 0 | 7 | 19;
  eventName: string;
  eventSlug: string;
};
