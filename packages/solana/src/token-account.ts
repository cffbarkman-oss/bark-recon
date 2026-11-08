import { PublicKey } from "./public-key.js";

/**
 * SPL / Token-2022 token account decoding.
 *
 * Only the fixed header is read: 165 bytes for a legacy SPL token account, and
 * Token-2022 accounts are the same prefix followed by extensions. That is
 * enough for balances, which is what a pool quoter needs.
 *
 * Layout: mint(32) owner(32) amount(u64) delegate(36) state(1) is_native(12)
 * delegated_amount(8) close_authority(36).
 */

export const TOKEN_ACCOUNT_MIN_LENGTH = 165;
const AMOUNT_OFFSET = 64;

export interface TokenAccountInfo {
  address: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  /** Base units held. */
  amount: bigint;
}

export class TokenAccountDecodeError extends Error {
  public override readonly name = "TokenAccountDecodeError";
}

export function decodeTokenAccount(address: PublicKey | string, data: Uint8Array): TokenAccountInfo {
  if (data.length < TOKEN_ACCOUNT_MIN_LENGTH) {
    throw new TokenAccountDecodeError(
      "Token account is too short: " + data.length + " bytes",
    );
  }
  let amount = 0n;
  for (let i = 7; i >= 0; i -= 1) {
    amount = (amount << 8n) | BigInt(data[AMOUNT_OFFSET + i] as number);
  }
  return {
    address: new PublicKey(address),
    mint: new PublicKey(data.subarray(0, 32)),
    owner: new PublicKey(data.subarray(32, 64)),
    amount,
  };
}
