import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the actual loaders and route handlers without CMS/database writes.
function compile(file, mocks = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
    { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  runInNewContext(source, {
    exports,
    URL,
    ...globals,
    require(name) {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
      return mocks[name];
    },
  });
  return exports;
}

const werkbereiche = compile("src/lib/werkbereiche.ts");
const paths = compile("src/lib/payload-page-path.ts", { "@/lib/werkbereiche": werkbereiche });
const i18n = compile("src/i18n/config.ts");

function cms({ docs = [], configured = true, fail = false } = {}) {
  const requests = [];
  const api = compile("src/lib/payload-cms.ts", {
    "server-only": {},
    react: { cache: (fn) => fn },
    "@/lib/payload-page-path": paths,
  }, {
    process: { env: configured ? { PAYLOAD_CMS_URL: "https://cms.example.test" } : {} },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (fail) throw new Error("CMS offline");
      return { ok: true, json: async () => ({ docs }) };
    },
  });
  return { api, requests };
}

function route(api) {
  return compile("src/app/[lang]/[slug]/page.tsx", {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    "next/navigation": {
      notFound: () => { throw new Error("NOT_FOUND"); },
      permanentRedirect: (path) => { throw new Error(`REDIRECT:${path}`); },
    },
    "@/i18n/config": i18n,
    "@/lib/payload-page-path": paths,
    "@/lib/payload-cms": api,
    "../components/PayloadPageContent": {
      default: "PayloadPageContent",
      payloadPageMetadata: (page) => ({ title: page.meta?.title || page.title }),
    },
  });
}

const published = { id: 1, slug: "kontakt", title: "Kontakt", _status: "published", layout: [{ blockType: "contact", email: "hello@example.test" }] };

test("an arbitrary published page reaches the existing block renderer and metadata", async () => {
  const { api, requests } = cms({ docs: [published] });
  const pageRoute = route(api);
  const props = { params: Promise.resolve({ lang: "de", slug: "kontakt" }) };
  const result = await pageRoute.default(props);
  assert.equal(result.type, "PayloadPageContent");
  assert.equal(result.props.page, published);
  assert.equal((await pageRoute.generateMetadata(props)).title, "Kontakt");
  const query = requests[0].url.searchParams;
  assert.equal(query.get("where[_status][equals]"), "published");
  assert.equal(query.get("draft"), "false");
  assert.equal(query.get("where[or][0][slug][equals]"), "kontakt");
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[0].options.next.revalidate, 60);
});

test("draft documents are never rendered even if a CMS response includes them", async () => {
  const { api } = cms({ docs: [{ ...published, _status: "draft" }] });
  const props = { params: Promise.resolve({ lang: "de", slug: "kontakt" }) };
  await assert.rejects(route(api).default(props), /NOT_FOUND/);
  await assert.rejects(route(api).generateMetadata(props), /NOT_FOUND/);
});

test("missing pages, unavailable CMS and missing configuration give a 404", async () => {
  for (const options of [{}, { fail: true }, { configured: false }]) {
    const { api } = cms(options);
    await assert.rejects(route(api).default({ params: Promise.resolve({ lang: "de", slug: "unbekannt" }) }), /NOT_FOUND/);
  }
});

test("aliases prefer the intended published document rather than API ordering", async () => {
  const docs = [
    { ...published, slug: "home" },
    { ...published, id: 2, slug: "startseite", _status: "draft" },
  ];
  assert.equal((await cms({ docs }).api.loadPayloadPage("startseite", "home")).slug, "home");
  docs[1]._status = "published";
  assert.equal((await cms({ docs }).api.loadPayloadPage("startseite", "home")).slug, "startseite");
});

test("CMS page references use canonical application paths", () => {
  const { api } = cms();
  for (const [slug, expected] of [
    ["kontakt", "/kontakt"], ["mitglied-werden", "/mitglied-werden"],
    ["home", "/"], ["startseite", "/"], ["ueber-uns", "/verein"],
    ["werkstattbereiche", "/werkbereiche"], ["zugangskarte", "/monatsbeitrag"],
    ["holz", "/werkbereiche/holz"], ["werkbereich-reparatur", "/werkbereiche/reparatur"],
    ["werkbereiche-holz", "/werkbereiche/holz"],
  ]) {
    assert.equal(api.resolvePayloadLinkHref({ type: "reference", reference: { relationTo: "pages", value: { slug } } }), expected);
  }
  for (const slug of ["//evil.test", "../admin", "kontakt?draft=true", "", "werkbereich-"]) {
    assert.equal(paths.getPayloadPagePath(slug), null);
  }
});

test("alias redirects retain the requested language and ordinary pages render in English", async () => {
  const { api, requests } = cms({ docs: [published] });
  const pageRoute = route(api);
  await assert.rejects(pageRoute.default({ params: Promise.resolve({ lang: "en", slug: "ueber-uns" }) }), /REDIRECT:\/en\/verein/);
  assert.equal(requests.length, 0);
  const result = await pageRoute.default({ params: Promise.resolve({ lang: "en", slug: "kontakt" }) });
  assert.equal(result.props.page, published);
  await assert.rejects(pageRoute.default({ params: Promise.resolve({ lang: "xx", slug: "kontakt" }) }), /NOT_FOUND/);
});

test("additional published Werkbereich pages do not require a hardcoded list entry", async () => {
  const page = { ...published, slug: "werkbereich-reparatur", title: "Reparatur" };
  const { api } = cms({ docs: [page] });
  const pageRoute = compile("src/app/[lang]/werkbereiche/[slug]/page.tsx", {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/werkbereiche": werkbereiche,
    "@/lib/payload-page-path": paths,
    "@/i18n/config": i18n,
    "@/lib/payload-cms": api,
    "../WerkbereichCmsPage": { default: "WerkbereichCmsPage" },
  });
  const result = await pageRoute.default({ params: Promise.resolve({ slug: "reparatur", lang: "de" }) });
  assert.equal(result.props.fallbackTitle, "Reparatur");
  assert.equal(result.props.slug, "reparatur");
  await assert.rejects(pageRoute.default({ params: Promise.resolve({ slug: "nicht-da", lang: "de" }) }), /NOT_FOUND/);
});

function navigation({ responses = {}, fail = false, configured = true } = {}) {
  const requests = [];
  const api = compile("src/lib/payload-navigation.ts", {
    "server-only": {},
    react: { cache: (fn) => fn },
    "@/i18n/config": i18n,
    "./payload-cms": cms({ configured }).api,
  }, {
    AbortSignal,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (fail) throw new Error("CMS offline");
      const doc = responses[url.pathname];
      return { ok: doc !== undefined, json: async () => doc };
    },
  });
  return { api, requests };
}

test("CMS globals preserve ordering, page references, external links and tab settings", async () => {
  const { api, requests } = navigation({ responses: {
    "/api/globals/header": { navItems: [
      { link: { type: "reference", label: "Kontakt", reference: { relationTo: "pages", value: published } } },
      { link: { type: "custom", label: "Partner", url: "https://example.test", newTab: true } },
    ] },
    "/api/globals/footer": { navItems: [{ link: { type: "custom", label: "Schreib uns", url: "mailto:hello@example.test" } }] },
  } });
  const result = await api.loadPayloadNavigation();
  assert.equal(result.header[0].href, "/kontakt");
  assert.equal(result.header[0].label, "Kontakt");
  assert.equal(result.header[1].href, "https://example.test/");
  assert.equal(result.header[1].newTab, true);
  assert.equal(result.footer[0].href, "mailto:hello@example.test");
  assert.equal(requests.length, 2);
  for (const { url, options } of requests) {
    assert.equal(url.searchParams.get("depth"), "1");
    assert.equal(url.searchParams.get("draft"), "false");
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.next.revalidate, 60);
  }
});

test("unavailable menus use defaults independently; deliberately empty menus stay empty", async () => {
  const { api } = navigation({ responses: { "/api/globals/footer": { id: 1, navItems: [] } } });
  const result = await api.loadPayloadNavigation();
  assert.equal(result.header, null);
  assert.equal(result.footer.length, 0);
  for (const options of [{ fail: true }, { configured: false }]) {
    const result = await navigation(options).api.loadPayloadNavigation();
    assert.equal(result.header, null);
    assert.equal(result.footer, null);
  }
  assert.equal(api.resolveNavigationItems({ error: "unavailable" }), null);
  assert.equal(api.resolveNavigationItems({ navItems: [] }), null);
});

test("navigation drops unsafe URLs, unresolved references and drafts", () => {
  const { api } = navigation();
  const items = api.resolveNavigationItems({ navItems: [
    null,
    { link: { label: "Unsafe", url: "javascript:alert(1)" } },
    { link: { label: "Protocol relative", url: "//example.test" } },
    { link: { label: "Backslash", url: "/\\example.test" } },
    { link: { type: "reference", label: "Draft", reference: { relationTo: "pages", value: { ...published, _status: "draft" } } } },
    { link: { type: "reference", label: "Missing", reference: { relationTo: "pages", value: 123 } } },
    { link: { label: " ", url: "/kontakt" } },
    { link: { type: "custom", label: " Kontakt ", url: "/kontakt" } },
  ] });
  assert.equal(items.length, 1);
  assert.equal(items[0].label, "Kontakt");
});

test("menu localization keeps external URLs and avoids duplicate language prefixes", () => {
  const { api } = navigation();
  const items = [
    { href: "/kontakt", label: "Kontakt" },
    { href: "/en/verein", label: "Verein" },
    { href: "https://example.test", label: "Extern" },
    { href: "/api/file", label: "Download" },
    { href: "/", label: "Start" },
  ];
  assert.deepEqual(Array.from(api.localizeNavigationItems(items, "en"), (item) => item.href),
    ["/en/kontakt", "/en/verein", "https://example.test", "/api/file", "/en"]);
  assert.equal(api.localizeNavigationItems(items, "de")[1].href, "/verein");
});


test("ordinary CMS pages cannot also appear as Werkbereich pages", async () => {
  const { api, requests } = cms({ docs: [published] });
  assert.equal(await api.loadPayloadWerkbereichPage("kontakt"), null);
  assert.equal(requests[0].url.searchParams.get("where[or][2][slug][equals]"), null);
});

test("every registered area has one canonical draft and retains real 3D tools", () => {
  const { createWerkbereichDraft } = compile("src/lib/werkbereich-content.ts");
  const pages = werkbereiche.WERKBEREICHE.map(createWerkbereichDraft);
  assert.equal(pages.length, 16);
  assert.equal(new Set(pages.map((page) => page.slug)).size, 16);
  for (const page of pages) {
    assert.equal(page._status, "draft");
    assert.equal(paths.getPayloadPagePath(page.slug), `/werkbereiche/${page.werkbereich}`);
  }
  const printer = pages.find((page) => page.werkbereich === "3d-druck");
  assert.deepEqual(Array.from(printer.layout.find((block) => block.blockType === "cardGrid").cards, (card) => card.link.url),
    ["/printers", "/printers/emptying", "/printers/access-codes"]);
});

test("nested Werkbereich alias URLs redirect to a single localized route", async () => {
  const pageRoute = compile("src/app/[lang]/werkbereiche/[slug]/page.tsx", {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    "next/navigation": {
      notFound: () => { throw new Error("NOT_FOUND"); },
      permanentRedirect: (path) => { throw new Error(`REDIRECT:${path}`); },
    },
    "@/lib/werkbereiche": werkbereiche,
    "@/lib/payload-page-path": paths,
    "@/i18n/config": i18n,
    "@/lib/payload-cms": cms().api,
    "../WerkbereichCmsPage": { default: "WerkbereichCmsPage" },
  });
  for (const alias of ["werkbereich-holz", "werkbereiche-holz", "werkbereich-werkbereiche-holz"]) {
    await assert.rejects(pageRoute.default({ params: Promise.resolve({ slug: alias, lang: "en" }) }), /REDIRECT:\/en\/werkbereiche\/holz/);
  }
});
