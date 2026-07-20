import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import "dotenv/config";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function offersForRun(runId: string, startingInventory: Record<string, number>) {
  const { data } = await db
    .from("decisions")
    .select("id, turn_number, agent_id, agent_model, action, outcome, intent")
    .eq("run_id", runId)
    .eq("intent->>action", "TRADE")
    .order("turn_number");

  const rows = data ?? [];
  // will return a list with info about all offers in that run
  const offers = [];
  // get inventory for each agent AT THE MOMENT of the offer
  for (const r of rows) {
    const trade = (r.intent as { trade: { with: string; offer: unknown; request: unknown } }).trade;

    let inventories: Record<string, Record<string, number>>;
    if (r.turn_number === 1) {
      inventories = { [r.agent_id]: startingInventory, [trade.with]: startingInventory };
    } else {
      const { data: prevTurn } = await db
        .from("turns")
        .select("state")
        .eq("run_id", runId)
        .eq("turn_number", r.turn_number - 1)
        .maybeSingle();
      inventories = (prevTurn?.state as { agents: Record<string, Record<string, number>> } | undefined)?.agents ?? {};
    }

    offers.push({
      offerId: r.id,
      runId,
      turnNumber: r.turn_number,
      proposer: r.agent_id,
      proposerModel: r.agent_model,
      counterparty: trade.with,
      offer: trade.offer,
      request: trade.request,
      proposerInventoryBefore: inventories[r.agent_id] ?? null,
      counterpartyInventoryBefore: inventories[trade.with] ?? null,
      declined: r.action !== "TRADE", // rewritten to REST by advanceTurn
      executed: r.outcome === "traded",
    });
  }
  return offers;
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error("usage: extract-offers.ts <manifest.json>");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const runIds: string[] = [...new Set(manifest.runs.map((r: { runId: string }) => r.runId))] as string[];

  const allOffers = [];
  for (const runId of runIds) {
    allOffers.push(...(await offersForRun(runId, manifest.experiment.startingInventory)));
  }

  console.log(`extracted ${allOffers.length} TRADE offers across ${runIds.length} runs`);
  mkdirSync("calibration", { recursive: true });
  writeFileSync("calibration/offers.json", JSON.stringify(allOffers, null, 2));
}

main();
