import { describe, expect, it, vi } from "vitest";

import { ANNUAL_PLAN_ID, emptyRegistration } from "@/lib/campai-registration";

import { COMPLETION_TEMPLATE_ID, WELCOME_TEMPLATE_ID } from "./config";
import type { ApplicationPatch } from "./store";
import { changedFields, onboardingItems, type ApplicationData, type ApplicationInvoice, type MembershipApplication } from "./types";
import {
  acceptApplication,
  completeMembership,
  releaseInvoice,
  setChecklistItem,
  syncInvoice,
  syncPayments,
  type WorkflowCampai,
  type WorkflowDeps,
} from "./workflow";

const ABO_KLEIN_PLAN_ID = "6ab6f8b7744be89ef4ced0d3";

const data = (): ApplicationData => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature, sepaSignature, ...rest } = emptyRegistration();
  return {
    ...rest,
    firstName: "Lena",
    lastName: "Hoffmann",
    email: "lena@example.org",
    street: "Jagdweg 1",
    zip: "01159",
    city: "Dresden",
    entryAt: "2026-10-11",
    annualFee: 150,
    accessTariff: "small",
    paymentMethod: "sepaCreditTransfer",
    statutesAccepted: true,
    feeRulesAccepted: true,
  };
};

const application = (overrides: Partial<MembershipApplication> = {}): MembershipApplication => ({
  id: "app-1",
  number: "A-2026-001",
  status: "pending",
  email: "lena@example.org",
  firstName: "Lena",
  lastName: "Hoffmann",
  submittedData: data(),
  data: data(),
  signatures: { signature: "data:image/png;base64,AAAA" },
  campai: {},
  checklist: {},
  rejectionReason: null,
  history: [],
  lastError: null,
  createdAt: "2026-10-11T08:00:00.000Z",
  updatedAt: "2026-10-11T08:00:00.000Z",
  ...overrides,
});

const invoice = (overrides: Partial<ApplicationInvoice> = {}): ApplicationInvoice => ({
  id: "inv-1",
  number: null,
  draft: true,
  amountCents: 5250,
  leftToPayCents: 5250,
  paymentStatus: "unpaid",
  dueDate: "2026-10-25T00:00:00.000Z",
  paidAt: null,
  fileName: "Beitragsbeleg Entwurf.pdf",
  reference: null,
  positions: [],
  ...overrides,
});

/** Speichert wie store.updateApplication: campai mischen, Verlauf anhängen. */
const fakeSave = vi.fn(async (current: MembershipApplication, patch: ApplicationPatch) => ({
  ...current,
  ...(patch.status ? { status: patch.status } : {}),
  ...(patch.signatures === null ? { signatures: null } : {}),
  ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
  campai: { ...current.campai, ...patch.campai },
  checklist: Object.fromEntries(
    Object.entries({ ...current.checklist, ...patch.checklist }).filter(([, entry]) => entry),
  ),
  history: patch.history
    ? [...current.history, { at: "now", ...patch.history }]
    : current.history,
}));

const makeDeps = (campai: Partial<WorkflowCampai> = {}) => {
  const calls: string[] = [];
  const track =
    <T,>(name: string, result: T) =>
    async () => {
      calls.push(name);
      return result;
    };
  const deps: WorkflowDeps = {
    campai: {
      createMemberContact: track("createMemberContact", "contact-1"),
      ensureDebtor: track("ensureDebtor", 100719),
      readMemberNumber: track("readMemberNumber", "0351"),
      setMemberDetails: track("setMemberDetails", undefined),
      uploadFile: track("uploadFile", "resource-1"),
      addContactDocument: track("addContactDocument", "document-1"),
      createContract: vi.fn(async (_contactId: string, planId: string) => {
        calls.push(`createContract:${planId}`);
        return `contract-${planId}`;
      }),
      collectDraft: track("collectDraft", true),
      findInvoice: track("findInvoice", invoice()),
      getInvoice: track("getInvoice", invoice()),
      invoicePdf: track("invoicePdf", new Uint8Array([1])),
      completeInvoice: track(
        "completeInvoice",
        invoice({ draft: false, number: "BE-1", fileName: "Beitragsbeleg BE-1.pdf" }),
      ),
      sendTemplateMessage: vi.fn(async (_contactId: string, templateId: string) => {
        calls.push(`send:${templateId}`);
      }),
      ...campai,
    },
    save: fakeSave,
    applicationPdf: async () => ({ bytes: new Uint8Array([1]), fileName: "Antrag.pdf" }),
    now: () => "2026-10-11T09:00:00.000Z",
  };
  return { deps, calls };
};

describe("acceptApplication", () => {
  it("legt alles in der richtigen Reihenfolge an — Beitragsfelder vor den Verträgen", async () => {
    const { deps, calls } = makeDeps();
    const result = await acceptApplication(application(), "Vincent", deps);

    expect(calls).toEqual([
      "createMemberContact",
      "ensureDebtor",
      "readMemberNumber",
      "setMemberDetails",
      "uploadFile",
      "addContactDocument",
      `createContract:${ANNUAL_PLAN_ID}`,
      `createContract:${ABO_KLEIN_PLAN_ID}`,
      "collectDraft",
    ]);
    expect(result.status).toBe("invoice_draft");
    expect(result.signatures).toBeNull();
    expect(result.campai).toMatchObject({
      contactId: "contact-1",
      debtorAccount: 100719,
      memberNumber: "0351",
      documentId: "document-1",
      contracts: {
        [ANNUAL_PLAN_ID]: `contract-${ANNUAL_PLAN_ID}`,
        [ABO_KLEIN_PLAN_ID]: `contract-${ABO_KLEIN_PLAN_ID}`,
      },
      collectedAt: "2026-10-11T09:00:00.000Z",
    });
    expect(result.history.at(-1)).toMatchObject({ by: "Vincent", type: "accepted" });
  });

  it("macht nach einem Fehler beim ersten offenen Schritt weiter, ohne etwas doppelt anzulegen", async () => {
    const failing = makeDeps({
      createContract: vi.fn(async (_contactId: string, planId: string) => {
        if (planId === ABO_KLEIN_PLAN_ID) throw new Error("Campai 500");
        return `contract-${planId}`;
      }),
    });
    let saved: MembershipApplication | null = null;
    failing.deps.save = async (current, patch) => (saved = await fakeSave(current, patch));

    await expect(acceptApplication(application(), "Vincent", failing.deps)).rejects.toThrow(
      "Campai 500",
    );
    expect(saved!.status).toBe("pending");
    expect(saved!.lastError).toBe("Campai 500");
    expect(saved!.campai.contracts).toEqual({ [ANNUAL_PLAN_ID]: `contract-${ANNUAL_PLAN_ID}` });

    const retry = makeDeps();
    const result = await acceptApplication(saved!, "Vincent", retry.deps);
    expect(retry.calls).toEqual([`createContract:${ABO_KLEIN_PLAN_ID}`, "collectDraft"]);
    expect(result.status).toBe("invoice_draft");
    expect(result.lastError).toBeNull();
  });

  it("merkt sich, wenn noch nichts fällig ist", async () => {
    const { deps } = makeDeps({ collectDraft: async () => false });
    const result = await acceptApplication(application(), "Vincent", deps);
    expect(result.campai.noInvoiceDue).toBe(true);
    expect(result.campai.collectedAt).toBeUndefined();
  });

  it("nimmt keinen entschiedenen Antrag und keine Lastschrift an", async () => {
    const { deps } = makeDeps();
    expect(() => acceptApplication(application({ status: "rejected" }), "V", deps)).toThrow();
    expect(() =>
      acceptApplication(
        application({ data: { ...data(), paymentMethod: "sepaDirectDebit" } }),
        "V",
        deps,
      ),
    ).toThrow(/Lastschrift/);
  });
});

describe("syncInvoice", () => {
  it("übernimmt den Entwurf, sobald Campai ihn angelegt hat", async () => {
    const { deps, calls } = makeDeps();
    const accepted = application({
      status: "invoice_draft",
      campai: { contactId: "contact-1", debtorAccount: 100719, collectedAt: "2026-10-11T09:00:00.000Z" },
    });
    const { application: synced, invoice: found } = await syncInvoice(accepted, deps);
    expect(calls).toEqual(["findInvoice"]);
    expect(found?.id).toBe("inv-1");
    expect(synced.campai.invoiceId).toBe("inv-1");
  });
});

describe("releaseInvoice", () => {
  const accepted = () =>
    application({
      status: "invoice_draft",
      signatures: null,
      campai: { contactId: "contact-1", debtorAccount: 100719, invoiceId: "inv-1" },
    });

  it("schließt den Entwurf ab und schickt ihn mit der Willkommensvorlage", async () => {
    const { deps, calls } = makeDeps();
    const result = await releaseInvoice(accepted(), "Vincent", deps);
    expect(calls).toEqual([
      "getInvoice",
      "completeInvoice",
      "invoicePdf",
      "uploadFile",
      `send:${WELCOME_TEMPLATE_ID}`,
    ]);
    expect(deps.campai.sendTemplateMessage).toHaveBeenCalledWith("contact-1", WELCOME_TEMPLATE_ID, [
      { fileName: "Beitragsbeleg BE-1.pdf", resource: "resource-1" },
    ]);
    expect(result.status).toBe("welcomed");
    expect(result.campai.invoiceNumber).toBe("BE-1");
  });

  it("schließt eine schon abgeschlossene Rechnung nicht noch einmal ab", async () => {
    const { deps, calls } = makeDeps({
      getInvoice: async () => invoice({ draft: false, number: "BE-1" }),
    });
    await releaseInvoice(accepted(), "Vincent", deps);
    expect(calls).not.toContain("completeInvoice");
  });

  it("wartet auf den Entwurf statt ohne Rechnung zu senden", async () => {
    const { deps, calls } = makeDeps();
    const waiting = application({ status: "invoice_draft", campai: { contactId: "contact-1" } });
    await expect(releaseInvoice(waiting, "Vincent", deps)).rejects.toThrow(/noch einmal/);
    expect(calls).toEqual([]);
  });

  it("schickt ohne Anhang, wenn nichts fällig war", async () => {
    const { deps } = makeDeps();
    await releaseInvoice(
      application({ status: "invoice_draft", campai: { contactId: "contact-1", noInvoiceDue: true } }),
      "Vincent",
      deps,
    );
    expect(deps.campai.sendTemplateMessage).toHaveBeenCalledWith("contact-1", WELCOME_TEMPLATE_ID, []);
  });
});

describe("Aufnahme abhaken", () => {
  const welcomed = (overrides: Partial<MembershipApplication> = {}) =>
    application({
      status: "welcomed",
      signatures: null,
      campai: { contactId: "contact-1", invoiceId: "inv-1", welcomeSentAt: "2026-10-11" },
      ...overrides,
    });

  it("verlangt für die Zugangskarte eine Nummer und nimmt Häkchen zurück", async () => {
    const { deps } = makeDeps();
    expect(() => setChecklistItem(welcomed(), "card", true, "Vincent", deps)).toThrow(/Kartennummer/);
    const checked = await setChecklistItem(welcomed(), "card", true, "Vincent", deps, " 0388 ");
    expect(checked.checklist.card).toMatchObject({ by: "Vincent", cardNumber: "0388" });
    const unchecked = await setChecklistItem(checked, "card", false, "Vincent", deps);
    expect(unchecked.checklist.card).toBeUndefined();
  });

  it("kennt die Zugangskarte nicht, wenn keine gewählt ist", () => {
    const { deps } = makeDeps();
    const noCard = welcomed({ data: { ...data(), accessTariff: "none" } });
    expect(() => setChecklistItem(noCard, "card", true, "V", deps, "1")).toThrow();
    expect(() => setChecklistItem(noCard, "cardHandedOut", true, "V", deps)).toThrow();
    expect(onboardingItems(noCard).map((item) => item.key)).toEqual([
      "welcome",
      "roseguarden",
      "payment",
      "mailingList",
    ]);
  });

  it("hakt die Mailingliste ohne Eingabe ab", async () => {
    const { deps } = makeDeps();
    const checked = await setChecklistItem(welcomed(), "mailingList", true, "Vincent", deps);
    expect(checked.checklist.mailingList).toMatchObject({ by: "Vincent" });
    expect(checked.checklist.mailingList?.cardNumber).toBeUndefined();
  });

  it("hakt die Zahlung ab, sobald Campai die Rechnung als bezahlt führt", async () => {
    const { deps } = makeDeps({
      getInvoice: async () =>
        invoice({ draft: false, number: "BE-1", paymentStatus: "paid", paidAt: "2026-10-20T00:00:00.000Z" }),
    });
    const [paid, untouched] = await syncPayments(
      [welcomed(), application({ id: "app-2" })],
      deps,
    );
    expect(paid.checklist.payment).toEqual({ at: "2026-10-20T00:00:00.000Z", by: null });
    expect(untouched.checklist.payment).toBeUndefined();
  });

  it("lässt eine offene Rechnung offen", async () => {
    const { deps } = makeDeps({ getInvoice: async () => invoice({ draft: false, number: "BE-1" }) });
    const [result] = await syncPayments([welcomed()], deps);
    expect(result.checklist.payment).toBeUndefined();
  });
});

describe("completeMembership", () => {
  it("schickt Teil 2/2 erst, wenn alles abgehakt ist", async () => {
    const { deps } = makeDeps();
    expect(() => completeMembership(application(), "V", deps)).toThrow();
    const open = application({ status: "welcomed", campai: { contactId: "contact-1", welcomeSentAt: "x" } });
    expect(() => completeMembership(open, "V", deps)).toThrow(
      /Roseguarden, Zahlung, Mailingliste, Karte erstellen, Karte ausgeben/,
    );
    const entry = { at: "x", by: "V" };
    const result = await completeMembership(
      application({
        status: "welcomed",
        campai: { contactId: "contact-1", welcomeSentAt: "x" },
        checklist: {
          roseguarden: entry,
          payment: entry,
          mailingList: entry,
          card: { ...entry, cardNumber: "1" },
          cardHandedOut: entry,
        },
      }),
      "Vincent",
      deps,
    );
    expect(deps.campai.sendTemplateMessage).toHaveBeenCalledWith("contact-1", COMPLETION_TEMPLATE_ID);
    expect(result.status).toBe("completed");
  });
});

describe("changedFields", () => {
  it("nennt nur geänderte Felder, lesbar formatiert", () => {
    const before = data();
    const after = { ...before, annualFee: 180 as const, city: "Leipzig" };
    expect(changedFields(before, after)).toEqual([
      { field: "city", label: "Ort", from: "Dresden", to: "Leipzig" },
      {
        field: "annualFee",
        label: "Jahresbeitrag",
        from: "Regulär · 150,00\u00a0€",
        to: "Solidarisch · 180,00\u00a0€",
      },
    ]);
  });
});
