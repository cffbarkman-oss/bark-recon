import type { FetchLike } from "@bark/solana";
import { JsonHttpClient } from "./http.js";

/**
 * Jupiter Swap V2: order, sign, execute.
 *
 * Verified against api.jup.ag on 2026-11-08, no key required for the order
 * step. An order returns a base64 transaction that is already built and only
 * needs the taker's signature - which is why this module stops at execute()
 * taking a signed string. Nothing here holds a key.
 *
 * The order payload carries the three things a trading UI has to show but
 * usually hides: the fee breakdown, the price impact, and the expiry bound
 * (lastValidBlockHeight). A quote that has expired is the most common cause of
 * a "failed" trade that was never really attempted.
 */

export interface JupiterV2RouteStep {
  percent: number;
  bps: number | null;
  usdValue: number | null;
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: bigint;
  outAmount: bigint;
}

export interface JupiterV2Order {
  /** "aggregator" or "ultra" - Jupiter's routing mode. */
  swapType: string;
  mode: string;
  router: string;
  inputMint: string;
  outputMint: string;
  inAmount: bigint;
  outAmount: bigint;
  /** Worst acceptable output after slippage. */
  otherAmountThreshold: bigint;
  swapMode: string;
  slippageBps: number;
  /** Fraction (negative means the price moved against the taker). */
  priceImpact: number;
  inUsdValue: number | null;
  outUsdValue: number | null;
  routePlan: JupiterV2RouteStep[];
  /** Platform fee actually charged, in basis points and in the fee mint. */
  feeBps: number;
  feeMint: string | null;
  signatureFeeLamports: bigint;
  prioritizationFeeLamports: bigint;
  rentFeeLamports: bigint;
  /** Total the taker must be able to cover: swap + all lamport costs. */
  totalLamportCost: bigint;
  /** Unsigned, base64-encoded transaction ready for the taker to sign. */
  transaction: string;
  transactionVersion: number;
  /** Expiry: the order is invalid after this block height. */
  lastValidBlockHeight: bigint;
  requestId: string;
}

export interface JupiterV2OrderRequest {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  taker: string;
  slippageBps?: number;
  swapMode?: "ExactIn" | "ExactOut";
  /** Referral / platform fee account when Bark charges one. */
  referralAccount?: string;
  referralFee?: number;
}

export interface JupiterV2ExecuteResult {
  status: string;
  signature: string | null;
  code: number | null;
  error: string | null;
}

interface RawStep {
  percent?: number;
  bps?: number | null;
  usdValue?: number | null;
  swapInfo?: {
    ammKey?: string;
    label?: string;
    inputMint?: string;
    outputMint?: string;
    inAmount?: string;
    outAmount?: string;
  };
}

interface RawOrder {
  swapType?: string;
  mode?: string;
  router?: string;
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  otherAmountThreshold?: string;
  swapMode?: string;
  slippageBps?: number;
  priceImpact?: number;
  priceImpactPct?: string;
  inUsdValue?: number;
  outUsdValue?: number;
  routePlan?: readonly RawStep[];
  feeBps?: number;
  feeMint?: string;
  signatureFeeLamports?: number;
  prioritizationFeeLamports?: number;
  rentFeeLamports?: number;
  transaction?: string;
  transactionVersion?: number;
  /** Jupiter returns this as a string; accept both and normalise to bigint. */
  lastValidBlockHeight?: number | string;
  requestId?: string;
}

export class JupiterSwapV2Venue {
  public readonly id = "jupiter-swap-v2";

  private readonly client: JsonHttpClient;

  constructor(options: { baseUrl?: string; fetch?: FetchLike } = {}) {
    this.client = new JsonHttpClient({
      baseUrl: options.baseUrl ?? "https://api.jup.ag",
      fetch: options.fetch,
    });
  }

  /** Requests a firm order. No credentials required. */
  async order(request: JupiterV2OrderRequest): Promise<JupiterV2Order> {
    const query: Record<string, string | number | boolean | undefined> = {
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amount.toString(),
      taker: request.taker,
      slippageBps: request.slippageBps ?? 50,
      swapMode: request.swapMode ?? "ExactIn",
    };
    if (request.referralAccount !== undefined) {
      query.referralAccount = request.referralAccount;
    }
    if (request.referralFee !== undefined) {
      query.referralFee = request.referralFee;
    }
    const raw = await this.client.get<RawOrder>("/swap/v2/order", query);
    return parseOrder(raw);
  }

  /**
   * Submits a signed transaction.
   *
   * The signature must come from the taker's wallet; this library never holds
   * a key. Execution status is advisory - reconcile against chain state before
   * telling a user their trade settled.
   */
  async execute(signedTransaction: string, requestId?: string): Promise<JupiterV2ExecuteResult> {
    const raw = await this.client.post<{
      status?: string;
      signature?: string;
      code?: number;
      error?: string;
    }>("/swap/v2/execute", {
      signedTransaction,
      ...(requestId === undefined ? {} : { requestId }),
    });
    return {
      status: raw.status ?? "unknown",
      signature: raw.signature ?? null,
      code: raw.code ?? null,
      error: raw.error ?? null,
    };
  }
}

export function parseOrder(raw: RawOrder): JupiterV2Order {
  const routePlan: JupiterV2RouteStep[] = (raw.routePlan ?? []).map((step) => ({
    percent: step.percent ?? 0,
    bps: step.bps ?? null,
    usdValue: step.usdValue ?? null,
    ammKey: step.swapInfo?.ammKey ?? "",
    label: step.swapInfo?.label ?? "unknown",
    inputMint: step.swapInfo?.inputMint ?? "",
    outputMint: step.swapInfo?.outputMint ?? "",
    inAmount: BigInt(step.swapInfo?.inAmount ?? "0"),
    outAmount: BigInt(step.swapInfo?.outAmount ?? "0"),
  }));

  const signatureFee = BigInt(raw.signatureFeeLamports ?? 0);
  const prioritizationFee = BigInt(raw.prioritizationFeeLamports ?? 0);
  const rentFee = BigInt(raw.rentFeeLamports ?? 0);

  return {
    swapType: raw.swapType ?? "unknown",
    mode: raw.mode ?? "unknown",
    router: raw.router ?? "unknown",
    inputMint: raw.inputMint ?? "",
    outputMint: raw.outputMint ?? "",
    inAmount: BigInt(raw.inAmount ?? "0"),
    outAmount: BigInt(raw.outAmount ?? "0"),
    otherAmountThreshold: BigInt(raw.otherAmountThreshold ?? "0"),
    swapMode: raw.swapMode ?? "ExactIn",
    slippageBps: raw.slippageBps ?? 0,
    priceImpact: raw.priceImpact ?? Number(raw.priceImpactPct ?? "0"),
    inUsdValue: raw.inUsdValue ?? null,
    outUsdValue: raw.outUsdValue ?? null,
    routePlan,
    feeBps: raw.feeBps ?? 0,
    feeMint: raw.feeMint ?? null,
    signatureFeeLamports: signatureFee,
    prioritizationFeeLamports: prioritizationFee,
    rentFeeLamports: rentFee,
    totalLamportCost: signatureFee + prioritizationFee + rentFee,
    transaction: raw.transaction ?? "",
    transactionVersion: raw.transactionVersion ?? 0,
    lastValidBlockHeight: BigInt(raw.lastValidBlockHeight ?? 0),
    requestId: raw.requestId ?? "",
  };
}

/** True when the order can no longer land at the given block height. */
export function isExpired(order: JupiterV2Order, currentBlockHeight: bigint): boolean {
  return order.lastValidBlockHeight > 0n && currentBlockHeight > order.lastValidBlockHeight;
}
