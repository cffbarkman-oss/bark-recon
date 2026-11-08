import type { FetchLike } from "@bark/solana";
import { JsonHttpClient } from "./http.js";

/**
 * Pyth reference prices.
 *
 * Verified open on 2026-11-08: Hermes serves feed metadata and latest parsed
 * prices without a key.
 *
 * This is a *reference* price, not an executable DEX quote. Bark should use it
 * to sanity-check the venue price and to show a second opinion, never to size a
 * trade - the two can legitimately differ, and confusing them is how a user
 * ends up with unexplained slippage.
 */

export interface PythFeed {
  /** Hex feed id, stable across chains. */
  id: string;
  description: string;
  symbol: string;
  assetType: string;
  quoteCurrency: string;
}

export interface PythPrice {
  id: string;
  /** Human price already scaled by the exponent. */
  price: number;
  confidence: number;
  exponent: number;
  /** Unix seconds when the aggregate was published. */
  publishTime: number;
  raw: { price: string; conf: string; expo: number; publish_time: number };
}

interface RawFeed {
  id?: string;
  attributes?: {
    description?: string;
    display_symbol?: string;
    asset_type?: string;
    quote_currency?: string;
  };
}

interface RawParsedPrice {
  id?: string;
  price?: { price?: string; conf?: string; expo?: number; publish_time?: number };
}

export class PythVenue {
  public readonly id = "pyth";

  private readonly client: JsonHttpClient;

  constructor(options: { baseUrl?: string; fetch?: FetchLike } = {}) {
    this.client = new JsonHttpClient({
      baseUrl: options.baseUrl ?? "https://hermes.pyth.network",
      fetch: options.fetch,
    });
  }

  /** Searches feed metadata, e.g. query "SOL". */
  async feeds(query: string, assetType = "crypto"): Promise<PythFeed[]> {
    const raw = await this.client.get<RawFeed[]>("/v2/price_feeds", {
      query,
      asset_type: assetType,
    });
    return raw.map((feed) => ({
      id: feed.id ?? "",
      description: feed.attributes?.description ?? "",
      symbol: feed.attributes?.display_symbol ?? "",
      assetType: feed.attributes?.asset_type ?? "",
      quoteCurrency: feed.attributes?.quote_currency ?? "",
    }));
  }

  /** Latest parsed prices for the given feed ids (hex, with or without 0x). */
  async latestPrices(ids: string[]): Promise<PythPrice[]> {
    if (ids.length === 0) {
      return [];
    }
    const query: Record<string, string | number | boolean | undefined> = { parsed: true };
    // Hermes accepts repeated ids[] params; JsonHttpClient flattens objects, so
    // build the query through a single joined value and let the server split it.
    const params = ids.map((id) => "ids[]=" + encodeURIComponent(id.replace(/^0x/, ""))).join("&");
    const raw = await this.client.get<{ parsed?: RawParsedPrice[] }>(
      "/v2/updates/price/latest?" + params,
      query,
    );
    return (raw.parsed ?? []).map((entry) => {
      const expo = entry.price?.expo ?? 0;
      const rawPrice = Number(entry.price?.price ?? "0");
      const rawConf = Number(entry.price?.conf ?? "0");
      const scale = 10 ** expo;
      return {
        id: entry.id ?? "",
        price: rawPrice * scale,
        confidence: rawConf * scale,
        exponent: expo,
        publishTime: entry.price?.publish_time ?? 0,
        raw: {
          price: entry.price?.price ?? "0",
          conf: entry.price?.conf ?? "0",
          expo,
          publish_time: entry.price?.publish_time ?? 0,
        },
      };
    });
  }
}

/** True when the aggregate is older than the caller's tolerance. */
export function isStale(price: PythPrice, maxAgeSeconds: number, nowSeconds = Date.now() / 1000): boolean {
  return nowSeconds - price.publishTime > maxAgeSeconds;
}
