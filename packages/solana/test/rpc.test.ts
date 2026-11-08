import assert from "node:assert/strict";
import { test } from "node:test";
import { RpcError, RpcTransportError, SolanaRpc } from "../src/rpc.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("returns the JSON-RPC result", async () => {
  const requests: string[] = [];
  const rpc = new SolanaRpc({
    endpoint: "https://example.invalid",
    fetch: async (_input, init) => {
      requests.push(String(init?.body));
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: 42 });
    },
  });

  assert.equal(await rpc.getSlot(), 42);
  assert.equal(requests.length, 1);
  assert.match(requests[0] as string, /getSlot/);
});

test("retries rate limits and eventually succeeds", async () => {
  let attempt = 0;
  const rpc = new SolanaRpc({
    endpoint: "https://example.invalid",
    retryBaseMs: 1,
    retryMaxMs: 2,
    fetch: async () => {
      attempt += 1;
      if (attempt < 3) {
        return jsonResponse({ error: "slow down" }, 429);
      }
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: "ok" });
    },
  });

  assert.equal(await rpc.call<string>("getSlot"), "ok");
  assert.equal(attempt, 3);
});

test("surfaces JSON-RPC errors without retrying", async () => {
  let attempt = 0;
  const rpc = new SolanaRpc({
    endpoint: "https://example.invalid",
    retryBaseMs: 1,
    fetch: async () => {
      attempt += 1;
      return jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32602, message: "Invalid params" },
      });
    },
  });

  await assert.rejects(() => rpc.call("badMethod"), (error: unknown) => {
    assert.ok(error instanceof RpcError);
    assert.equal(error.code, -32602);
    return true;
  });
  assert.equal(attempt, 1);
});

test("gives up after the retry budget", async () => {
  let attempt = 0;
  const rpc = new SolanaRpc({
    endpoint: "https://example.invalid",
    maxRetries: 2,
    retryBaseMs: 1,
    retryMaxMs: 2,
    fetch: async () => {
      attempt += 1;
      throw new Error("socket hang up");
    },
  });

  await assert.rejects(() => rpc.call("getSlot"), (error: unknown) => {
    assert.ok(error instanceof RpcTransportError);
    return true;
  });
  assert.equal(attempt, 3);
});

test("normalises multiple accounts responses", async () => {
  const rpc = new SolanaRpc({
    endpoint: "https://example.invalid",
    fetch: async () =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { context: { slot: 1 }, value: null },
      }),
  });

  assert.deepEqual(await rpc.getMultipleAccounts(["abc"]), []);
});
