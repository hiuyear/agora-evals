import { z } from "zod";
import { readFileSync } from "node:fs";

// a condition = one thing we compare. ONLY label + model on purpose: model is the
// independent variable, everything else is held constant at the experiment level.
// if agents/turns lived here we could accidentally compare haiku@3-agents vs
// gpt@5-agents and never know it was a confound.
export const ConditionSchema = z.object({
  label: z.string().min(1),
  model: z.enum(["claude-haiku-4-5", "gpt-4o-mini"]),
});

// no model field here — the condition supplies it. same cast plays as both models.
export const RosterAgentSchema = z.object({
  name: z.string().min(1),
  personality: z.string().min(1),
  specialty: z.string().min(1),
});

export const InventorySchema = z.object({
  food: z.number().int().min(0),
  ore: z.number().int().min(0),
  gold: z.number().int().min(0),
});

export const ExperimentConfigSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/), // becomes a folder name, so no spaces/slashes
  conditions: z.array(ConditionSchema).min(1),
  roster: z.array(RosterAgentSchema).min(2), // need 2+ to trade
  startingInventory: InventorySchema,
  turns: z.number().int().min(1).max(50),
  replicates: z.number().int().min(1), // "replicates" not "seeds" — temp>0 isn't reproducible
  notes: z.string().optional(),
});

export type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>;

export function loadExperimentConfig(path: string): ExperimentConfig {
  const raw = readFileSync(path, "utf-8");
  return ExperimentConfigSchema.parse(JSON.parse(raw)); // throws w/ the bad field named
}
