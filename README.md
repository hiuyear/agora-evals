# agora-evals

a behavioral benchmark for agora village, a multi-agent economic simulation where
claude and gpt agents farm, mine, rest, and trade with each other. this repo
launches controlled experiments against the village's public api, reads the raw
results back from its database, and reports calibrated behavioral metrics across
model families with bootstrap confidence intervals.

village = the simulation. evals (this repo) = the instrument that measures it.
separate repos on purpose. evals never imports village code, it only talks to
the village's public api and reads its database, the same way a real third-party
eval vendor would treat a customer's system.

## the finding (pilot, n=2 replicates)

question: if you swap the model powering an entire village (same agents, same
roles, same starting resources — just a different model underneath), does the
village's behavior change?

pilot: claude-haiku-4-5 vs gpt-4o-mini (would love to try out more models but i'm lowk broke 😭), 3 agents, 8 turns, 2 replicates each.

final gini (wealth inequality at the end of the game):

| model | mean | 95% ci |
|---|---|---|
| haiku | 0.036 | 0.034 – 0.039 |
| 4o-mini | 0.182 | 0.141 – 0.223 |

the two intervals don't overlap. 4o-mini's agents traded far more (8 offers on
average vs 1.5 for haiku) and ended up with a much less equal outcome. small
sample, but a real, defensible early signal — not noise.

full chart + trade funnel + cost/latency breakdown: [results/pilot-2x2/report.html](results/pilot-2x2/report.html)

## architecture

```
agora-village (running app)                    supabase postgres (shared)
  POST /api/runs, /start (202 -> workflow)  ->    runs / turns / decisions
  callLLM -> otel span -> braintrust + jsonl      (+ latency, tokens, intent)
        ^                                              ^
        | control channel (launch + poll)              | data channel (read-only)
        |                                              |
agora-evals (this repo)
  experiments/*.json -> config.ts (zod-validated)
  runner.ts   -> launches runs, writes manifest.json
  metrics.ts  -> reads supabase, computes gini/trade-funnel/cost from raw state
  analysis/experiment.ipynb -> bootstrap 95% cis
  report.ts   -> report.html
```

evals never reaches into the village's code. it launches runs over http and reads
results from the same postgres database the village writes to — two repos, one
shared database, no imports either direction.

full reasoning behind these decisions (alternatives considered, a real data bug
that got found and fixed along the way, why the stats are done the way they
are): [ARCHITECTURE.md](ARCHITECTURE.md)

## reproduce it

needs a running agora-village instance + its supabase credentials in `.env`.

```bash
npm install
npx tsx src/runner.ts experiments/pilot.json      # launches the games, writes manifest.json
npx tsx src/metrics.ts results/pilot-2x2/manifest.json   # per-run metrics.json
jupyter nbconvert --to notebook --execute --inplace analysis/experiment.ipynb  # cis.json
npx tsx src/report.ts results/pilot-2x2/manifest.json    # report.html
```

every number in the report traces back to a run-id in `manifest.json`, which is
committed — anyone can re-fetch those runs from the village's (unauthenticated)
GET endpoint and check the numbers themselves.

## how the metrics work

metrics are recomputed here from raw persisted state (agent inventories,
decision rows), not read from the village's own stored numbers. an eval that
trusts the system it's grading can't catch that system being wrong.

- **gini**: over total wealth, not just gold. weights (food=2, ore=3, gold=6)
  are each resource's marginal labor cost, derived from the sim's own production
  rates, not guessed.
- **trade funnel**:offered -> accepted -> executed. the village used to throw
  away declined offers (rewritten to "rest" with the terms deleted), which would
  have made the funnel undercount refused trades. fixed by persisting the
  agent's original intent before negotiation rewrites it.
- **cost / latency**: summed and averaged from token counts + call timing
  recorded at the llm call site in the village, per-decision-row.

## limitations, honestly

- **n=2 replicates per condition.** these confidence intervals describe
  run-to-run noise in a small pilot, not formal statistical significance — no
  p-value is computed anywhere in this repo.
- **replicates, not seeds.** llm calls at temperature>0 aren't reproducible, so
  repeated runs are independent samples from the model's behavior distribution,
  not deterministic reruns.
- **homogeneous villages only.** every agent in a given run uses the same model
  — this measures "does the model powering the whole village matter," not
  "how do differently-abled agents behave when trading with each other."
  that's a different, real experiment, not run here.
- **no llm-judge metric this pass.** exploitation-of-need (does an agent make a
  lopsided offer to a visibly low-inventory counterparty) needs a hand-labeled
  calibration set and a measured judge/human agreement (cohen's kappa) before
  its numbers are trustworthy. not done yet, so it's not in this report — an
  uncalibrated judge is just an opinion with an api bill.
- **observability is real but not the source of truth.** every llm call is
  traced with opentelemetry to braintrust plus a local jsonl mirror, but the
  numbers above come from the database, not the traces. the vendor is a view,
  not a dependency.
