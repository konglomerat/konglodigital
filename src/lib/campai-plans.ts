// Der Tarifkatalog des Mandanten — aus Campai, nicht aus einer Liste von IDs
// im Code. `crm/plans/list` liefert jeden Beitragsplan mit Namen, Preis und
// Optionen; daraus fällt beides ab, was die App über Tarife wissen muss:
// welcher Vertrag welche Zugangsstufe bedeutet und was sie kostet.
//
// Die Zuordnung hängt am Tag, nicht am Plannamen — Pläne dürfen umbenannt
// werden:
//
// * Zugangskarten-Tarife sind die Pläne mit dem Tag „Zugangskarte".
//   Jahresbeitrag, Spenden und Testpläne tragen ihn nicht und fallen heraus,
//   ohne dass ihre IDs irgendwo stehen müssten.
// * Hat so ein Plan Optionen, ist er der Monatsmehrbeitrag: klein und groß
//   unterscheiden sich allein durch die gebuchte Option. Optionen haben in
//   Campai keine Tags — hier bleibt nur der Optionsname („klein"/„groß").
// * Hat er keine, ist er eine Punktekarte (die 10er Karten).
//
// Daneben merkt sich der Katalog die jährlichen Beitragspläne ohne den Tag —
// das ist der Vereinsbeitrag, den die Kontoseite als Jahresbeitrag zeigt.
//
// Legt der Verein einen weiteren Zugangskarten-Tarif an, benennt einen um
// oder ändert einen Preis, greift das hier ohne Codeänderung — solange der
// Tag gesetzt ist.

/** Der Zugangskarten-Tarif, wie Campai ihn führt. */
export type CampaiAccessTariff =
  "abo_gross" | "abo_klein" | "punktekarte" | "keiner";

/** Eine gebuchte Stufe, so wie Campai sie beschreibt. */
export type CampaiTariffEntry = {
  tariff: Exclude<CampaiAccessTariff, "keiner">;
  /** Optionsname beim Abo, Planname bei der Punktekarte. */
  label: string;
  /** Preis in Cent, brutto — was Campai dem Mitglied berechnet. */
  priceCents: number;
};

export type CampaiTariffCatalog = {
  /** Pläne ohne Optionen: Plan-ID → Stufe. */
  byPlan: ReadonlyMap<string, CampaiTariffEntry>;
  /** Pläne mit Optionen: `planId:optionId` → Stufe. */
  byOption: ReadonlyMap<string, CampaiTariffEntry>;
  /** IDs der jährlichen Beitragspläne ohne Zugangskarte (Jahresbeitrag). */
  annualFeePlans: ReadonlySet<string>;
};

const PAGE_SIZE = 100;

/** Solange gilt ein einmal geholter Katalog — Tarife ändern sich in Jahren. */
const CACHE_TTL_MS = 10 * 60 * 1000;

const ZUGANGSKARTE_TAG = "zugangskarte";
const GROSS = /gro(ß|ss)/i;
const KLEIN = /klein/i;

type RawPrice = { price?: number | null; priceGross?: number | null };

type RawAmount = { price?: RawPrice | null };

type RawOption = {
  id?: string | null;
  name?: string | null;
  amount?: RawAmount | null;
};

type RawPlan = {
  _id?: string | null;
  name?: string | null;
  type?: string | null;
  tags?: string[] | null;
  period?: { interval?: string | null } | null;
  charge?: {
    amount?: RawAmount | null;
    options?: RawOption[] | null;
  } | null;
};

type PlanListResponse = { plans?: RawPlan[] };

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const campaiFetch = async <T>(path: string, body: unknown): Promise<T> => {
  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/${mandateId}/${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Campai API error: ${response.status} ${errorBody}`);
  }

  return (await response.json()) as T;
};

// Campai führt bei manchen Plänen `priceGross`, bei anderen nur `price` —
// beides ist derselbe Bruttobetrag, solange `isNet` false ist (und das ist es
// bei allen Zugangskarten).
const centsOf = (amount: RawAmount | null | undefined) => {
  const price = amount?.price;
  const value = price?.priceGross ?? price?.price;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
};

const hasAccessTag = (plan: RawPlan) =>
  (plan.tags ?? []).some(
    (tag) => tag.trim().toLowerCase() === ZUGANGSKARTE_TAG,
  );

const optionTariff = (
  name: string,
): Exclude<CampaiAccessTariff, "keiner" | "punktekarte"> | null =>
  GROSS.test(name) ? "abo_gross" : KLEIN.test(name) ? "abo_klein" : null;

const buildCatalog = (plans: readonly RawPlan[]): CampaiTariffCatalog => {
  const byPlan = new Map<string, CampaiTariffEntry>();
  const byOption = new Map<string, CampaiTariffEntry>();
  const annualFeePlans = new Set<string>();

  for (const plan of plans) {
    const planId = plan._id ?? "";
    const name = plan.name ?? "";

    if (!planId) continue;

    if (!hasAccessTag(plan)) {
      if (plan.type === "membershipFee" && plan.period?.interval === "year") {
        annualFeePlans.add(planId);
      }
      continue;
    }

    const options = plan.charge?.options ?? [];

    if (options.length > 0) {
      for (const option of options) {
        const optionId = option.id ?? "";
        const optionName = option.name ?? "";
        const tariff = optionId ? optionTariff(optionName) : null;
        const priceCents = centsOf(option.amount);

        if (!tariff || priceCents === null) continue;

        byOption.set(`${planId}:${optionId}`, {
          tariff,
          label: optionName,
          priceCents,
        });
      }
      continue;
    }

    const priceCents = centsOf(plan.charge?.amount);
    if (priceCents === null) continue;

    byPlan.set(planId, { tariff: "punktekarte", label: name, priceCents });
  }

  return { byPlan, byOption, annualFeePlans };
};

let cached: { at: number; catalog: CampaiTariffCatalog } | null = null;
let pending: Promise<CampaiTariffCatalog> | null = null;

const loadCatalog = async (): Promise<CampaiTariffCatalog> => {
  const plans: RawPlan[] = [];

  for (let offset = 0; offset < 1000; offset += PAGE_SIZE) {
    const payload = await campaiFetch<PlanListResponse>("crm/plans/list", {
      limit: PAGE_SIZE,
      offset,
      returnCount: false,
    });

    const page = payload.plans ?? [];
    plans.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  const catalog = buildCatalog(plans);

  // Ein leerer Katalog ist kein Ergebnis, sondern ein Fehler: er würde jedes
  // Mitglied als tariflos ausweisen. Lieber gar keine Auskunft — die Aufrufer
  // zeigen dann „nicht abrufbar" statt „Kein Tarif".
  if (catalog.byPlan.size === 0 && catalog.byOption.size === 0) {
    throw new Error(
      "Campai führt keine Zugangskarten-Tarife — erwartet wird der Tag „Zugangskarte“ am Plan.",
    );
  }

  return catalog;
};

/**
 * Der Tarifkatalog, kurz zwischengespeichert. Die Antragsliste des Vorstands
 * fragt ihn für jede Zeile — einen Aufruf je Zeile wäre er nicht wert.
 * Parallele Aufrufe teilen sich denselben Abruf.
 */
export const fetchCampaiTariffCatalog =
  async (): Promise<CampaiTariffCatalog> => {
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.catalog;
    }

    pending ??= loadCatalog()
      .then((catalog) => {
        cached = { at: Date.now(), catalog };
        return catalog;
      })
      .finally(() => {
        pending = null;
      });

    return pending;
  };

/**
 * Die Stufe, die ein Vertrag ausdrückt — `null`, wenn er keine Zugangskarte
 * ist (Jahresbeitrag, Spende) oder eine Option trägt, die der Katalog nicht
 * kennt.
 */
export const tariffEntryFor = (
  catalog: CampaiTariffCatalog,
  planId: string,
  optionIds: readonly string[],
): CampaiTariffEntry | null => {
  for (const optionId of optionIds) {
    const entry = catalog.byOption.get(`${planId}:${optionId}`);
    if (entry) return entry;
  }

  return catalog.byPlan.get(planId) ?? null;
};
