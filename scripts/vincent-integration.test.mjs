import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(file, mocks = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    exports,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "react/jsx-runtime") return require(name);
      throw new Error(`Unexpected import: ${name}`);
    },
    ...globals,
  });
  return exports;
}

function directory(pages) {
  const requests = [];
  const api = compile("src/lib/campai-contact-directory.ts", {}, {
    process: { env: { CAMPAI_API_KEY: "test", CAMPAI_ORGANIZATION_ID: "org", CAMPAI_MANDATE_ID: "mandate" } },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, ...body });
      return { ok: true, text: async () => JSON.stringify({ contacts: pages[body.offset / 100] ?? [] }) };
    },
  });
  return { ...api, requests };
}
const contact = (id, overrides = {}) => ({
  _id: id, name: `Member ${id}`, communication: { email: `${id}@example.test` },
  types: ["member"], contactNumbers: { member: "123" }, debtor: { account: 10001 }, ...overrides,
});

test("account activation finds active members on later pages of the new Campai API", async () => {
  const api = directory([
    Array.from({ length: 100 }, (_, index) => contact(`other-${index}`)),
    [contact("target", { communication: { email: "TARGET@example.test" } })],
  ]);
  assert.equal((await api.getCampaiActiveMemberContactByEmail(" Target@example.test ")).id, "target");
  assert.deepEqual(api.requests.map(({ offset }) => offset), [0, 100]);
  assert.ok(api.requests.every(({ url }) => url.endsWith("/crm/contacts/list")));
});

test("account activation excludes departed contacts and nonmembers and skips empty input", async () => {
  const api = directory([[
    contact("target", { member: { exitAt: "2000-01-01" } }),
    contact("target", { member: { terminatedAt: "2000-01-01" } }),
    contact("target", { types: ["customer"] }),
  ]]);
  assert.equal(await api.getCampaiActiveMemberContactByEmail("   "), null);
  assert.equal(api.requests.length, 0);
  assert.equal(await api.getCampaiActiveMemberContactByEmail("target@example.test"), null);
});

const localize = (path, locale) => locale === "en" ? `/en${path}` : path;
const i18n = { getServerI18n: async () => ({ locale: "en", tx: (text) => text }) };
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object") return [];
  return [node, ...elements(node.props?.children)];
}
function home(page) {
  return compile("src/app/page.tsx", {
    "next/image": { default: "image" },
    "@fortawesome/free-solid-svg-icons": { faArrowRight: {} },
    "@/components/knglmrt/Divider": { default: "divider" },
    "@/components/knglmrt/Button": { default: "button" },
    "@/components/knglmrt/Face": { default: "face" },
    "./ShowcaseOfTheMonthSection": { default: "showcase" },
    "./ResourceOfTheMonthSection": { default: "resources" },
    "./NewsSection": { default: "news" },
    "./TerrazzoParallax": { default: "terrazzo" },
    "./hero-hello.jpg": { default: "hero.jpg" },
    "@/i18n/config": { localizePathname: localize },
    "@/i18n/server": i18n,
    "@/lib/payload-cms": {
      loadPayloadPage: async () => page,
      payloadPageHasAppSlot: (value, slot) => value.slots.includes(slot),
    },
    "./[lang]/components/PayloadPageContent": {
      default: "cms-content", payloadPageMetadata: (value, fallback) => value ?? fallback,
    },
  });
}

test("home fallback combines Vincent's four membership steps with localized links", async () => {
  const fallback = await home(null).default();
  const nodes = elements(await fallback.type());
  const list = nodes.find(({ type }) => type === "ol");
  assert.equal(elements(list).filter(({ type }) => type === "li").length, 4);
  const links = nodes.filter(({ type }) => type === "button").map(({ props }) => props.href);
  assert.ok(links.includes("/en/registration"));
  assert.ok(links.includes("/en/calendar"));
  assert.ok(links.includes("/en/werkbereiche"));
});

test("published CMS home keeps live feeds without duplicating CMS app slots", async () => {
  const page = { slots: ["news"] };
  const nodes = elements(await home(page).default());
  assert.equal(nodes.find(({ type }) => type === "cms-content").props.page, page);
  const feed = nodes.find(({ type }) => typeof type === "function");
  const feeds = elements(feed.type(feed.props)).map(({ type }) => type);
  assert.ok(feeds.includes("showcase"));
  assert.ok(feeds.includes("resources"));
  assert.ok(!feeds.includes("news"));
});

test("CMS navigation keeps Vincent's admin button and avoids duplicate inventory links", async () => {
  const { default: TopNav } = compile("src/app/TopNav.tsx", {
    "@/i18n/server": i18n, "@/i18n/config": { localizePathname: localize },
    "next/image": { default: "image" }, "next/link": { default: "link" },
    "@/components/knglmrt/Face": { default: "face" },
    "./TopNavLink": { default: "nav-link" },
    "@/components/knglmrt/Button": { default: "button" },
  });
  const nodes = elements(await TopNav({
    isAuthenticated: true, currentUserDisplayName: "Member", adminAreaHref: "/admin",
    links: [{ href: "/en/custom", label: "CMS" }, { href: "/en/resources", label: "Inventory" }],
    inventoryHref: "/en/resources",
  }));
  const admin = nodes.find(({ type, props }) => type === "button" && props.kind === "admin");
  assert.equal(admin.props.href, "/en/admin");
  const links = nodes.filter(({ type }) => type === "nav-link");
  assert.equal(links.filter(({ props }) => props.href === "/en/resources").length, 1);
  assert.ok(links.some(({ props }) => props.href === "/en/custom"));
});
