import { ByteReader, PublicKey } from "@bark/solana";
import { DISCRIMINATORS, matchesDiscriminator } from "./programs.js";
import type { CurveState } from "./curve.js";

/**
 * On-chain account decoders.
 *
 * Both layouts are taken from the IDL and confirmed against captured bytes:
 *
 *   BondingCurve v1 - 49 bytes  (legacy: five u64 + complete)
 *   BondingCurve v2 - 166 bytes (current: adds creator, quote mint, fees, depth)
 *   Global          - 1088 bytes
 *
 * The v2 decode consumes exactly 166 bytes, which is the strongest available
 * signal that the field order is right: a single misaligned field would leave
 * a remainder or overrun.
 */

export const BONDING_CURVE_V1_LENGTH = 49;
export const BONDING_CURVE_V2_LENGTH = 166;
export const GLOBAL_LENGTH = 1088;

export type CurveLayout = "v1" | "v2";

export interface BondingCurveAccount extends CurveState {
  address: PublicKey;
  layout: CurveLayout;
  creator: PublicKey | null;
  /** Null/zeroed for SOL-quoted curves. */
  quoteMint: PublicKey | null;
  creatorFeeBps: bigint;
  canEditCreatorFee: boolean;
  isHolderReward: boolean;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
  /** Accrued creator fees, claimable through collect_creator_fee. */
  creatorFee: bigint;
  /** Accrued protocol fees. */
  protocolFees: bigint;
  depth: number;
  initialVirtualQuoteReserves: bigint;
  postCompleteBaseOut: bigint;
  postCompleteQuoteIn: bigint;
}

export class AccountDecodeError extends Error {
  public override readonly name = "AccountDecodeError";
}

const ZERO_KEY = new Uint8Array(32);

function isZeroKey(bytes: Uint8Array): boolean {
  for (const byte of bytes) {
    if (byte !== 0) {
      return false;
    }
  }
  return true;
}

/**
 * Decodes a bonding-curve account.
 *
 * Throws on a mismatched discriminator rather than returning a half-filled
 * object: decoding the wrong account type is how an indexer attributes one
 * mint's reserves to another.
 */
export function decodeBondingCurve(
  address: PublicKey | string,
  data: Uint8Array,
): BondingCurveAccount {
  if (!matchesDiscriminator(data, DISCRIMINATORS.bondingCurveAccount)) {
    throw new AccountDecodeError(
      "Not a pump.fun bonding curve account (unexpected discriminator)",
    );
  }

  const reader = new ByteReader(data);
  reader.skip(8);

  const state: CurveState = {
    virtualTokenReserves: reader.u64(),
    virtualQuoteReserves: reader.u64(),
    realTokenReserves: reader.u64(),
    realQuoteReserves: reader.u64(),
    tokenTotalSupply: reader.u64(),
    complete: reader.bool(),
  };

  if (data.length === BONDING_CURVE_V1_LENGTH) {
    return {
      address: new PublicKey(address),
      layout: "v1",
      creator: null,
      quoteMint: null,
      creatorFeeBps: 0n,
      canEditCreatorFee: false,
      isHolderReward: false,
      isMayhemMode: false,
      isCashbackCoin: false,
      creatorFee: 0n,
      protocolFees: 0n,
      depth: 0,
      initialVirtualQuoteReserves: 0n,
      postCompleteBaseOut: 0n,
      postCompleteQuoteIn: 0n,
      ...state,
    };
  }

  if (data.length < BONDING_CURVE_V2_LENGTH) {
    throw new AccountDecodeError(
      "Bonding curve account has an unexpected length: " + data.length,
    );
  }

  const creator = new PublicKey(reader.bytes(32));
  const isMayhemMode = reader.bool();
  const isCashbackCoin = reader.bool();
  const quoteMintBytes = reader.bytes(32);
  const creatorFeeBps = reader.u64();
  const canEditCreatorFee = reader.bool();
  const isHolderReward = reader.bool();
  const creatorFee = reader.u64();
  const protocolFees = reader.u64();
  const depth = reader.u8();
  const initialVirtualQuoteReserves = reader.u64();
  const postCompleteBaseOut = reader.u64();
  const postCompleteQuoteIn = reader.u64();

  if (reader.remaining !== 0) {
    throw new AccountDecodeError(
      "Bonding curve decode left " + reader.remaining + " unread byte(s)",
    );
  }

  return {
    address: new PublicKey(address),
    layout: "v2",
    creator,
    quoteMint: isZeroKey(quoteMintBytes) ? null : new PublicKey(quoteMintBytes),
    creatorFeeBps,
    canEditCreatorFee,
    isHolderReward,
    isMayhemMode,
    isCashbackCoin,
    creatorFee,
    protocolFees,
    depth,
    initialVirtualQuoteReserves,
    postCompleteBaseOut,
    postCompleteQuoteIn,
    ...state,
  };
}

/** Global configuration account, 1088 bytes, owner = PUMP_PROGRAM_ID. */
export interface GlobalConfig {
  address: PublicKey;
  authority: PublicKey;
  feeRecipient: PublicKey;
  initialVirtualTokenReserves: bigint;
  initialVirtualSolReserves: bigint;
  initialRealTokenReserves: bigint;
  tokenTotalSupply: bigint;
  feeBasisPoints: number;
  withdrawAuthority: PublicKey;
  enableMigrate: boolean;
  poolMigrationFee: bigint;
  creatorFeeBasisPoints: number;
  feeRecipients: PublicKey[];
  setCreatorAuthority: PublicKey;
  adminSetCreatorAuthority: PublicKey;
  createV2Enabled: boolean;
  whitelistPda: PublicKey;
  reservedFeeRecipient: PublicKey;
  mayhemModeEnabled: boolean;
  reservedFeeRecipients: PublicKey[];
  isCashbackEnabled: boolean;
  buybackFeeRecipients: PublicKey[];
  buybackBasisPoints: number;
  initialVirtualQuoteReserves: bigint;
  whitelistedQuoteMints: PublicKey[];
  creatorFeeConfigurable: boolean;
  maxConfigurableCreatorFeeBps: bigint;
  holderRewardClaimAuthority: PublicKey;
  isHolderRewardEnabled: boolean;
  maxCurveDepth: number;
}

function readKeys(reader: ByteReader, count: number): PublicKey[] {
  const keys: PublicKey[] = [];
  for (let i = 0; i < count; i += 1) {
    keys.push(new PublicKey(reader.bytes(32)));
  }
  return keys;
}

/**
 * Decodes the singleton global config.
 *
 * Cross-checks against the capture: feeRecipient matches the recipient seen in
 * live TradeEvents, the four launch constants match the documented parameters
 * exactly, and the decode consumes all 1088 bytes.
 */
export function decodeGlobalConfig(
  address: PublicKey | string,
  data: Uint8Array,
): GlobalConfig {
  if (!matchesDiscriminator(data, DISCRIMINATORS.globalAccount)) {
    throw new AccountDecodeError("Not the pump.fun global account");
  }

  const reader = new ByteReader(data);
  reader.skip(8);
  const initialized = reader.bool();
  if (!initialized) {
    throw new AccountDecodeError("Global account is not initialised");
  }

  const config: GlobalConfig = {
    address: new PublicKey(address),
    authority: new PublicKey(reader.bytes(32)),
    feeRecipient: new PublicKey(reader.bytes(32)),
    initialVirtualTokenReserves: reader.u64(),
    initialVirtualSolReserves: reader.u64(),
    initialRealTokenReserves: reader.u64(),
    tokenTotalSupply: reader.u64(),
    feeBasisPoints: Number(reader.u64()),
    withdrawAuthority: new PublicKey(reader.bytes(32)),
    enableMigrate: reader.bool(),
    poolMigrationFee: reader.u64(),
    creatorFeeBasisPoints: Number(reader.u64()),
    feeRecipients: readKeys(reader, 7),
    setCreatorAuthority: new PublicKey(reader.bytes(32)),
    adminSetCreatorAuthority: new PublicKey(reader.bytes(32)),
    createV2Enabled: reader.bool(),
    whitelistPda: new PublicKey(reader.bytes(32)),
    reservedFeeRecipient: new PublicKey(reader.bytes(32)),
    mayhemModeEnabled: reader.bool(),
    reservedFeeRecipients: readKeys(reader, 7),
    isCashbackEnabled: reader.bool(),
    buybackFeeRecipients: readKeys(reader, 8),
    buybackBasisPoints: Number(reader.u64()),
    initialVirtualQuoteReserves: reader.u64(),
    whitelistedQuoteMints: readKeys(reader, 1),
    creatorFeeConfigurable: reader.bool(),
    maxConfigurableCreatorFeeBps: reader.u64(),
    holderRewardClaimAuthority: new PublicKey(reader.bytes(32)),
    isHolderRewardEnabled: reader.bool(),
    maxCurveDepth: reader.u8(),
  };

  if (reader.remaining !== 0) {
    throw new AccountDecodeError(
      "Global decode left " + reader.remaining + " unread byte(s)",
    );
  }
  return config;
}
