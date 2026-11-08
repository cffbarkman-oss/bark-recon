import type { Pool, PoolReserves } from "@bark/pumpswap";
import { decodePool, quoteBuy, quoteSell, spotPrice, DEFAULT_AMM_FEES } from "@bark/pumpswap";
import { formatPercent, formatSol, formatTokens, shortKey } from "./format.js";

/**
 * Renders a PumpSwap pool with live quotes.
 *
 * Reserves come from the pool's two token accounts; the virtual offset comes
 * from the pool account itself. All three are required: pricing without the
 * virtual reserve misstates depth by more than half on some pools.
 */
export function renderPool(
  pool: Pool,
  reserves: PoolReserves,
  balances: { baseDecimals: number; quoteDecimals: number },
): string {
  const lines: string[] = [];
  const price = spotPrice(reserves);

  lines.push("pool       " + pool.address.toBase58());
  lines.push("base mint  " + pool.baseMint.toBase58());
  lines.push("quote mint " + pool.quoteMint.toBase58());
  lines.push("creator    " + shortKey(pool.creator.toBase58(), 6));
  lines.push(
    "reserves   " + formatTokens(reserves.base, balances.baseDecimals) +
      " base / " + formatSol(reserves.quote) + " quote",
  );
  lines.push("virtual    " + formatSol(reserves.virtualQuote) + " quote offset");
  lines.push("price      " + price.toExponential(4) + " per base unit");
  lines.push("lp supply  " + pool.lpSupply.toString());

  const buy = quoteBuy(reserves, 1_000_000_000n, DEFAULT_AMM_FEES);
  lines.push("");
  lines.push("quote: buy for 1 SOL");
  lines.push("  fees     lp " + formatSol(buy.fees.lp) + " / protocol " + formatSol(buy.fees.protocol) +
    " / creator " + formatSol(buy.fees.coinCreator));
  lines.push("  receive  " + formatTokens(buy.baseOut, balances.baseDecimals) + " base");
  lines.push("  impact   " + formatPercent(buy.priceImpact));

  const stake = reserves.base / 100n;
  const sell = quoteSell(reserves, stake, DEFAULT_AMM_FEES);
  lines.push("");
  lines.push("quote: sell 1% of the pool's base");
  lines.push("  gross    " + formatSol(sell.grossQuote));
  lines.push("  net      " + formatSol(sell.netQuote));
  lines.push("  impact   " + formatPercent(sell.priceImpact));

  return lines.join(String.fromCharCode(10));
}
