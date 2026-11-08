import type { FetchLike } from "@bark/solana";
import { JsonHttpClient } from "./http.js";
import {
  VenueAuthRequiredError,
  type MarketSnapshot,
  type TokenIdentity,
  type VenueAdapter,
  type VenueCapabilities,
} from "./types.js";

/**
 * Birdeye market data.
 *
 * Verified behaviour on 2026-11-08: every data route answers 401
 * {"success":false,"message":"Unauthorized"} without an X-API-KEY. This is a
 * paid, key-gated provider - so the adapter is complete but refuses to
 * fabricate anything until a key is supplied.
 *
 * The report positions Birdeye as the broadest single source (token, liquidity,
 * wallet PnL, streaming). The important caveat is theirs too: the normalized
 * token price is not the price of any single pool trade.
 */

export const BIRDEYE_BASE_URL = "https://public-api.birdeye.so";

export class BirdeyeVenue implements VenueAdapter {
  public readonly id = "birdeye";
  public readonly capabilities: VenueCapabilities = {
    markets: true,
    holders: true,
    trading: false,
    requiresCredentials: true,
  };

  private readonly apiKey: string | undefined;
  private readonly client: JsonHttpClient;

  constructor(options: { apiKey?: string; baseUrl?: string; fetch?: FetchLike } = {}) {
    this.apiKey = options.apiKey;
    this.client = new JsonHttpClient({
      baseUrl: options.baseUrl ?? BIRDEYE_BASE_URL,
      fetch: options.fetch,
    });
  }

  private headers(): Record<string, string> {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      throw new VenueAuthRequiredError(
        this.id,
        "Birdeye requires an X-API-KEY; unauthenticated requests return 401 Unauthorized",
      );
    }
    return { "X-API-KEY": this.apiKey, "x-chain": "solana" };
  }

  async price(mint: string): Promise<number | null> {
    const response = await this.client.get<{ data?: { value?: number } }>(
      "/defi/price",
      { address: mint },
      this.headers(),
    );
    return response.data?.value ?? null;
  }

  async getMarket(mint: string): Promise<MarketSnapshot | null> {
    const overview = await this.client.get<{
      data?: {
        price?: number;
        mc?: number;
        fdv?: number;
        liquidity?: number;
        v24hUSD?: number;
        v24hChangePercent?: number;
      };
    }>("/defi/token_overview", { address: mint }, this.headers());

    const data = overview.data;
    if (data === undefined) {
      return null;
    }
    return {
      mint,
      priceUsd: data.price ?? null,
      marketCapUsd: data.mc ?? null,
      fdvUsd: data.fdv ?? null,
      liquidityUsd: data.liquidity ?? null,
      volume24hUsd: data.v24hUSD ?? null,
      priceChange24h: data.v24hChangePercent ?? null,
      observedAt: Date.now(),
      source: "birdeye",
    };
  }

  async search(query: string): Promise<TokenIdentity[]> {
    const response = await this.client.get<{
      data?: { items?: Array<{ address: string; symbol: string; name: string; decimals?: number }> };
    }>("/defi/v3/search", { keyword: query, target: "token", chain: "solana" }, this.headers());
    return (response.data?.items ?? []).map((item) => ({
      mint: item.address,
      symbol: item.symbol,
      name: item.name,
      decimals: item.decimals ?? 0,
    }));
  }

  async getToken(mint: string): Promise<TokenIdentity | null> {
    const overview = await this.client.get<{
      data?: { address?: string; symbol?: string; name?: string; decimals?: number };
    }>("/defi/token_overview", { address: mint }, this.headers());
    const data = overview.data;
    if (data === undefined || data.address === undefined) {
      return null;
    }
    return {
      mint: data.address,
      symbol: data.symbol ?? "",
      name: data.name ?? "",
      decimals: data.decimals ?? 0,
    };
  }
}
