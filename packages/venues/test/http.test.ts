import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError, JsonHttpClient } from "../src/http.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("builds query strings and skips undefined values", async () => {
  let seenUrl = "";
  const client = new JsonHttpClient({
    baseUrl: "https://example.invalid/",
    fetch: async (url) => {
      seenUrl = url;
      return jsonResponse({ ok: true });
    },
  });

  await client.get("/tokens", { query: "bonk", limit: 5, missing: undefined });
  assert.equal(seenUrl, "https://example.invalid/tokens?query=bonk&limit=5");
});

test("passes per-request headers", async () => {
  let auth = "";
  const client = new JsonHttpClient({
    baseUrl: "https://example.invalid",
    fetch: async (_url, init) => {
      const headers = new Headers(init?.headers);
      auth = headers.get("authorization") ?? "";
      return jsonResponse({});
    },
  });

  await client.get("/x", undefined, { authorization: "Bearer abc" });
  assert.equal(auth, "Bearer abc");
});

test("retries 5xx and succeeds", async () => {
  let attempts = 0;
  const client = new JsonHttpClient({
    baseUrl: "https://example.invalid",
    retryBaseMs: 1,
    fetch: async () => {
      attempts += 1;
      return attempts < 3 ? jsonResponse({ msg: "boom" }, 503) : jsonResponse({ ok: true });
    },
  });

  assert.deepEqual(await client.get("/x"), { ok: true });
  assert.equal(attempts, 3);
});

test("surfaces client errors immediately with the body", async () => {
  let attempts = 0;
  const client = new JsonHttpClient({
    baseUrl: "https://example.invalid",
    retryBaseMs: 1,
    fetch: async () => {
      attempts += 1;
      return jsonResponse({ error: "unauthorized" }, 401);
    },
  });

  await assert.rejects(() => client.get("/x"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 401);
    assert.match(error.body, /unauthorized/);
    return true;
  });
  assert.equal(attempts, 1);
});
