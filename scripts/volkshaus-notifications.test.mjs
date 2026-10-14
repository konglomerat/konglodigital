import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Compile in memory and stub external services: no real emails or database writes.
const source = ts.transpileModule(
  readFileSync(
    new URL("../src/lib/volkshaus-notifications.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

const requestMessages = {};
runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../src/lib/volkshaus-request-messages.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: requestMessages },
);

const staffEmail = "mitmachen@neuesvolkshaus.de";
const booking = {
  id: "booking-test",
  referenceCode: "VHC-TEST",
  customerName: "Test <Person>",
  email: "customer@example.test",
  bookingDate: "2026-12-01",
  startTime: "10:00",
  endTime: "12:00",
  requestedRooms: ["saal"],
  eventTitle: "Test & Veranstaltung",
};
const input = {
  booking,
  accessUrl: "https://example.test/volkshaus/anfrage/private-token",
  adminUrl: "https://example.test/admin/volkshaus",
};

class SmtpConfigurationError extends Error {}

const loadNotifications = ({
  env = {},
  failRecipient,
  configurationMissing = false,
  auditFails = false,
} = {}) => {
  const mails = [];
  const events = [];
  const errors = [];
  const exports = {};
  const mocks = {
    "server-only": {},
    "@/lib/volkshaus-request-messages": requestMessages,
    "@/lib/volkshaus-booking": {
      formatEuro: () => "100,00 €",
      getEffectiveVolkshausPrice: () => ({ grossCents: 10000 }),
      getRoomLabel: () => "Saal",
    },
    "@/lib/volkshaus-booking-store": {
      addVolkshausBookingEvent: async (event) => {
        if (auditFails) throw new Error("Audit unavailable");
        events.push(event);
      },
    },
    "@/lib/smtp-mail": {
      SmtpConfigurationError,
      sendSmtpMail: async (mail) => {
        mails.push(mail);
        if (configurationMissing)
          throw new SmtpConfigurationError("Missing SMTP configuration");
        if (mail.to === failRecipient)
          throw new Error("SMTP rejected recipient");
      },
    },
  };
  runInNewContext(source, {
    exports,
    Error,
    process: { env },
    console: { error: (...args) => errors.push(args) },
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
      return mocks[name];
    },
  });
  return { api: exports, mails, events, errors };
};

for (const adminEmail of [undefined, "support@example.test"]) {
  test(`new requests reach Volkshaus with SMTP_ADMIN_EMAIL=${adminEmail}`, async () => {
    const { api, mails, events } = loadNotifications({
      env: { SMTP_ADMIN_EMAIL: adminEmail },
    });
    const result = await api.notifyVolkshausRequestSubmitted(input);
    assert.equal(result.sent, true);
    assert.deepEqual(
      mails.map((mail) => mail.to).sort(),
      [booking.email, staffEmail].sort(),
    );
    const staffMail = mails.find((mail) => mail.to === staffEmail);
    assert.ok(staffMail.html.includes(input.adminUrl));
    assert.ok(staffMail.html.includes("Test &lt;Person&gt;"));
    assert.ok(staffMail.html.includes("Test &amp; Veranstaltung"));
    assert.ok(!staffMail.html.includes("private-token"));
    assert.ok(mails.every((mail) => mail.replyTo === staffEmail));
    assert.equal(events[0].eventType, "staff_notification_sent");
    assert.equal(events[0].payload.trigger, "request_submitted");
  });
}

test("customer signatures notify Volkshaus even with no general admin address", async () => {
  const { api, mails, events } = loadNotifications();
  assert.equal((await api.notifyVolkshausCustomerSigned(input)).sent, true);
  assert.deepEqual(
    mails.map((mail) => mail.to),
    [staffEmail],
  );
  assert.ok(mails[0].html.includes(input.adminUrl));
  assert.equal(events[0].payload.trigger, "contract_customer_signed");
});

test("staff contract release and customer confirmation do not notify staff", async () => {
  const { api, mails, events } = loadNotifications();
  await api.notifyVolkshausContractReady(input);
  await api.notifyVolkshausContractCompleted(input);
  assert.deepEqual(
    mails.map((mail) => mail.to),
    [booking.email, booking.email],
  );
  assert.equal(events.length, 0);
});

test("staff delivery failures are recorded separately from successful customer delivery", async () => {
  const { api, events, errors } = loadNotifications({
    failRecipient: staffEmail,
  });
  assert.equal((await api.notifyVolkshausRequestSubmitted(input)).sent, true);
  const result = await api.notifyVolkshausCustomerSigned(input);
  assert.equal(result.sent, false);
  assert.equal(result.reason, "provider_error");
  assert.equal(events.length, 2);
  for (const event of events) {
    assert.equal(event.eventType, "staff_notification_failed");
    assert.equal(event.payload.recipient, staffEmail);
    assert.equal(event.payload.error, "SMTP rejected recipient");
  }
  assert.equal(errors.length, 2);
});

test("customer delivery failure does not prevent the staff notification", async () => {
  const { api, mails, events } = loadNotifications({
    failRecipient: booking.email,
  });
  assert.equal((await api.notifyVolkshausRequestSubmitted(input)).sent, false);
  assert.ok(mails.some((mail) => mail.to === staffEmail));
  assert.equal(events[0].eventType, "staff_notification_sent");
});

test("missing SMTP configuration is reported and recorded", async () => {
  const { api, events } = loadNotifications({ configurationMissing: true });
  const result = await api.notifyVolkshausCustomerSigned(input);
  assert.equal(result.sent, false);
  assert.equal(result.reason, "not_configured");
  assert.equal(events[0].eventType, "staff_notification_failed");
  assert.equal(events[0].payload.reason, "not_configured");
});

test("audit failure does not turn successful email delivery into a failed booking", async () => {
  const { api, mails, errors } = loadNotifications({ auditFails: true });
  assert.equal((await api.notifyVolkshausRequestSubmitted(input)).sent, true);
  assert.equal(mails.length, 2);
  assert.equal(errors.length, 1);
});
