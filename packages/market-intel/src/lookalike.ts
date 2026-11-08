/**
 * Lookalike detection.
 *
 * Why this exists: while watching the live launch feed, two different tokens
 * launched within the same minute with the same symbol and name ("cnb",
 * "coldest nigga breathing") under different mints and different creators.
 * That is the everyday shape of an impersonation attempt - someone copies a
 * token that is trending to catch the flow.
 *
 * Detection here is deterministic and explainable: normalise, then compare
 * with named rules, and always return the rule that fired. No fuzzy score
 * without a reason attached.
 */

export interface TokenFingerprint {
  mint: string;
  symbol: string;
  name: string;
  creator?: string;
}

export interface LookalikeMatch {
  candidate: TokenFingerprint;
  score: number;
  reasons: string[];
}

export interface LookalikeOptions {
  /** Ignore pairs that share a creator - a relaunch is not impersonation. */
  ignoreSameCreator?: boolean;
  /** Minimum score to report. Default 0.6. */
  threshold?: number;
  limit?: number;
}

const HOMOGLYPHS: Record<string, string> = {
  "0": "o",
  "1": "l",
  "2": "z",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "l",
  "€": "e",
  // Cyrillic and Greek lookalikes seen in real token names
  "а": "a",
  "в": "b",
  "е": "e",
  "к": "k",
  "м": "m",
  "н": "h",
  "о": "o",
  "р": "p",
  "с": "c",
  "т": "t",
  "у": "y",
  "х": "x",
  "і": "i",
  "ј": "j",
  "ѕ": "s",
  "ԁ": "d",
  "ν": "v",
  "ω": "w",
};

/** Lowercases, strips decoration, folds homoglyphs and collapses separators. */
export function normalizeTokenText(value: string): string {
  const lowered = value.toLowerCase().normalize("NFKD");
  let stripped = "";
  for (const char of lowered) {
    if (char.charCodeAt(0) >= 0x300 && char.charCodeAt(0) <= 0x36f) {
      continue;
    }
    const mapped = HOMOGLYPHS[char];
    if (mapped !== undefined) {
      stripped += mapped;
      continue;
    }
    if (/[a-z0-9]/.test(char)) {
      stripped += char;
    }
  }
  return stripped;
}

/** Levenshtein distance, iterative with two rows. */
export function editDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const insertion = (current[j - 1] as number) + 1;
      const deletion = (previous[j] as number) + 1;
      const substitution = (previous[j - 1] as number) + cost;
      current[j] = Math.min(insertion, deletion, substitution);
    }
    previous = current;
  }
  return previous[b.length] as number;
}

function similarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const longest = Math.max(a.length, b.length);
  return 1 - editDistance(a, b) / longest;
}

/**
 * Scores how closely one token imitates another, with reasons.
 *
 * Returns 0 for the same mint (that is the token itself, not an imitation).
 */
export function compareFingerprints(
  target: TokenFingerprint,
  candidate: TokenFingerprint,
): { score: number; reasons: string[] } {
  if (target.mint === candidate.mint) {
    return { score: 0, reasons: [] };
  }

  const reasons: string[] = [];
  let score = 0;

  const targetSymbol = normalizeTokenText(target.symbol);
  const candidateSymbol = normalizeTokenText(candidate.symbol);
  const targetName = normalizeTokenText(target.name);
  const candidateName = normalizeTokenText(candidate.name);

  if (targetSymbol.length > 0 && targetSymbol === candidateSymbol) {
    score = Math.max(score, 0.95);
    reasons.push("identical symbol");
  } else if (targetSymbol.length > 2 && candidateSymbol.length > 2) {
    const symbolSimilarity = similarity(targetSymbol, candidateSymbol);
    if (symbolSimilarity >= 0.8) {
      score = Math.max(score, 0.7 * symbolSimilarity);
      reasons.push("similar symbol (" + Math.round(symbolSimilarity * 100) + "%)");
    }
  }

  if (targetName.length > 0 && targetName === candidateName) {
    score = Math.max(score, 0.9);
    reasons.push("identical name");
  } else if (targetName.length > 4 && candidateName.length > 4) {
    const nameSimilarity = similarity(targetName, candidateName);
    if (nameSimilarity >= 0.85) {
      score = Math.max(score, 0.6 * nameSimilarity);
      reasons.push("similar name (" + Math.round(nameSimilarity * 100) + "%)");
    }
  }

  if (
    targetSymbol !== candidateSymbol &&
    targetSymbol.length > 1 &&
    (candidateSymbol.includes(targetSymbol) || targetSymbol.includes(candidateSymbol))
  ) {
    score = Math.max(score, 0.75);
    reasons.push("symbol is a superstring of the original");
  }

  if (reasons.length >= 2) {
    score = Math.min(1, score + 0.1);
    reasons.push("matches on multiple fields");
  }

  return { score: Number(score.toFixed(3)), reasons };
}

/** Ranks candidates that look like the target, most similar first. */
export function findLookalikes(
  target: TokenFingerprint,
  candidates: TokenFingerprint[],
  options: LookalikeOptions = {},
): LookalikeMatch[] {
  const threshold = options.threshold ?? 0.6;
  const limit = options.limit ?? 10;
  const matches: LookalikeMatch[] = [];

  for (const candidate of candidates) {
    if (options.ignoreSameCreator === true && target.creator !== undefined && candidate.creator === target.creator) {
      continue;
    }
    const result = compareFingerprints(target, candidate);
    if (result.score >= threshold) {
      matches.push({ candidate, score: result.score, reasons: result.reasons });
    }
  }

  matches.sort((a, b) => (a.score === b.score ? 0 : b.score - a.score));
  return matches.slice(0, limit);
}
