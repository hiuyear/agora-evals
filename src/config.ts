import { z } from "zod";
import { readFileSync } from "node:fs";

export const ConditionSchema = z.object({
  label: z.string().min(1),
  model: z.enum(["claude-haiku-4-5", "gpt-4o-mini"]),
});

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
  name: z.string().regex(/^[a-z0-9-]+$/),
  conditions: z.array(ConditionSchema).min(1),
  roster: z.array(RosterAgentSchema).min(2),
  startingInventory: InventorySchema,
  turns: z.number().int().min(1).max(50),
  replicates: z.number().int().min(1), // replicates, not seeds: temp>0 calls aren't seedable
  notes: z.string().optional(),
});

export type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>;

export function loadExperimentConfig(path: string): ExperimentConfig {
  const raw = readFileSync(path, "utf-8");
  return ExperimentConfigSchema.parse(JSON.parse(raw));
}
