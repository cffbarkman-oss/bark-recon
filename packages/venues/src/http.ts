import type { FetchLike } from "@bark/solana";

export interface JsonClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  headers?: Record<string, string>;
}

export class HttpError extends Error {
  public override readonly name = "HttpError";
  public readonly status: number;
  public readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQuery(query?: Record<string, string | number | boolean | undefined>): string {
  if (query === undefined) {
    return "";
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded.length > 0 ? "?" + encoded : "";
}

/**
 * Small JSON-over-HTTP client with bounded retries.
 *
 * Reads are retried on 429/5xx and network failures. Bodies are read as text
 * first so that an upstream error page surfaces in the exception instead of a
 * confusing JSON parse error.
 */
export class JsonHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly headers: Record<string, string>;

  constructor(options: JsonClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseMs = options.retryBaseMs ?? 200;
    this.headers = options.headers ?? {};
  }

  async get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>("GET", path + buildQuery(query), undefined, headers);
  }

  async post<T>(
    path: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>("POST", path, body, headers);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const url = this.baseUrl + path;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: {
            accept: "application/json",
            ...(body === undefined ? {} : { "content-type": "application/json" }),
            ...this.headers,
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });

        const text = await response.text();
        if (!response.ok) {
          const error = new HttpError(
            "HTTP " + response.status + " from " + url,
            response.status,
            text.slice(0, 500),
          );
          if (response.status === 429 || response.status >= 500) {
            lastError = error;
          } else {
            throw error;
          }
        } else {
          return text.length === 0 ? (undefined as T) : (JSON.parse(text) as T);
        }
      } catch (error) {
        if (error instanceof HttpError && error.status !== 429 && error.status < 500) {
          throw error;
        }
        lastError = error;
        if (attempt === this.maxRetries) {
          break;
        }
      } finally {
        clearTimeout(timer);
      }
      await sleep(this.retryBaseMs * 2 ** attempt);
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Request failed for " + url);
  }
}
