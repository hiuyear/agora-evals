import { describe, it, expect } from "vitest";
import { gini, wealth, tradeFunnel, totalCost, type DecisionRow } from "./metrics-core";

describe("gini", () => {
  it("is 0 for perfect equality", () => {
    expect(gini([5, 5, 5, 5])).toBeCloseTo(0);
  });

  it("is 0 when everyone has nothing", () => {
    expect(gini([0, 0, 0])).toBe(0);
  });

  it("is 0 for the empty list", () => {
    expect(gini([])).toBe(0);
  });

  // by hand: (2*4)/(4*1) − 5/4 = 2 − 1.25 = 0.75
  it("matches the closed form when one holder owns everything", () => {
    expect(gini([0, 0, 0, 1])).toBeCloseTo(0.75);
  });

  it("does not mutate its input and is order-independent", () => {
    const input = [3, 1, 2];
    gini(input);
    expect(input).toEqual([3, 1, 2]);
    expect(gini([1, 2, 3])).toBeCloseTo(gini([3, 2, 1]));
  });
});

describe("wealth", () => {
  it("values an inventory by the valuation vector", () => {
    expect(wealth({ food: 10, ore: 2, gold: 5 })).toBe(56); // 20 + 6 + 30
  });

  it("ignores unknown resources", () => {
    expect(wealth({ gold: 1, diamond: 999 })).toBe(6);
  });

  // the #11 oracle: gold-only valuation must reduce wealth back to raw gold
  it("reproduces gold-only wealth under the oracle valuation", () => {
    expect(wealth({ food: 10, ore: 2, gold: 5 }, { gold: 1, food: 0, ore: 0 })).toBe(5);
  });
});

const row = (o: Partial<DecisionRow>): DecisionRow => ({
  intent: null,
  action: "REST",
  outcome: "no_trade",
  agent_model: "gpt-4o-mini",
  input_tokens: 0,
  output_tokens: 0,
  latency_ms: 0,
  ...o,
});

describe("tradeFunnel", () => {
  it("counts the three gates and the two drop rates", () => {
    const rows = [
      row({ intent: { action: "TRADE" }, action: "TRADE", outcome: "traded" }),
      row({ intent: { action: "TRADE" }, action: "TRADE", outcome: "no_trade" }), // agreed, couldn't afford
      row({ intent: { action: "TRADE" }, action: "REST", outcome: "no_trade" }), // declined
      row({ intent: { action: "FARM" }, action: "FARM", outcome: "ok" }),
    ];
    const f = tradeFunnel(rows);
    expect(f.offered).toBe(3);
    expect(f.accepted).toBe(2);
    expect(f.executed).toBe(1);
    expect(f.declineRate).toBeCloseTo(1 / 3);
    expect(f.unaffordableRate).toBeCloseTo(1 / 2);
  });

  it("returns zero rates instead of dividing by zero", () => {
    const f = tradeFunnel([row({ intent: { action: "FARM" } })]);
    expect(f.declineRate).toBe(0);
    expect(f.unaffordableRate).toBe(0);
  });
});

describe("totalCost", () => {
  it("sums tokens times the per-model price", () => {
    const rows = [row({ agent_model: "gpt-4o-mini", input_tokens: 1_000_000, output_tokens: 1_000_000 })];
    expect(totalCost(rows)).toBeCloseTo(0.75); // 0.15 + 0.60
  });

  it("skips models with no price entry", () => {
    expect(totalCost([row({ agent_model: "nope", input_tokens: 5, output_tokens: 5 })])).toBe(0);
  });
});
