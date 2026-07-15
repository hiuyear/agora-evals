import { loadExperimentConfig, type ExperimentConfig, type ConditionSchema } from "./config";
import { writeFileSync, mkdirSync } from "node:fs";
import { z } from "zod";
import "dotenv/config";

type Condition = z.infer<typeof ConditionSchema>;

const VILLAGE = process.env.VILLAGE_API_URL;
if (!VILLAGE) throw new Error("VILLAGE_API_URL not set (copy it into .env)");

const POLL_MS = 10_000;
const TIMEOUT_MS = 10 * 60_000;

function buildRunConfig(exp: ExperimentConfig, condition: Condition) {
  return {
    agents: exp.roster.map((a) => ({ ...a, model: condition.model })),
    startingInventory: exp.startingInventory,
    turns: exp.turns,
  };
}

async function launchOneRun(name: string, config: object): Promise<{ id: string; token: string }> {
  const createRes = await fetch(`${VILLAGE}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, config }),
  });
  if (createRes.status !== 201) throw new Error(`create failed (${createRes.status})`);
  const { id, creatorToken } = await createRes.json();

  const startRes = await fetch(`${VILLAGE}/api/runs/${id}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-creator-token": creatorToken },
    body: JSON.stringify({}),
  });
  if (startRes.status !== 202) throw new Error(`start failed (${startRes.status}) for ${id}`);

  return { id, token: creatorToken };
}

async function waitUntilDone(id: string): Promise<"completed" | "error"> {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const res = await fetch(`${VILLAGE}/api/runs/${id}`);
    const run = await res.json();
    if (run.status === "completed") return "completed";
    if (run.status === "error") return "error";
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`run ${id} timed out after ${TIMEOUT_MS}ms`);
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: tsx src/runner.ts <experiment.json>");
  const exp = loadExperimentConfig(path);

  const manifest = {
    experiment: exp,
    createdAt: new Date().toISOString(),
    runs: [] as { label: string; runId: string }[],
  };
  const tokens: Record<string, string> = {};

  for (const condition of exp.conditions) {
    for (let rep = 0; rep < exp.replicates; rep++) {
      const name = `${exp.name}-${condition.label}-r${rep}`;
      const { id, token } = await launchOneRun(name, buildRunConfig(exp, condition));
      tokens[id] = token;
      const status = await waitUntilDone(id);
      if (status === "error") throw new Error(`run ${id} (${name}) errored`);
      manifest.runs.push({ label: condition.label, runId: id });
      console.log(`done: ${name} -> ${id}`);
    }
  }

  const dir = `results/${exp.name}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
  writeFileSync(`${dir}/.tokens.json`, JSON.stringify(tokens, null, 2));
  console.log(`manifest: ${dir}/manifest.json (${manifest.runs.length} runs)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
