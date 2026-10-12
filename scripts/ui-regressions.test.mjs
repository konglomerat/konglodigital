import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(file, mocks = {}) {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
    { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  runInNewContext(source, {
    exports,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "react" || name === "react/jsx-runtime") return require(name);
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return exports;
}

const shell = compile("src/components/knglmrt/FieldShell.tsx");
const controls = {
  Field: compile("src/components/knglmrt/Field.tsx", { "@/components/knglmrt/FieldShell": shell }).default,
  Textarea: compile("src/components/knglmrt/Textarea.tsx", { "@/components/knglmrt/FieldShell": shell }).default,
  NativeSelect: compile("src/components/knglmrt/NativeSelect.tsx", {
    "@/components/knglmrt/FieldShell": shell,
    "@/components/knglmrt/Select": { Caret: () => null },
  }).default,
};

test("required controls emit native validation and optional controls remain optional", () => {
  for (const [name, Control] of Object.entries(controls)) {
    const render = (required) => renderToStaticMarkup(createElement(Control, {
      id: name, label: "Required value", required,
    }));
    assert.match(render(true), /<(input|textarea|select)[^>]*required=""/);
    assert.doesNotMatch(render(false), /required=""/);
    assert.match(render(true), new RegExp(`<label[^>]*for="${name}"`));
  }
});

test("separate field labels target the password input rather than its visibility button", () => {
  const html = renderToStaticMarkup(createElement(shell.default, {
    as: "div", htmlFor: "password", label: "Password",
  }, createElement("div", null,
    createElement("input", { id: "password", type: "password" }),
    createElement("button", { type: "button" }, "Show"),
  )));
  assert.match(html, /<label[^>]*for="password"[^>]*>Password<\/label>/);
});

const { markdownExcerpt } = compile("src/lib/markdown-excerpt.ts");
test("previews remove Markdown while keeping workshop names and punctuation intact", () => {
  assert.equal(markdownExcerpt("## Transparenz\n\n**3D-Druck** im #Rosenwerk\n* [Mehr erfahren](https://example.test)", 200), "Transparenz 3D-Druck im #Rosenwerk Mehr erfahren");
  assert.equal(markdownExcerpt("* Modell: mechArm 270-Pi\n* Material: Metall", 200), "Modell: mechArm 270-Pi Material: Metall");
  assert.equal(markdownExcerpt("Ein `file_name` und *Text*.", 200), "Ein file_name und Text.");
  assert.ok(markdownExcerpt("Ein längerer Text für eine Vorschau mit weiteren Wörtern", 30).length <= 30);
});

function membershipRoute(page, locale) {
  return compile("src/app/[lang]/mitglied-werden/page.tsx", {
    "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    "@/i18n/server": { getRequestLocale: async () => locale },
    "@/lib/payload-cms": { loadPayloadPage: async () => page },
    "../components/PayloadPageContent": {
      default: "article",
      payloadPageMetadata: (value, fallback) => ({ title: value?.title ?? fallback.title }),
    },
  });
}

test("membership keeps published CMS content and falls back to the matching existing site", async () => {
  const page = { title: "Join us", slug: "mitglied-werden", _status: "published" };
  assert.equal((await membershipRoute(page, "en").default()).props.page, page);
  for (const locale of ["de", "en"]) {
    const url = `https://konglomerat.org${locale === "en" ? "/en" : ""}/der-verein/mitglied-werden`;
    await assert.rejects(membershipRoute(null, locale).default(), { message: `REDIRECT:${url}` });
  }
});
