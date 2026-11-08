import type { FetchLike } from "@bark/solana";
import { JsonHttpClient } from "./http.js";

/**
 * Jupiter routing.
 *
 * Verified against lite-api.jup.ag on 2026-11-08: a 1 SOL -> BONK quote came
 * back with three hops (Kipseli, JupLend AMM, Scorch) routed through USDC and
 * USDT. That is the point of this client: Bark does not have to build its own
 * router to show a credible route, and it can show the user *why* a price is
 * what it is instead of a single opaque number.
 *
 * No API key required for quoting. Execution (swap) is a separate concern and
 * needs a signer, which this package deliberately does not touch.
 */

export interface JupiterRouteStep {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: bigint;
  outAmount: bigint;
  /** Percentage of the order this hop carries. */
  percent: number;
  updateContextSlot: number | null;
}

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: bigint;
  outAmount: bigint;
  /** Worst-case output after slippage, as computed by Jupiter. */
  otherAmountThreshold: bigint;
  swapMode: string;
  slippageBps: number;
  /** Fraction, as returned by the API (0.0012 = 0.12%). */
  priceImpactPct: number;
  /** USD value of the trade when the API can price it. */
  swapUsdValue: number | null;
  routePlan: JupiterRouteStep[];
  contextSlot: number | null;
  timeTaken: number | null;
}

export interface QuoteRequest {
  inputMint: string;
  outputMint: string;
  /** Input amount in the input mint's base units. */
  amount: bigint;
  slippageBps?: number;
  swapMode?: "ExactIn" | "ExactOut";
  restrictIntermediateTokens?: boolean;
}

interface RawRouteStep {
  swapInfo?: {
    ammKey?: string;
    label?: string;
    inputMint?: string;
    outputMint?: string;
    inAmount?: string;
    outAmount?: string;
    updateContextSlot?: string;
  };
  percent?: number;
}

interface RawQuote {
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  otherAmountThreshold?: string;
  swapMode?: string;
  slippageBps?: number;
  priceImpactPct?: string;
  swapUsdValue?: string;
  routePlan?: RawRouteStep[];
  contextSlot?: number;
  timeTaken?: number;
}

const WRAPPED_SOL = "So11111111111111111111111111111111111111112";

/**
 * Jupiter quote client.
 *
 * Routes are parsed into typed steps so the UI can render "SOL -> USDC -> BONK
 * via Kipseli, Scorch" rather than a black box.
 */
export class JupiterSwapVenue {
  public readonly id = "jupiter-swap";

  private readonly client: JsonHttpClient;

  constructor(options: { baseUrl?: string; fetch?: FetchLike } = {}) {
    this.client = new JsonHttpClient({
      baseUrl: options.baseUrl ?? "https://lite-api.jup.ag",
      fetch: options.fetch,
    });
  }

  async quote(request: QuoteRequest): Promise<JupiterQuote> {
    const raw = await this.client.get<RawQuote>("/swap/v1/quote", {
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amount.toString(),
      slippageBps: request.slippageBps ?? 50,
      swapMode: request.swapMode ?? "ExactIn",
      restrictIntermediateTokens: request.restrictIntermediateTokens ?? false,
    });
    return parseQuote(raw);
  }

  /** Convenience for SOL-denominated quotes, which is most of Bark's traffic. */
  async quoteSolFor(
    outputMint: string,
    lamports: bigint,
    slippageBps = 50,
  ): Promise<JupiterQuote> {
    return this.quote({
      inputMint: WRAPPED_SOL,
      outputMint,
      amount: lamports,
      slippageBps,
    });
  }
}

export function parseQuote(raw: RawQuote): JupiterQuote {
  const routePlan: JupiterRouteStep[] = (raw.routePlan ?? []).map((step) => ({
    ammKey: step.swapInfo?.ammKey ?? "",
    label: step.swapInfo?.label ?? "unknown",
    inputMint: step.swapInfo?.inputMint ?? "",
    outputMint: step.swapInfo?.outputMint ?? "",
    inAmount: BigInt(step.swapInfo?.inAmount ?? "0"),
    outAmount: BigInt(step.swapInfo?.outAmount ?? "0"),
    percent: step.percent ?? 0,
    updateContextSlot:
      step.swapInfo?.updateContextSlot === undefined
        ? null
        : Number(step.swapInfo.updateContextSlot),
  }));

  return {
    inputMint: raw.inputMint ?? "",
    outputMint: raw.outputMint ?? "",
    inAmount: BigInt(raw.inAmount ?? "0"),
    outAmount: BigInt(raw.outAmount ?? "0"),
    otherAmountThreshold: BigInt(raw.otherAmountThreshold ?? "0"),
    swapMode: raw.swapMode ?? "ExactIn",
    slippageBps: raw.slippageBps ?? 0,
    priceImpactPct: Number(raw.priceImpactPct ?? "0"),
    swapUsdValue:
      raw.swapUsdValue === undefined ? null : Number(raw.swapUsdValue),
    routePlan,
    contextSlot: raw.contextSlot ?? null,
    timeTaken: raw.timeTaken ?? null,
  };
}

/** Human summary of a route: "SOL -> USDC -> BONK (Kipseli, JupLend AMM, Scorch)". */
export function describeRoute(quote: JupiterQuote): string {
  if (quote.routePlan.length === 0) {
    return "no route";
  }
  const mints = [quote.routePlan[0]?.inputMint ?? quote.inputMint];
  for (const step of quote.routePlan) {
    mints.push(step.outputMint);
  }
  const labels = quote.routePlan.map((step) => step.label).join(", ");
  return mints.join(" -> ") + " (" + labels + ")";
}
