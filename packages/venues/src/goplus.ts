import type { FetchLike } from "@bark/solana";
import { JsonHttpClient } from "./http.js";

/**
 * GoPlus token security.
 *
 * Verified open (no key) on 2026-11-08. This is the "explainable token risk"
 * signal the platform needs: each authority is reported separately, with the
 * authority address when one is set, instead of collapsing everything into a
 * single opaque score.
 *
 * The report flagged that GoPlus documents disagree on some fee units. Nothing
 * here asserts a unit: transfer fees are surfaced as the raw structure and the
 * caller decides, because a wrong unit here becomes a wrong number on a
 * trading screen.
 */

export interface AuthorityStatus {
  status: string;
  authority: string[];
}

export interface TokenSecurity {
  mint: string;
  name: string | null;
  symbol: string | null;
  totalSupply: bigint | null;
  holderCount: number | null;
  /** Mint authority present means supply can still be inflated. */
  mintable: AuthorityStatus;
  /** Freeze authority present means balances can be frozen. */
  freezable: AuthorityStatus;
  /** Account can be closed by an authority. */
  closable: AuthorityStatus;
  balanceMutable: AuthorityStatus;
  metadataMutable: AuthorityStatus;
  transferFee: Record<string, unknown>;
  transferHook: unknown[];
  /** GoPlus's own trust flag; 1 = trusted, 0 = not. */
  trusted: boolean;
  /** Raw payload for anything not yet modelled. */
  raw: Record<string, unknown>;
}

export interface SecurityFactor {
  id: string;
  label: string;
  /** 0 = benign, 1 = maximal concern. */
  severity: number;
  detail: string;
}

interface RawSecurity {
  mintable?: AuthorityStatus;
  freezable?: AuthorityStatus;
  closable?: AuthorityStatus;
  balance_mutable_authority?: AuthorityStatus;
  metadata_mutable?: AuthorityStatus;
  transfer_fee?: Record<string, unknown>;
  transfer_hook?: unknown[];
  trusted_token?: number;
  total_supply?: string | number;
  holder_count?: number | string;
  metadata?: { name?: string; symbol?: string };
}

export class GoPlusVenue {
  public readonly id = "goplus";

  private readonly client: JsonHttpClient;

  constructor(options: { baseUrl?: string; fetch?: FetchLike } = {}) {
    this.client = new JsonHttpClient({
      baseUrl: options.baseUrl ?? "https://api.gopluslabs.io",
      fetch: options.fetch,
    });
  }

  async tokenSecurity(mint: string): Promise<TokenSecurity | null> {
    const response = await this.client.get<{
      code?: number;
      result?: Record<string, RawSecurity>;
    }>("/api/v1/solana/token_security", { contract_addresses: mint });

    const record = response.result?.[mint];
    if (record === undefined) {
      return null;
    }
    return {
      mint,
      name: record.metadata?.name ?? null,
      symbol: record.metadata?.symbol ?? null,
      totalSupply: record.total_supply === undefined ? null : BigInt(Math.trunc(Number(record.total_supply))),
      holderCount:
        record.holder_count === undefined ? null : Number(record.holder_count),
      mintable: normalizeAuthority(record.mintable),
      freezable: normalizeAuthority(record.freezable),
      closable: normalizeAuthority(record.closable),
      balanceMutable: normalizeAuthority(record.balance_mutable_authority),
      metadataMutable: normalizeAuthority(record.metadata_mutable),
      transferFee: record.transfer_fee ?? {},
      transferHook: record.transfer_hook ?? [],
      trusted: record.trusted_token === 1,
      raw: record as Record<string, unknown>,
    };
  }
}

function normalizeAuthority(value: AuthorityStatus | undefined): AuthorityStatus {
  if (value === undefined) {
    return { status: "0", authority: [] };
  }
  return { status: String(value.status ?? "0"), authority: value.authority ?? [] };
}

/**
 * Converts a security record into named risk factors.
 *
 * One factor per authority, deliberately: "mint authority still live" and
 * "freeze authority still live" are different risks with different remedies,
 * and a combined score hides which one is present.
 */
export function securityFactors(security: TokenSecurity): SecurityFactor[] {
  const factors: SecurityFactor[] = [];

  const authorityFactor = (
    id: string,
    label: string,
    status: AuthorityStatus,
    severity: number,
  ): void => {
    if (status.status === "1" && status.authority.length > 0) {
      factors.push({
        id,
        label,
        severity,
        detail: label + " held by " + status.authority.join(", "),
      });
      return;
    }
    factors.push({ id, label, severity: 0, detail: label + " is revoked" });
  };

  authorityFactor("mint-authority", "Mint authority", security.mintable, 1);
  authorityFactor("freeze-authority", "Freeze authority", security.freezable, 0.9);
  authorityFactor("close-authority", "Account close authority", security.closable, 0.8);
  authorityFactor("balance-authority", "Balance mutation authority", security.balanceMutable, 0.95);

  if (Object.keys(security.transferFee).length > 0) {
    factors.push({
      id: "transfer-fee",
      label: "Transfer fee",
      severity: 0.5,
      detail: "Token applies a fee on transfers; units are provider-reported and unverified",
    });
  }
  if (security.transferHook.length > 0) {
    factors.push({
      id: "transfer-hook",
      label: "Transfer hook",
      severity: 0.7,
      detail: "Transfers execute external code",
    });
  }
  if (!security.trusted) {
    factors.push({
      id: "provider-trust",
      label: "Provider trust flag",
      severity: 0.3,
      detail: "GoPlus does not mark this token as trusted",
    });
  }

  return factors;
}
