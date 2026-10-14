import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const root = path.resolve("src");
function loader(mocks = {}, env = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    runInNewContext(
      source,
      {
        ...globals,
        module,
        exports: module.exports,
        Date,
        URL,
        Response,
        Buffer,
        console,
        process: { env },
        require(name) {
          if (Object.hasOwn(mocks, name)) return mocks[name];
          if (name === "server-only") return {};
          if (name.startsWith("node:")) return nativeRequire(name);
          if (name.startsWith("@/"))
            return load(path.join(root, name.slice(2)) + ".ts");
          if (name.startsWith("."))
            return load(path.resolve(path.dirname(file), name) + ".ts");
          throw new Error(`Unexpected dependency: ${name}`);
        },
      },
      { filename: file },
    );
    return module.exports;
  }
  return load;
}
const load = loader();
const domain = load("src/lib/volkshaus-booking.ts");
const edit = load("src/lib/volkshaus-admin-edit.ts");
const server = load("src/lib/volkshaus-admin-edit-server.ts");
const fixture = () => {
  const b = {
    id: "test-booking",
    referenceCode: "VHC-TEST",
    accessToken: "private-test-token",
    createdAt: "2026-01-01T10:00:00Z",
    updatedAt: "2026-01-01T10:00:00Z",
    customerName: "Test Person",
    organization: null,
    email: "person@example.test",
    phone: null,
    billingAddressLine: "Testweg 1",
    billingZip: "01000",
    billingCity: "Teststadt",
    eventTitle: "Testveranstaltung",
    eventDescription: "Ein Testworkshop",
    usageType: "commercial",
    frequency: "one_time",
    recurringOccurrences: 1,
    expectedAttendees: 10,
    bookingDate: "2027-12-01",
    startTime: "10:00:00",
    endTime: "12:00:00",
    setupStartTime: null,
    teardownEndTime: null,
    requestedRooms: ["stube"],
    equipment: {},
    specialRequirements: null,
    priceAdjustmentCents: 0,
    priceAdjustmentReason: null,
    requestStatus: "approved",
    reservationStatus: "held",
    contractStatus: "draft",
    invoiceStatus: "not_created",
    paymentStatus: "not_due",
    contractSnapshot: null,
    contractHash: null,
    customerSignature: null,
    staffSignature: null,
    contractVersion: 0,
    campaiInvoiceId: null,
    campaiDebtorAccount: null,
    holdExpiresAt: null,
  };
  b.priceSnapshot = domain.calculateVolkshausPrice(b);
  return b;
};
const input = (booking) => ({
  booking: edit.bookingEditValues(booking),
  lines: edit.editablePriceLines(booking),
  invoice: edit.getVolkshausInvoiceDetails(booking),
  reason: "Telefonisch vereinbart",
  expectedUpdatedAt: booking.updatedAt,
});
const json = (value) => JSON.parse(JSON.stringify(value));

test("money, quantities and discounts are validated; target gross is exact", () => {
  assert.equal(edit.euroToCents("12,34"), 1234);
  for (const value of ["1.234", "NaN", "1e3", "", "-"])
    assert.throws(() => edit.euroToCents(value));
  const booking = fixture();
  const lines = edit.linesForGrossTotal(
    "250,00",
    edit.editablePriceLines(booking),
  );
  assert.equal(
    edit.priceFromEditableLines(lines, booking.priceSnapshot).grossCents,
    25000,
  );
  assert.throws(() =>
    edit.priceFromEditableLines(
      [{ description: "Rabatt", quantity: "1", unitEuro: "-1" }],
      booking.priceSnapshot,
    ),
  );
  assert.throws(() =>
    edit.priceFromEditableLines(
      [{ description: "Raum", quantity: "1.5", unitEuro: "10" }],
      booking.priceSnapshot,
    ),
  );
  assert.equal(
    edit.priceFromEditableLines(
      edit.linesForGrossTotal("0", edit.editablePriceLines(booking)),
      booking.priceSnapshot,
    ).grossCents,
    0,
  );
});

test("editing a date preserves agreed prices unless explicitly recalculated", () => {
  const booking = fixture();
  const data = input(booking);
  data.booking.endTime = "18:00";
  const result = server.prepareVolkshausAdminEdit(booking, data, "Team");
  assert.equal(
    result.patch.priceSnapshot.grossCents,
    booking.priceSnapshot.grossCents,
  );
  assert.equal(result.scheduleChanged, true);
  assert.equal(result.patch.endAt, "2027-12-01T17:00:00.000Z");
  assert.notEqual(
    server.prepareVolkshausAdminEdit(
      booking,
      { ...data, recalculate: true },
      "Team",
    ).patch.priceSnapshot.grossCents,
    booking.priceSnapshot.grossCents,
  );
});

test("admin can correct a past event without fake privacy consent; invalid schedule still rejected", () => {
  const booking = fixture();
  const data = input(booking);
  data.booking.bookingDate = "2020-01-01";
  assert.equal(
    server.prepareVolkshausAdminEdit(booking, data, "Team").patch.bookingDate,
    "2020-01-01",
  );
  data.booking.endTime = "09:00";
  assert.throws(() => server.prepareVolkshausAdminEdit(booking, data, "Team"));
  data.booking.endTime = "12:00";
  data.booking.requestedRooms = [];
  assert.throws(() => server.prepareVolkshausAdminEdit(booking, data, "Team"));
});

test("signed revisions archive snapshots and signatures atomically and mark invoice correction", () => {
  const booking = fixture();
  booking.contractSnapshot = domain.buildVolkshausContractSnapshot(booking);
  booking.contractVersion = 2;
  booking.contractHash = "hash";
  booking.contractStatus = "fully_signed";
  booking.reservationStatus = "confirmed";
  booking.customerSignature = {
    name: "Test",
    signedAt: "2026-01-01",
    contractHash: "hash",
  };
  booking.campaiInvoiceId = "invoice-123";
  const data = input(booking);
  data.lines = edit.linesForGrossTotal("250", data.lines);
  assert.throws(
    () => server.prepareVolkshausAdminEdit(booking, data, "Team"),
    /bestätigen/,
  );
  const result = server.prepareVolkshausAdminEdit(
    booking,
    { ...data, confirmRevision: true },
    "Team",
  );
  assert.equal(result.patch.contractStatus, "draft");
  assert.equal(result.patch.contractSnapshot, null);
  assert.deepEqual(
    json(result.patch.priceSnapshot.admin.archivedContracts[0].snapshot),
    json(booking.contractSnapshot),
  );
  assert.equal(
    result.patch.priceSnapshot.admin.archivedContracts[0].customerSignature
      .contractHash,
    "hash",
  );
  assert.equal(
    result.patch.priceSnapshot.admin.invoiceCorrection.required,
    true,
  );
  assert.equal(booking.contractStatus, "fully_signed");
  const customerPrice = domain.getEffectiveVolkshausPrice({
    ...booking,
    ...result.patch,
  });
  assert.equal(customerPrice.admin, undefined);
  assert(!JSON.stringify(customerPrice).includes("Telefonisch vereinbart"));
  assert.equal(
    domain.buildVolkshausContractSnapshot({ ...booking, ...result.patch }).price
      .admin,
    undefined,
  );
});

test("invoice recipient and public description are separate from internal change notes", () => {
  const booking = fixture();
  const data = input(booking);
  data.invoice.recipient = "Andere Organisation";
  data.invoice.title = "Workshop Raummiete";
  const result = server.prepareVolkshausAdminEdit(booking, data, "Admin");
  assert.equal(result.patch.customerName, "Test Person");
  assert.equal(
    result.patch.priceSnapshot.admin.invoice.recipient,
    "Andere Organisation",
  );
  assert.equal(result.patch.campaiDebtorAccount, null);
  assert(
    !JSON.stringify(
      domain.applyPriceAdjustment(
        booking.priceSnapshot,
        100,
        "Internes Geheimnis",
      ),
    ).includes("Internes Geheimnis"),
  );
});

test("no-op and invoice in progress cannot be edited; protected fields are ignored", () => {
  const booking = fixture();
  const data = input(booking);
  assert.throws(
    () => server.prepareVolkshausAdminEdit(booking, data, "Team"),
    /keine Änderungen/,
  );
  data.booking.eventTitle = "Anderer Titel";
  data.booking.paymentStatus = "paid";
  data.booking.accessToken = "forged";
  const result = server.prepareVolkshausAdminEdit(booking, data, "Team");
  assert.equal(result.patch.paymentStatus, undefined);
  assert.equal(result.patch.accessToken, undefined);
  booking.invoiceStatus = "creating";
  assert.throws(
    () => server.prepareVolkshausAdminEdit(booking, data, "Team"),
    /gerade angelegt/,
  );
});

function apiFixture({
  conflict = false,
  syncFailure = false,
  authorized = true,
} = {}) {
  let booking = fixture();
  const updates = [];
  const syncs = [];
  const mocks = {
    "next/server": {
      NextResponse: {
        json: (value, init) =>
          new Response(JSON.stringify(value), { status: init?.status ?? 200 }),
      },
    },
    "@/lib/supabase/route": {
      createSupabaseRouteClient: () => ({
        supabase: {
          auth: { getUser: async () => ({ data: { user: { id: "staff" } } }) },
        },
      }),
    },
    "@/lib/supabase/admin": {
      createSupabaseAdminClient: () => {
        throw new Error("Unexpected Supabase access");
      },
    },
    "@/lib/access/access": { can: () => authorized },
    "@/lib/access/scopes": { VOLKSHAUS_SCOPE_ID: "vhc" },
    "@/lib/access/server": {
      loadUserAccess: async () => null,
      loadAccessOf: async () => null,
    },
    "@/lib/campai-booking-tags": {
      getCampaiBookingDisplayName: () => "Test Team",
    },
    "@/lib/volkshaus-booking-store": {
      getVolkshausBookingById: async () => booking,
      listVolkshausBookings: async () => [],
      updateVolkshausBooking: async (id, patch, expected) => {
        assert.equal(expected, booking.updatedAt);
        updates.push(patch);
        booking = { ...booking, ...patch, updatedAt: "updated" };
        return booking;
      },
      addVolkshausBookingEvent: async () => {},
    },
    "@/lib/volkshaus-invoice": {
      createVolkshausInvoice: async () => {
        throw new Error("No invoicing during edit");
      },
    },
    "@/lib/volkshaus-notifications": {
      notifyVolkshausContractReady: async () => {
        throw new Error("No email during edit");
      },
    },
    "@/lib/volkshaus-teamup": {
      getTeamupBusySlots: async () =>
        conflict
          ? [
              {
                id: "other",
                date: "2027-12-01",
                roomId: "stube",
                startTime: "09:00",
                endTime: "18:00",
                source: "teamup",
              },
            ]
          : [],
      getVolkshausTeamupRemoteId: () => "self",
      getInactiveVolkshausTeamupRemoteIds: () => [],
      syncVolkshausBookingToTeamup: async (b, status) => {
        syncs.push(status);
        if (syncFailure) throw new Error("Calendar unavailable");
        return { action: "updated" };
      },
    },
  };
  const route = loader(mocks)(
    "src/app/api/admin/volkshaus/bookings/[id]/route.ts",
  );
  return {
    get booking() {
      return booking;
    },
    updates,
    syncs,
    async save(data) {
      return route.PATCH(
        {
          json: async () => ({ action: "save_booking", ...data }),
          nextUrl: new URL("http://localhost/api/test"),
        },
        { params: Promise.resolve({ id: booking.id }) },
      );
    },
  };
}

test("admin API persists edit, returns fresh data and synchronizes reserved time", async () => {
  const api = apiFixture();
  const data = input(api.booking);
  data.booking.endTime = "13:00";
  const response = await api.save(data);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).booking.endTime, "13:00");
  assert.equal(api.updates.length, 1);
  assert.deepEqual(api.syncs, ["held"]);
});
test("calendar conflict and stale editor leave the booking untouched", async () => {
  const api = apiFixture({ conflict: true });
  const data = input(api.booking);
  data.booking.endTime = "13:00";
  assert.equal((await api.save(data)).status, 409);
  assert.equal(api.updates.length, 0);
  assert.equal(
    (await api.save({ ...data, expectedUpdatedAt: "old" })).status,
    409,
  );
  assert.equal(api.updates.length, 0);
});
test("calendar failures after persistence are surfaced; unauthorized saves denied", async () => {
  const api = apiFixture({ syncFailure: true });
  const data = input(api.booking);
  data.booking.endTime = "13:00";
  const response = await api.save(data);
  assert.equal(response.status, 200);
  assert.match((await response.json()).warning, /Teamup/);
  assert.equal(api.updates.length, 1);
  const denied = apiFixture({ authorized: false });
  assert.equal((await denied.save(data)).status, 403);
  assert.equal(denied.updates.length, 0);
});

test("real memory store compare-and-swap rejects stale updates", async () => {
  const memory = loader(
    {
      "@/lib/supabase-errors": { isMissingRelationError: () => false },
      "@/lib/supabase/admin": {},
    },
    { VOLKSHAUS_BOOKING_STORAGE: "memory", NODE_ENV: "test" },
  )("src/lib/volkshaus-booking-store.ts");
  const b = await memory.createVolkshausBooking(fixture());
  await memory.updateVolkshausBooking(
    b.id,
    { eventTitle: "First edit" },
    b.updatedAt,
  );
  await assert.rejects(
    memory.updateVolkshausBooking(b.id, { eventTitle: "Overwrite" }, "stale"),
    /inzwischen geändert/,
  );
  assert.equal(
    (await memory.getVolkshausBookingById(b.id)).eventTitle,
    "First edit",
  );
});

test("invoice-only text changes retain signed contract and reservation", () => {
  const booking = fixture();
  booking.contractSnapshot = domain.buildVolkshausContractSnapshot(booking);
  booking.contractStatus = "fully_signed";
  const data = input(booking);
  data.invoice.title = "Individueller Leistungstext";
  const result = server.prepareVolkshausAdminEdit(booking, data, "Team");
  assert.equal(result.needsRevision, false);
  assert.equal(result.patch.contractSnapshot, undefined);
  assert.equal(result.patch.reservationStatus, undefined);
});

test("Campai payload uses edited recipient, service date, text and positions, never internal notes", async () => {
  const booking = fixture();
  const data = input(booking);
  data.invoice.recipient = "Rechnungsempfänger GmbH";
  data.invoice.title = "Individuelle Raummiete";
  data.invoice.serviceDate = "2027-12-02";
  data.lines = [
    { description: "Saal nach Vereinbarung", quantity: "2", unitEuro: "100" },
    { description: "Nachlass", quantity: "1", unitEuro: "-10" },
  ];
  data.reason = "PRIVATE INTERNAL NOTE";
  const patch = server.prepareVolkshausAdminEdit(booking, data, "Team").patch;
  let sent;
  const module = loader(
    {
      "@/lib/campai-debtors": {
        buildDebtorPayload: () => {
          throw new Error("Existing debtor should be used");
        },
      },
      "@/lib/campai-booking-tags": { mergeCampaiTags: (tags) => tags },
      "@/lib/campai-receipts/config": {
        loadCampaiConfig: () => ({
          baseUrl: "https://example.test/api",
          apiKey: "test",
          organizationId: "test",
        }),
        loadInvoiceAccount: () => 4400,
      },
    },
    {
      CAMPAI_COST_CENTER1: "1",
      CAMPAI_VOLKSHAUS_COST_CENTER2: "2",
      CAMPAI_TAX_CODE_19: "19",
    },
    {
      fetch: async (url, init) => {
        assert.equal(url, "https://example.test/api/receipts/invoice");
        sent = JSON.parse(init.body);
        return new Response(JSON.stringify({ id: "test-invoice" }));
      },
    },
  )("src/lib/volkshaus-campai.ts");
  await module.createCampaiInvoiceForVolkshausBooking({
    ...booking,
    ...patch,
    campaiDebtorAccount: 123,
  });
  assert.equal(sent.accountName, "Rechnungsempfänger GmbH");
  assert.equal(sent.deliveryDate, "2027-12-02");
  assert.equal(sent.positions.length, 1);
  assert.equal(sent.positions[0].unitAmount, 19000);
  assert.equal(sent.positions[0].description, "Individuelle Raummiete");
  assert.match(
    sent.positions[0].details,
    /2 × Saal nach Vereinbarung: 200.00 EUR netto/,
  );
  assert.match(sent.positions[0].details, /1 × Nachlass: -10.00 EUR netto/);
  assert.equal(sent.draft, true);
  assert.equal(sent.doNotSendReceipt, true);
  assert(!JSON.stringify(sent).includes("PRIVATE INTERNAL NOTE"));
});

test("stale contract hash cannot sign a different revision", async () => {
  const booking = fixture();
  booking.contractSnapshot = domain.buildVolkshausContractSnapshot(booking);
  booking.contractHash = "current-hash";
  booking.contractStatus = "sent";
  const route = loader({
    "next/server": {
      NextResponse: {
        json: (value, init) =>
          new Response(JSON.stringify(value), { status: init?.status ?? 200 }),
      },
    },
    "@/lib/volkshaus-booking-store": {
      getVolkshausBookingByToken: async () => booking,
      updateVolkshausBooking: async () => {
        throw new Error("Must not sign");
      },
    },
    "@/lib/volkshaus-teamup": {},
    "@/lib/volkshaus-notifications": {},
  })("src/app/api/volkshaus/requests/access/[token]/route.ts");
  const response = await route.POST(
    {
      json: async () => ({
        action: "sign_contract",
        contractHash: "obsolete-hash",
        accepted: true,
        signerName: "Test",
      }),
    },
    { params: Promise.resolve({ token: "test" }) },
  );
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /inzwischen geändert/);
});
