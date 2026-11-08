import type { FetchLike } from "@bark/solana";
import { JsonHttpClient, HttpError } from "./http.js";
import {
  VenueAuthRequiredError,
  type MarketSnapshot,
  type TokenIdentity,
  type VenueAdapter,
  type VenueCapabilities,
} from "./types.js";

/**
 * pump.fun hosted API.
 *
 * Recon result (2026-11-08): the frontend talks to a Cloudflare-fronted host
 * whose responses are gated. Unauthenticated requests from this environment
 * received HTTP 403 with a managed challenge; the RPC endpoints behind the
 * UI are therefore NOT publicly integrable as-is.
 *
 * This adapter is deliberately a thin, honest shell: it exists so that the
 * rest of Bark can code against the venue interface today, and it refuses to
 * fabricate data until credentials are supplied.
 */

export const PUMP_FUN_API_HOST = "https://frontend-api.pump.fun";

export interface PumpFunVenueOptions {
  /** Partner key or session token issued by pump.fun. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export const PUMP_FUN_ENDPOINTS = {
  /** observed in the wild, gated by Cloudflare. */
  trending: { path: "/coins/trending", status: "gated" },
  /** observed in the wild, gated by Cloudflare. */
  token: { path: "/coins/{mint}", status: "gated" },
} as const;

export class PumpFunVenue implements VenueAdapter {
  public readonly id = "pumpfun-frontend";
  public readonly capabilities: VenueCapabilities = {
    markets: true,
    holders: false,
    trading: false,
    requiresCredentials: true,
  };

  private readonly apiKey: string | undefined;
  private readonly client: JsonHttpClient;

  constructor(options: PumpFunVenueOptions = {}) {
    this.apiKey = options.apiKey;
    this.client = new JsonHttpClient({
      baseUrl: options.baseUrl ?? PUMP_FUN_API_HOST,
      fetch: options.fetch,
    });
  }

  private requireKey(): string {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      throw new VenueAuthRequiredError(
        this.id,
        "pump.fun hosted API answers with a Cloudflare challenge without credentials",
      );
    }
    return this.apiKey;
  }

  async search(query: string, limit = 20): Promise<TokenIdentity[]> {
    const response = await this.getJson<{ coins?: unknown[] }>("/coins/search", {
      search: query,
      limit,
    });
    const coins = Array.isArray(response.coins) ? response.coins : [];
    return coins.slice(0, limit).map((coin) => toIdentity(coin));
  }

  async getToken(mint: string): Promise<TokenIdentity | null> {
    try {
      const coin = await this.getJson<unknown>("/coins/" + mint);
      return coin === null ? null : toIdentity(coin);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async getMarket(mint: string): Promise<MarketSnapshot | null> {
    const coin = await this.getJson<Record<string, unknown>>("/coins/" + mint);
    if (coin === null) {
      return null;
    }
    return {
      mint,
      priceUsd: numberOrNull(coin.usd_market_cap !== undefined ? coin.price : undefined),
      marketCapUsd: numberOrNull(coin.usd_market_cap),
      fdvUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      priceChange24h: null,
      observedAt: Date.now(),
      source: "pumpfun-frontend",
    };
  }

  private async getJson<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const key = this.requireKey();
    return this.client.get<T>(path, query, { authorization: "Bearer " + key });
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toIdentity(coin: unknown): TokenIdentity {
  const record = (coin ?? {}) as Record<string, unknown>;
  const mint = typeof record.mint === "string" ? record.mint : "";
  return {
    mint,
    symbol: typeof record.symbol === "string" ? record.symbol : "",
    name: typeof record.name === "string" ? record.name : "",
    decimals: typeof record.decimals === "number" ? record.decimals : 6,
    ...(typeof record.image_uri === "string" ? { logoUri: record.image_uri } : {}),
  };
}
