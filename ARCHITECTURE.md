# architecture

this is the decision record for agora-evals — what got built, what the
alternatives were, and why. the short version is in the README; this is the
longer version, for anyone who wants to see the actual reasoning.

## the trust boundary

evals is a separate repo from agora-village on purpose, and it never imports
village code. it only touches the village through two channels:

- **control channel** — the village's public http api. the runner posts to
  create a run, posts again to start it (village returns 202, because the
  actual simulation runs in a durable background workflow, not inside that
  request), then polls a get endpoint until it's done.
- **data channel** — the shared supabase postgres database. both repos hold
  credentials to the same database; evals reads runs/turns/decisions rows
  back after the village has written them. read-only, explicit column lists,
  never `select *`.

this is deliberately the same posture a third-party eval vendor has toward a
customer's system: it can't see internals, only the public surface. it also
means a code change inside the village (better prompts, different
orchestration) costs evals nothing — just re-run the same experiment config.
a change to the village's *data model* (new resource type, new action) is a
different kind of change, and does require touching evals' code, because
evals depends on the shape of that data even though it never imports it.

## observability lives where the llm call happens, not here

every llm call in the village is wrapped in an opentelemetry span (`gen_ai.*`
attributes — model, input/output tokens — plus custom run/turn/agent attrs),
exported to braintrust over otlp, with a local jsonl file as a mirror. this
code has to live in the village, not in evals, because a span can only be
created in the same process, at the same moment, as the call it's timing —
you can't observe a call from a different process after the fact.

the report's numbers do not come from these traces. they come from the
database. traces are the debugging/observability layer; the database is the
source of truth for anything that gets reported. that split means braintrust
being down doesn't affect a single number in the report — the vendor is a
view, not a dependency.

## evals recomputes its own metrics — it doesn't trust the village's

the village already computes a gini coefficient every turn and stores it.
evals doesn't read that number. it reads the raw inventory state and computes
gini itself, from its own ported formula. the reasoning: an eval that trusts
the system it's grading can't catch that system being wrong. if the village's
own gini calculation had a bug, reading it directly would launder that bug
into a benchmark that's supposed to be independent.

the real cost of this choice is coupling to the village's data *shape* even
without importing its code. the mitigation is writing metrics against that
shape rather than against specific values — inventory keys are iterated, not
hardcoded (`inv.wheat + inv.wood` breaks the day a new resource is added;
`Object.entries(inv).reduce(...)` against a valuation table doesn't). a new
resource becomes a one-line addition to a price table, not a code change.

there's a correctness check that comes for free from this design: setting the
wealth valuation to `{gold: 1, food: 0, ore: 0}` makes evals' own gini
computation reduce to gold-only wealth, which must exactly match the village's
stored number. that's used to verify the port is correct, without ever
trusting the village's number for actual reporting.

## gini is computed over total wealth, with weights that aren't guessed

most inequality metrics over a multi-resource economy either ignore some
resources or assign arbitrary weights to combine them. neither is defensible.
here the weights come directly from the simulation's own production function:
one turn of non-specialist labor yields 3 food, or 2 ore, or 1 gold, so the
marginal labor cost per unit is 1/3 : 1/2 : 1, normalized to food=2, ore=3,
gold=6. "wealth" means something the simulation itself defines, not something
picked because it looked reasonable.

## a real data bug the fix accidentally exposed

partway through, reading agora-village's `advanceTurn` function surfaced a
real problem: when a trade offer gets declined, the proposer's decision row
gets rewritten to `{action: "rest"}` and the original offer terms are set to
null before anything is saved. the database has no record the offer was ever
made.

that's a real problem for measuring exploitation, because the exploitative
act is making a predatory offer, not having it accepted — a judge that can
only see accepted trades would systematically miss the offers most likely to
be predatory (the ones that got refused), biasing the metric in a direction
that isn't random or symmetric across models. it also made "offer acceptance
rate" impossible to compute at all, since there was no record of what was
offered.

the fix: persist the agent's original, pre-negotiation decision as a new
`intent` column, captured before the rewrite happens. that one column turns a
single boolean ("did a trade happen") into a three-stage funnel — offered,
accepted, executed — whose two gaps (decline rate, and a separate
unaffordable-after-agreeing rate) are real, previously invisible findings in
their own right.

## the experiment config makes confounded comparisons impossible to write

an experiment config has `conditions` (varying: just a model id) and a
`roster`/`turns`/`startingInventory` that live at the top level, shared by
every condition. a condition literally has no field for agent count or turn
count — so there's no way to accidentally compare "haiku with 3 farmers for
8 turns" against "gpt with 5 miners for 20 turns" and mistake the difference
for a model effect. the schema enforces the experimental design; a confound
isn't caught by review, it's unrepresentable.

one consequence worth being explicit about: every agent within a single run
uses the same model — there's no run where a haiku agent trades with a gpt
agent. the question this answers is whether the model powering an entire
village changes its behavior, not how differently-capable agents behave when
forced to interact. that's a real, different experiment (a third,
mixed-roster condition), not run here.

## statistics: bootstrap, not a t-interval, and "replicates" not "seeds"

each condition is run multiple times (replicates). the mean and 95%
confidence interval over those replicates are computed with a percentile
bootstrap: resample n values with replacement from the n observed values
(same size as the original — that's what makes it a bootstrap rather than
manufactured data), take the mean, repeat 10,000 times, and read the 2.5th
and 97.5th percentile off the resulting distribution of means. this makes no
assumption about the underlying distribution being normal, which matters at
small n — a t-interval's normality assumption is exactly the kind of thing
that's shaky with two or three replicates.

the repeated runs are called replicates, not seeds, on purpose: llm calls at
temperature > 0 aren't reproducible, so a second run of the same condition is
an independent sample from the model's behavior distribution, not a
deterministic rerun. calling them seeds would misdescribe what the statistics
are actually doing.

## the judge metric wasn't run this pass, and that's a deliberate call

the plan included an llm-as-judge metric for exploitation-of-need: did a
proposer offer lopsided terms to a counterparty with visibly low inventory.
the design for it is real — write a rubric precise enough that a stranger
could apply it consistently, hand-label a set of real trade offers alone
(that labeled set is the ground truth, not something an llm helps produce),
run the judge on the same offers, and measure agreement against the hand
labels using cohen's kappa rather than raw percent agreement, because kappa
corrects for the agreement you'd get by chance alone (two labelers who both
say "not exploitative" 90% of the time agree 82% of the time by pure chance).
only if that agreement clears a bar set before looking at full results does
the judge's number get reported.

that whole apparatus wasn't built this pass — an uncalibrated judge is just
an opinion with an api bill, and shipping one without the calibration step
would be worse than not shipping it. the deterministic metrics (gini, trade
funnel, cost, latency) stand on their own without it.

## what's deliberately not here

no live dashboard — this is a batch pipeline (run it, it produces files, it
exits), not a service. a dashboard is a different, larger project for a
question ("how is production behaving right now") this one isn't asking. no
comparison across more than two models yet, no mixed-model rosters, no
price-convergence metric (there's no real market mechanism in the
simulation to measure convergence of). all of these are reasonable
extensions, not omissions — the config-driven design means most of them are
additive, not rewrites.
