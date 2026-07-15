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

  // Known value: for [0, 0, 0, 1] (one holder owns everything among n=4),
  // G = (2*Σ i·x_i)/(n·Σx) − (n+1)/n = (2*4)/(4*1) − 5/4 = 2 − 1.25 = 0.75.
  it("matches the closed form for one holder owning everything", () => {
    expect(gini([0, 0, 0, 1])).toBeCloseTo(0.75);
  });

  it("is order-independent (sorts internally, does not mutate input)", () => {
    const input = [3, 1, 2];
    const before = [...input];
    gini(input);
    expect(input).toEqual(before); // input untouched
    expect(gini([1, 2, 3])).toBeCloseTo(gini([3, 2, 1]));
  });
});

describe("wealth", () => {
  it("values an inventory by the valuation vector", () => {
    // 10 food*2 + 2 ore*3 + 5 gold*6 = 20 + 6 + 30 = 56
    expect(wealth({ food: 10, ore: 2, gold: 5 })).toBe(56);
  });

  it("ignores unknown resources (weight 0)", () => {
    expect(wealth({ gold: 1, diamond: 999 })).toBe(6);
  });

  it("reproduces gold-only wealth under the oracle valuation", () => {
    // The port oracle (#11): valuation {gold:1,food:0,ore:0} => wealth == gold.
    const inv = { food: 10, ore: 2, gold: 5 };
    expect(wealth(inv, { gold: 1, food: 0, ore: 0 })).toBe(5);
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
  it("counts the three gates and derives the two drop rates", () => {
    const rows = [
      // offered + accepted + executed
      row({ intent: { action: "TRADE" }, action: "TRADE", outcome: "traded" }),
      // offered + accepted but NOT executed (couldn't afford it)
      row({ intent: { action: "TRADE" }, action: "TRADE", outcome: "no_trade" }),
      // offered but declined (rewritten to REST) -> intent still shows the attempt
      row({ intent: { action: "TRADE" }, action: "REST", outcome: "no_trade" }),
      // never tried to trade
      row({ intent: { action: "FARM" }, action: "FARM", outcome: "ok" }),
    ];
    const f = tradeFunnel(rows);
    expect(f.offered).toBe(3);
    expect(f.accepted).toBe(2);
    expect(f.executed).toBe(1);
    expect(f.declineRate).toBeCloseTo(1 / 3); // (3-2)/3
    expect(f.unaffordableRate).toBeCloseTo(1 / 2); // (2-1)/2
  });

  it("returns zero rates rather than dividing by zero", () => {
    const f = tradeFunnel([row({ intent: { action: "FARM" } })]);
    expect(f.declineRate).toBe(0);
    expect(f.unaffordableRate).toBe(0);
  });
});

describe("totalCost", () => {
  it("sums input/output tokens times the per-model price", () => {
    const rows = [
      row({ agent_model: "gpt-4o-mini", input_tokens: 1_000_000, output_tokens: 1_000_000 }),
    ];
    // 1M*0.15/1e6 + 1M*0.60/1e6 = 0.15 + 0.60 = 0.75
    expect(totalCost(rows)).toBeCloseTo(0.75);
  });

  it("skips rows whose model has no price entry", () => {
    const rows = [row({ agent_model: "unknown-model", input_tokens: 5, output_tokens: 5 })];
    expect(totalCost(rows)).toBe(0);
  });
});
