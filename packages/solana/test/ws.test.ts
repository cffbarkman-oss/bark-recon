import assert from "node:assert/strict";
import { test } from "node:test";
import { LogsSubscriber, type WebSocketLike } from "../src/ws.js";

class FakeSocket implements WebSocketLike {
  public readonly sent: string[] = [];
  public closed = false;
  public onopen: ((event: unknown) => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onclose: ((event: unknown) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.({});
  }

  emit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  drop(): void {
    this.onclose?.({});
  }
}

test("subscribes to the requested accounts on open", () => {
  const socket = new FakeSocket();
  const subscriber = new LogsSubscriber(["program-a"], {
    url: "wss://example.invalid",
    socketFactory: () => socket,
  });
  subscriber.connect();
  socket.open();

  assert.equal(socket.sent.length, 1);
  const frame = JSON.parse(socket.sent[0] as string) as {
    method: string;
    params: [{ mentions: string[] }, { commitment: string }];
  };
  assert.equal(frame.method, "logsSubscribe");
  assert.deepEqual(frame.params[0].mentions, ["program-a"]);
});

test("emits notifications with signature, logs, error and slot", () => {
  const socket = new FakeSocket();
  const seen: Array<{ signature: string; slot: number | null; count: number }> = [];
  const subscriber = new LogsSubscriber(["program-a"], {
    url: "wss://example.invalid",
    socketFactory: () => socket,
    onLogs: (notification) => {
      seen.push({
        signature: notification.signature,
        slot: notification.slot,
        count: notification.logs.length,
      });
    },
  });
  subscriber.connect();
  socket.open();
  socket.emit({ id: 1, result: 42 });
  assert.equal(subscriber.isSubscribed, true);

  socket.emit({
    jsonrpc: "2.0",
    method: "logsNotification",
    params: {
      result: {
        context: { slot: 466_959_237 },
        value: { signature: "sig-1", logs: ["a", "b"], err: null },
      },
    },
  });

  assert.deepEqual(seen, [{ signature: "sig-1", slot: 466_959_237, count: 2 }]);
});

test("surfaces subscription errors instead of hanging", () => {
  const socket = new FakeSocket();
  const errors: string[] = [];
  const subscriber = new LogsSubscriber(["program-a"], {
    url: "wss://example.invalid",
    socketFactory: () => socket,
    onError: (error) => errors.push(error.message),
  });
  subscriber.connect();
  socket.open();
  socket.emit({ id: 1, error: { message: "too many subscriptions" } });

  assert.deepEqual(errors, ["too many subscriptions"]);
  assert.equal(subscriber.isSubscribed, false);
});

test("unsubscribes before closing", () => {
  const socket = new FakeSocket();
  const subscriber = new LogsSubscriber(["program-a"], {
    url: "wss://example.invalid",
    socketFactory: () => socket,
  });
  subscriber.connect();
  socket.open();
  socket.emit({ id: 1, result: 7 });
  subscriber.close();

  const frames = socket.sent.map((frame) => JSON.parse(frame) as { method: string; params?: unknown[] });
  assert.equal(frames[0]?.method, "logsSubscribe");
  assert.equal(frames[1]?.method, "logsUnsubscribe");
  assert.deepEqual(frames[1]?.params, [7]);
  assert.equal(socket.closed, true);
});

test("rejects an empty mention list", () => {
  assert.throws(
    () => new LogsSubscriber([], { url: "wss://example.invalid", socketFactory: () => new FakeSocket() }),
    /at least one account/,
  );
});
