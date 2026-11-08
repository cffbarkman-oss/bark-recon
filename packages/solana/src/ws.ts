/**
 * Minimal Solana websocket client.
 *
 * Only one method is implemented - logsSubscribe - because that is the one the
 * product needs: it is how you see a launch the moment it happens instead of
 * polling getSignaturesForAddress and discovering it a block late.
 *
 * Verified against wss://api.mainnet-beta.solana.com: a subscription on the
 * pump.fun program delivered ~340 notifications in 100 seconds and surfaced a
 * live token creation, which is now a committed fixture.
 *
 * Public endpoints accept exactly one mention address per subscription and
 * reject anything else with "Only 1 address supported". Watching two programs
 * means two subscriptions; the client is built to be instantiated per address.
 */

export interface LogsNotification {
  signature: string;
  /** Raw program log lines, in order. */
  logs: string[];
  /** Null when the transaction succeeded. */
  err: unknown;
  /** Slot the notification was observed at, when the node reports it. */
  slot: number | null;
}

export interface LogsSubscriberOptions {
  url: string;
  /** Injected for tests; defaults to the global WebSocket. */
  socketFactory?: (url: string) => WebSocketLike;
  /** Reconnect backoff base in ms. Default 500. */
  reconnectBaseMs?: number;
  /** Reconnect backoff ceiling in ms. Default 30_000. */
  reconnectMaxMs?: number;
  onLogs?: (notification: LogsNotification) => void;
  onError?: (error: Error) => void;
  onReconnect?: (attempt: number) => void;
}

/** The subset of the WebSocket API this client relies on. */
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
}

interface SubscriptionConfirmation {
  id?: number;
  result?: number;
  error?: { message?: string };
}

/**
 * Subscribes to logs mentioning one or more accounts and re-emits them.
 *
 * Reconnection is deliberate: public websockets drop connections regularly, and
 * a discovery feed that silently stops receiving is worse than one that
 * reports the drop. onReconnect fires with the attempt number so the caller can
 * decide whether to resubscribe or alert.
 */
export class LogsSubscriber {
  private readonly options: LogsSubscriberOptions;
  private socket: WebSocketLike | null = null;
  private nextId = 1;
  private subscriptionId: number | null = null;
  private closed = false;
  private readonly mentions: string[];

  constructor(mentions: string[], options: LogsSubscriberOptions) {
    if (mentions.length === 0) {
      throw new Error("LogsSubscriber requires at least one account to mention");
    }
    this.mentions = mentions;
    this.options = options;
  }

  get isSubscribed(): boolean {
    return this.subscriptionId !== null;
  }

  connect(): void {
    this.closed = false;
    this.open(0);
  }

  private open(attempt: number): void {
    if (this.closed) {
      return;
    }
    const factory =
      this.options.socketFactory ??
      ((url: string) => new WebSocket(url) as unknown as WebSocketLike);

    const socket = factory(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      this.subscribe();
    };

    socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    socket.onerror = () => {
      this.options.onError?.(new Error("websocket error from " + this.options.url));
    };

    socket.onclose = () => {
      if (this.closed) {
        return;
      }
      this.subscriptionId = null;
      this.scheduleReconnect(attempt + 1);
    };
  }

  private scheduleReconnect(attempt: number): void {
    const base = this.options.reconnectBaseMs ?? 500;
    const max = this.options.reconnectMaxMs ?? 30_000;
    const delay = Math.min(base * 2 ** (attempt - 1), max);
    this.options.onReconnect?.(attempt);
    setTimeout(() => this.open(attempt), delay);
  }

  private subscribe(): void {
    const id = this.nextId;
    this.nextId += 1;
    this.socket?.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "logsSubscribe",
        params: [{ mentions: this.mentions }, { commitment: "confirmed" }],
      }),
    );
  }

  private handleMessage(raw: unknown): void {
    let message: {
      id?: number;
      result?: number;
      error?: { message?: string };
      method?: string;
      params?: { result?: { context?: { slot?: number }; value?: { signature?: string; logs?: string[]; err?: unknown } } };
    };
    try {
      message = JSON.parse(typeof raw === "string" ? raw : String(raw)) as typeof message;
    } catch {
      this.options.onError?.(new Error("malformed websocket frame"));
      return;
    }

    const confirmation = message as SubscriptionConfirmation;
    if (confirmation.id !== undefined && confirmation.result !== undefined) {
      this.subscriptionId = confirmation.result;
      return;
    }
    if (confirmation.error !== undefined) {
      this.options.onError?.(new Error(confirmation.error.message ?? "subscription failed"));
      return;
    }

    const value = message.params?.result?.value;
    if (value === undefined || value.signature === undefined) {
      return;
    }
    this.options.onLogs?.({
      signature: value.signature,
      logs: value.logs ?? [],
      err: value.err ?? null,
      slot: message.params?.result?.context?.slot ?? null,
    });
  }

  unsubscribe(): void {
    if (this.subscriptionId !== null && this.socket !== null) {
      this.socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: this.nextId,
          method: "logsUnsubscribe",
          params: [this.subscriptionId],
        }),
      );
      this.nextId += 1;
    }
    this.subscriptionId = null;
  }

  close(): void {
    this.closed = true;
    this.unsubscribe();
    this.socket?.close();
    this.socket = null;
  }
}
