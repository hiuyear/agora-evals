import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { gini, wealth, tradeFunnel, totalCost, type DecisionRow, type Inventory } from "./metrics-core";
import "dotenv/config";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function metricsForRun(runId: string) {
  const { data: lastTurn } = await db
    .from("turns")
    .select("state")
    .eq("run_id", runId)
    .order("turn_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const agents = (lastTurn?.state as { agents: Record<string, Inventory> } | undefined)?.agents ?? {};
  const finalGini = gini(Object.values(agents).map((inv) => wealth(inv)));

  const { data } = await db
    .from("decisions")
    .select("intent, action, outcome, agent_model, input_tokens, output_tokens, latency_ms")
    .eq("run_id", runId);

  const rows = (data ?? []) as DecisionRow[];
  const latencies = rows.map((r) => r.latency_ms ?? 0);
  const meanLatencyMs = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  return {
    runId,
    finalGini,
    ...tradeFunnel(rows),
    cost: totalCost(rows),
    meanLatencyMs,
  };
}

async function main() {
  const manifestPath = process.argv[2];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const perRun = [];
  for (const { label, runId } of manifest.runs) {
    perRun.push({ label, ...(await metricsForRun(runId)) });
  }
  console.table(perRun);
  writeFileSync(manifestPath.replace("manifest.json", "metrics.json"), JSON.stringify(perRun, null, 2));
}

main();
