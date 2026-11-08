import type { ParsedPumpTransaction, PumpTrade, TradeSettlement } from "@bark/pumpfun";
import { completionQuoteReserves, spotPrice, DEFAULT_CURVE_PARAMS } from "@bark/pumpfun";
import type { BondingCurveAccount } from "@bark/pumpfun";
import { formatPercent, formatSol, formatTokens, shortKey } from "./format.js";

/** Renders a parsed transaction for humans. Pure: takes data, returns text. */
export function renderTransaction(
  parsed: ParsedPumpTransaction,
  settlements: TradeSettlement[] = [],
): string {
  const lines: string[] = [];
  lines.push("signature  " + parsed.signature);
  lines.push("slot       " + parsed.slot);
  lines.push(
    "status     " + (parsed.failed ? "failed" : "ok") +
      (parsed.computeUnits === null ? "" : " (" + parsed.computeUnits.toLocaleString("en-US") + " CU)"),
  );
  lines.push("trades     " + parsed.trades.length);
  lines.push("launches   " + parsed.creates.length);
  lines.push("completes  " + parsed.completions.length);

  for (const create of parsed.creates) {
    lines.push("");
    lines.push("LAUNCH  " + create.symbol + "  " + create.name);
    lines.push("  mint      " + create.mint.toBase58());
    lines.push("  curve     " + create.bondingCurve.toBase58());
    lines.push("  creator   " + create.creator.toBase58());
    lines.push("  uri       " + create.uri);
    lines.push("  mayhem    " + (create.isMayhemMode ? "yes" : "no"));
  }

  parsed.trades.forEach((trade, index) => {
    lines.push("");
    lines.push(renderTrade(trade));
    const settlement = settlements[index];
    if (settlement !== undefined) {
      lines.push(
        "  settled   user " + formatSol(settlement.userDelta) + " SOL, costs " +
          formatSol(settlement.totalCosts) + " SOL",
      );
      for (const credit of settlement.credits) {
        lines.push("  credit    " + shortKey(credit.address) + "  +" + formatSol(credit.delta) + " SOL");
      }
    }
  });

  for (const completion of parsed.completions) {
    lines.push("");
    lines.push("COMPLETE  " + completion.mint.toBase58());
  }

  return lines.join(String.fromCharCode(10));
}

function renderTrade(trade: PumpTrade): string {
  const head =
    "  " + trade.kind.toUpperCase().padEnd(4) + "  " + shortKey(trade.mint.toBase58(), 6) +
    "  " + formatSol(trade.solAmount) + " SOL  " + formatTokens(trade.tokenAmount) + " tokens";
  const fees =
    "  fees     protocol " + formatSol(trade.fee) + " SOL @" + trade.feeBasisPoints +
    "bps, creator " + formatSol(trade.creatorFee) + " SOL @" + trade.creatorFeeBasisPoints + "bps";
  const who =
    "  user     " + shortKey(trade.user.toBase58(), 6) +
    (trade.creator === null ? "" : "   creator " + shortKey(trade.creator.toBase58(), 6));
  return head + String.fromCharCode(10) + fees + String.fromCharCode(10) + who;
}

/** Renders a decoded curve with derived pricing. Pure. */
export function renderCurve(curve: BondingCurveAccount): string {
  const lines: string[] = [];
  const target = completionQuoteReserves(DEFAULT_CURVE_PARAMS);
  const progress = target === 0n ? 0 : Number(curve.realQuoteReserves) / Number(target);

  lines.push("curve      " + curve.address.toBase58());
  lines.push("layout     " + curve.layout);
  lines.push("complete   " + (curve.complete ? "yes" : "no"));
  lines.push("virtual    " + formatSol(curve.virtualQuoteReserves) + " SOL / " +
    formatTokens(curve.virtualTokenReserves) + " tokens");
  lines.push("real       " + formatSol(curve.realQuoteReserves) + " SOL");
  lines.push("price      " + spotPrice(curve).toExponential(4) + " SOL per token");
  lines.push("progress   " + formatPercent(Math.min(1, progress)));
  if (curve.creator !== null) {
    lines.push("creator    " + curve.creator.toBase58());
  }
  lines.push("accrued    creator " + formatSol(curve.creatorFee) + " SOL, protocol " +
    formatSol(curve.protocolFees) + " SOL");
  return lines.join(String.fromCharCode(10));
}
