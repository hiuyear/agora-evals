import { describe, it, expect } from "vitest";
import { ExperimentConfigSchema } from "./config";

const valid = {
  name: "pilot-2x2",
  conditions: [{ label: "haiku", model: "claude-haiku-4-5" }],
  roster: [
    { name: "Mira", personality: "cautious", specialty: "farmer" },
    { name: "Rex", personality: "shrewd", specialty: "miner" },
  ],
  startingInventory: { food: 10, ore: 2, gold: 5 },
  turns: 8,
  replicates: 2,
};

describe("ExperimentConfigSchema", () => {
  it("accepts a valid config", () => {
    expect(ExperimentConfigSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects replicates < 1", () => {
    const bad = { ...valid, replicates: 0 };
    expect(ExperimentConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown model id", () => {
    const bad = { ...valid, conditions: [{ label: "x", model: "claude-haiku-3.5" }] };
    expect(ExperimentConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a roster with fewer than 2 agents", () => {
    const bad = { ...valid, roster: [valid.roster[0]] };
    expect(ExperimentConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a name with illegal characters", () => {
    const bad = { ...valid, name: "Pilot 2x2!" };
    expect(ExperimentConfigSchema.safeParse(bad).success).toBe(false);
  });
});
