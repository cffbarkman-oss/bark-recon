import type {
  RpcAccountInfo,
  RpcBlockhash,
  RpcSignatureInfo,
  RpcTransaction,
  RpcValueResponse,
} from "./types.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SolanaRpcOptions {
  endpoint: string;
  /** Injectable for tests and for hosts that provide their own fetch. */
  fetch?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  /** Soft client-side ceiling. Set to 0 to disable throttling. */
  requestsPerSecond?: number;
  headers?: Record<string, string>;
}

export class RpcError extends Error {
  public override readonly name = "RpcError";
  public readonly code: number;
  public readonly data?: unknown;

  constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

export class RpcTransportError extends Error {
  public override readonly name = "RpcTransportError";
  public readonly status: number;
  public readonly retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_RETRY_MAX_MS = 8_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (header === null) {
    return null;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : null;
}

/**
 * JSON-RPC client tuned for the failure modes public Solana endpoints actually
 * exhibit: 429 bursts, transient 5xx, dropped sockets and -32005 style
 * "node is behind" responses.
 *
 * Every call is retried with full jitter; the client never retries a request
 * that may have mutated state, which is safe here because every method used by
 * this repository is read-only.
 */
export class SolanaRpc {
  public readonly endpoint: string;

  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly requestsPerSecond: number;
  private readonly headers: Record<string, string>;

  private nextId = 1;
  private readonly recentRequests: number[] = [];

  constructor(options: SolanaRpcOptions) {
    if (!options.endpoint) {
      throw new Error("SolanaRpc requires an endpoint");
    }
    this.endpoint = options.endpoint;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.retryMaxMs = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS;
    this.requestsPerSecond = options.requestsPerSecond ?? 0;
    this.headers = options.headers ?? {};
  }

  private async throttle(): Promise<void> {
    if (this.requestsPerSecond <= 0) {
      return;
    }
    const windowMs = 1_000;
    const now = Date.now();
    while (this.recentRequests.length > 0 && now - (this.recentRequests[0] as number) > windowMs) {
      this.recentRequests.shift();
    }
    if (this.recentRequests.length >= this.requestsPerSecond) {
      const oldest = this.recentRequests[0] as number;
      await sleep(Math.max(0, windowMs - (now - oldest)));
      return this.throttle();
    }
    this.recentRequests.push(now);
  }

  private backoff(attempt: number, retryAfterMs: number | null): number {
    if (retryAfterMs !== null) {
      return Math.min(retryAfterMs, this.retryMaxMs);
    }
    const exponential = Math.min(this.retryBaseMs * 2 ** attempt, this.retryMaxMs);
    return Math.floor(exponential * (0.5 + Math.random() * 0.5));
  }

  /** Performs a single JSON-RPC call with retries. */
  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.throttle();
      try {
        return await this.callOnce<T>(method, params);
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof RpcTransportError ||
          (error instanceof RpcError && (error.code === 429 || error.code === -32005));
        if (!retryable || attempt === this.maxRetries) {
          throw error;
        }
        const retryAfter =
          error instanceof RpcTransportError ? error.retryAfterMs : null;
        await sleep(this.backoff(attempt, retryAfter));
      }
    }

    throw lastError instanceof Error ? lastError : new RpcError("RPC call failed", -1);
  }

  private async callOnce<T>(method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const id = this.nextId;

    try {
      this.nextId += 1;
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new RpcTransportError(
          "HTTP " + response.status + " from " + this.endpoint,
          response.status,
          parseRetryAfter(response),
        );
      }

      const payload = (await response.json()) as {
        result?: T;
        error?: { code?: number; message?: string; data?: unknown };
      };

      if (payload.error !== undefined) {
        throw new RpcError(
          payload.error.message ?? "RPC error",
          payload.error.code ?? -1,
          payload.error.data,
        );
      }

      return payload.result as T;
    } catch (error) {
      if (error instanceof RpcTransportError || error instanceof RpcError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new RpcTransportError("Timed out after " + this.timeoutMs + "ms", 0, null);
      }
      throw new RpcTransportError(
        "Transport failure: " + (error instanceof Error ? error.message : String(error)),
        0,
        null,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async getSlot(): Promise<number> {
    return this.call<number>("getSlot", [{ commitment: "confirmed" }]);
  }

  async getAccountInfo(address: string): Promise<RpcAccountInfo | null> {
    const response = await this.call<RpcValueResponse<RpcAccountInfo | null>>(
      "getAccountInfo",
      [address, { encoding: "base64", commitment: "confirmed" }],
    );
    return response.value;
  }

  async getMultipleAccounts(addresses: string[]): Promise<Array<RpcAccountInfo | null>> {
    if (addresses.length === 0) {
      return [];
    }
    const response = await this.call<RpcValueResponse<Array<RpcAccountInfo | null>>>(
      "getMultipleAccounts",
      [addresses, { encoding: "base64", commitment: "confirmed" }],
    );
    return response.value ?? [];
  }

  async getTransaction(signature: string): Promise<RpcTransaction | null> {
    return this.call<RpcTransaction | null>("getTransaction", [
      signature,
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ]);
  }

  async getSignaturesForAddress(
    address: string,
    options: { limit?: number; before?: string; until?: string } = {},
  ): Promise<RpcSignatureInfo[]> {
    const params: Record<string, unknown> = { limit: options.limit ?? 100 };
    if (options.before !== undefined) {
      params.before = options.before;
    }
    if (options.until !== undefined) {
      params.until = options.until;
    }
    return this.call<RpcSignatureInfo[]>("getSignaturesForAddress", [address, params]);
  }

  async getLatestBlockhash(): Promise<RpcBlockhash> {
    const response = await this.call<RpcValueResponse<RpcBlockhash>>("getLatestBlockhash", [
      { commitment: "confirmed" },
    ]);
    return response.value;
  }
}
