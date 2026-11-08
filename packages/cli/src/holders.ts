import type { ConcentrationReport, HolderSnapshot } from "@bark/market-intel";
import { formatPercent, formatTokens, shortKey } from "./format.js";

/** Renders a concentration report. Pure: takes data, returns text. */
export function renderHolders(
  mint: string,
  snapshot: HolderSnapshot,
  report: ConcentrationReport,
  decimals: number,
): string {
  const lines: string[] = [];
  lines.push("mint       " + mint);
  lines.push("supply     " + formatTokens(report.totalSupply, decimals, 0));
  lines.push(
    "covered    " + snapshot.coveredAccounts + " token accounts" +
      (snapshot.truncated ? " (capped at 20 by the RPC)" : ""),
  );
  lines.push("top1       " + formatPercent(report.topShares["1"] ?? 0));
  lines.push("top5       " + formatPercent(report.topShares["5"] ?? 0));
  lines.push("top10      " + formatPercent(report.topShares["10"] ?? 0));
  lines.push("hhi        " + report.hhi.toFixed(4) + "  (effective " +
    report.effectiveHolders.toFixed(1) + ")");
  lines.push("gini       " + report.gini.toFixed(4));
  lines.push("whales     " + report.whaleCount + " above 1% of supply");
  lines.push("");
  lines.push("largest:");
  report.top.slice(0, 10).forEach((holder, index) => {
    lines.push(
      "  " + String(index + 1).padStart(2) + "  " + shortKey(holder.owner, 6) + "  " +
        formatPercent(holder.share) + "  " + formatTokens(holder.amount, decimals, 0),
    );
  });
  lines.push("");
  lines.push("note: measured per token account; several accounts can share a wallet.");
  return lines.join(String.fromCharCode(10));
}
