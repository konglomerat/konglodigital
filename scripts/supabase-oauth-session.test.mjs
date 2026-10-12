import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createServerClient } from "@supabase/ssr";
import ts from "typescript";

test("OAuth consent reuses the cookie session from the website's server login", async () => {
  const originalFetch = globalThis.fetch;
  const cookies = new Map();
  const subject = "1b2ea7cc-2233-4455-aabb-123456789012";
  const user = { id: subject, email: "member@example.test" };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: subject, exp: Math.floor(Date.now() / 1000) + 3600 })}.${Buffer.alloc(32).toString("base64url")}`;
  let browser;
  let server;
  const userRequests = [];
  globalThis.fetch = async (url, init) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/token")) {
      return Response.json({ access_token: token, refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, user });
    }
    assert.equal(pathname, "/auth/v1/user");
    userRequests.push(new Headers(init.headers).get("authorization"));
    return Response.json(user);
  };

  try {
    server = createServerClient("https://test-project.supabase.co", "test-anon", {
      cookies: {
        getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
        setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
      },
    });
    const login = await server.auth.signInWithPassword({ email: user.email, password: "test-password" });
    assert.equal(login.error, null);
    assert.ok(cookies.size > 0);

    // Simulate only document.cookie; localStorage contains no session at all.
    globalThis.window = { location: { href: "https://website.example.test/de/oauth/consent" }, addEventListener() {}, removeEventListener() {} };
    globalThis.document = {
      cookie: Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; "),
      visibilityState: "hidden",
    };
    globalThis.window.document = globalThis.document;
    const source = ts.transpileModule(
      readFileSync(new URL("../src/lib/supabase/cookie-browser.ts", import.meta.url), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const exports = {};
    runInNewContext(source, {
      exports,
      require: createRequire(import.meta.url),
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon" } },
    });
    browser = exports.createSupabaseCookieBrowserClient();
    const result = await browser.auth.getUser();
    assert.equal(result.error, null);
    assert.equal(result.data.user.id, subject);
    assert.deepEqual(userRequests, [`Bearer ${token}`]);
  } finally {
    await browser?.auth.stopAutoRefresh();
    browser?.auth.broadcastChannel?.close();
    await server?.auth.stopAutoRefresh();
    delete globalThis.window;
    delete globalThis.document;
    globalThis.fetch = originalFetch;
  }
});
