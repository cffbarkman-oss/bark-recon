import { ByteReader, PublicKey } from "@bark/solana";
import { DISCRIMINATORS, matchesDiscriminator } from "./programs.js";
import type { CurveState } from "./curve.js";

/**
 * On-chain account decoders.
 *
 * Two curve layouts exist in the wild:
 *
 *   v1 (49 bytes) - discriminator + five u64 + bool
 *   v2 (166 bytes) - the v1 body, then a creator pubkey and a trailing region
 *
 * v2 was observed on mainnet on 2026-11-08 and is the layout current launches
 * use. The trailing bytes are not yet mapped, so they are surfaced verbatim as
 * "trailing" and never guessed at. Anything downstream that needs more than
 * reserves should read them from events or token accounts instead.
 */

export const BONDING_CURVE_V1_LENGTH = 49;
export const BONDING_CURVE_V2_LENGTH = 166;

export type CurveLayout = "v1" | "v2";

export interface BondingCurveAccount extends CurveState {
  address: PublicKey;
  layout: CurveLayout;
  creator: PublicKey | null;
  /** Unmapped tail of the v2 layout, preserved for forward compatibility. */
  trailing: Uint8Array;
}

export class AccountDecodeError extends Error {
  public override readonly name = "AccountDecodeError";
}

/**
 * Decodes a bonding-curve account.
 *
 * Throws on a mismatched discriminator rather than returning a half-filled
 * object: silently decoding the wrong account type is how indexers end up
 * attributing one mint's reserves to another.
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
    virtualSolReserves: reader.u64(),
    realTokenReserves: reader.u64(),
    realSolReserves: reader.u64(),
    tokenTotalSupply: reader.u64(),
    complete: reader.bool(),
  };

  if (data.length < BONDING_CURVE_V1_LENGTH) {
    throw new AccountDecodeError("Bonding curve account is truncated");
  }

  if (data.length < BONDING_CURVE_V1_LENGTH + 32) {
    return {
      address: new PublicKey(address),
      layout: "v1",
      creator: null,
      trailing: new Uint8Array(0),
      ...state,
    };
  }

  const creator = new PublicKey(reader.bytes(32));
  return {
    address: new PublicKey(address),
    layout: "v2",
    creator,
    trailing: reader.rest(),
    ...state,
  };
}

/** Global configuration layout (classic Anchor order), 1088 bytes. */
export interface GlobalConfig {
  address: PublicKey;
  authority: PublicKey;
  feeRecipient: PublicKey;
  initialVirtualTokenReserves: bigint;
  initialVirtualSolReserves: bigint;
  initialRealTokenReserves: bigint;
  tokenTotalSupply: bigint;
  feeBasisPoints: number;
  bump: number;
  trailing: Uint8Array;
}

/**
 * Decodes the singleton global config account.
 *
 * Field positions follow the classic Anchor layout. Cross-checks against the
 * captured account: feeRecipient matches the recipient observed in live trade
 * events, initialVirtualSolReserves is 30 SOL and tokenTotalSupply is 1e15.
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
  reader.bool();

  const config: GlobalConfig = {
    address: new PublicKey(address),
    authority: new PublicKey(reader.bytes(32)),
    feeRecipient: new PublicKey(reader.bytes(32)),
    initialVirtualTokenReserves: reader.u64(),
    initialVirtualSolReserves: reader.u64(),
    initialRealTokenReserves: reader.u64(),
    tokenTotalSupply: reader.u64(),
    feeBasisPoints: Number(reader.u64()),
    bump: reader.u8(),
    trailing: new Uint8Array(0),
  };

  config.trailing = reader.rest();
  return config;
}
