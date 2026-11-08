import { PublicKey } from "@bark/solana";

/**
 * pump.fun program constants.
 *
 * Every identifier below was read from mainnet on 2026-11-08 unless the
 * accompanying note says otherwise. Confidence is tracked explicitly because
 * this surface changes: the "classic" bonding-curve program is now invoked
 * through a router, and the account/event layouts gained trailing fields.
 */

/** The original bonding-curve program. Still the owner of curve accounts. */
export const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

/** Fee program invoked as a CPI for every trade. Observed, not documented. */
export const PUMP_FEE_PROGRAM_ID = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

/** Router used by the current frontend; CPIs into PUMP_PROGRAM_ID. */
export const PUMP_ROUTER_PROGRAM_ID = new PublicKey("m9obQHAPyZeZ88w7XUY8Te6a8rBmhXsfKco7u8G8tnB");

/** Token-2022: current launches mint with it. Legacy launches used SPL Token. */
export const PUMP_TOKEN_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

/** Singleton configuration account, owner = PUMP_PROGRAM_ID, 1088 bytes. */
export const PUMP_GLOBAL_ACCOUNT = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");

/** Anchor event authority used by emit_cpi instructions. */
export const PUMP_EVENT_AUTHORITY = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

export const PUMP_FEE_RECIPIENT = new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");

/** Seeds used to derive a bonding-curve account (classic layout). */
export const BONDING_CURVE_SEED = "bonding-curve";

/**
 * Anchor discriminators (first 8 bytes of instruction data / account data).
 *
 * "mainnet" means re-derived from a live transaction in this repository's
 * evidence capture. "docs" means taken from the public Anchor surface and not
 * re-verified here.
 */
export const DISCRIMINATORS = {
  /** mainnet: sell instruction data began with this prefix. */
  sell: "33e685a4017f83ad",
  /** mainnet: account data of the 166-byte curve account. */
  bondingCurveAccount: "17b7f83760d8ac60",
  /** mainnet: account data of the 1088-byte global account. */
  globalAccount: "a7e8e8b1c86c727f",
  /** mainnet: TradeEvent payload emitted through both log and emit_cpi. */
  tradeEvent: "bddb7fd34ee661ee",
  /** mainnet: emit_cpi envelope discriminator (payload follows inline). */
  eventCpi: "e445a52e51cb9a1d",
  /** mainnet: 208-byte fee-config account. */
  feeConfigAccount: "99a64790b3bd89fb",
  /** mainnet: 4097-byte fee-sharing account. */
  feeSharingAccount: "8f3492bbdb7b4c9b",
  /** docs: buy instruction. */
  buy: "66063d1201daebea",
  /** docs: create instruction. */
  create: "181ec828051c0777",
  /** docs: CreateEvent payload. */
  createEvent: "1b72a94dde39e75c",
} as const;

export type DiscriminatorName = keyof typeof DISCRIMINATORS;

export function hexToDiscriminator(hex: string): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function matchesDiscriminator(data: Uint8Array, hex: string): boolean {
  if (data.length < 8) {
    return false;
  }
  for (let i = 0; i < 8; i += 1) {
    if (data[i] !== Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)) {
      return false;
    }
  }
  return true;
}

/** Instruction names as they appear in "Program log: Instruction: <Name>". */
export const PROGRAM_LOGS = {
  create: "Instruction: Create",
  buy: "Instruction: Buy",
  sell: "Instruction: Sell",
  routerBuy: "Instruction: PumpBondingCurveBuy",
  routerSell: "Instruction: PumpBondingCurveSell",
} as const;

export type PumpAction = "create" | "buy" | "sell";
