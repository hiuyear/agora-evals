export type Inventory = Record<string, number>;

export type DecisionRow = {
  intent: { action: string } | null; // round-1 plan before negotiation rewrote it (#8)
  action: string;
  outcome: string;
  agent_model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
};

// weights = each resource's marginal labor cost from the sim's own production
// rates (3 food | 2 ore | 1 gold per non-specialist turn), normalized x6. see #11.
export const VALUATION: Record<string, number> = { food: 2, ore: 3, gold: 6 };

export const PRICES: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1.0 / 1e6, out: 5.0 / 1e6 },
  "gpt-4o-mini": { in: 0.15 / 1e6, out: 0.6 / 1e6 },
};

// ported from village metrics.ts. closed form over ascending-sorted values, rank i (1-based):
//   G = (2 * Σ i·x_i) / (n · Σ x_i) − (n + 1) / n
export function gini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b); // copy first, .sort mutates
  const total = sorted.reduce((s, x) => s + x, 0);
  if (total === 0) return 0; // everyone at zero = equal, dodge 0/0
  const weighted = sorted.reduce((s, x, i) => s + (i + 1) * x, 0);
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

// iterate keys instead of hardcoding inv.food+inv.ore so a new resource is a
// valuation line, not a code change (#7). unknown resource -> weight 0.
export function wealth(inv: Inventory, valuation: Record<string, number> = VALUATION): number {
  return Object.entries(inv).reduce((sum, [res, qty]) => sum + qty * (valuation[res] ?? 0), 0);
}

// offered -> accepted -> executed. the two gaps are the interesting findings.
export function tradeFunnel(rows: DecisionRow[]) {
  const offered = rows.filter((r) => r.intent?.action === "TRADE").length;
  const accepted = rows.filter((r) => r.action === "TRADE").length;
  const executed = rows.filter((r) => r.outcome === "traded").length;
  return {
    offered,
    accepted,
    executed,
    declineRate: offered ? (offered - accepted) / offered : 0,
    unaffordableRate: accepted ? (accepted - executed) / accepted : 0, // the "wart" quantified
  };
}

export function totalCost(rows: DecisionRow[]): number {
  return rows.reduce((sum, r) => {
    const p = PRICES[r.agent_model];
    if (!p) return sum; // unknown model priced at 0 rather than crash
    return sum + (r.input_tokens ?? 0) * p.in + (r.output_tokens ?? 0) * p.out;
  }, 0);
}
