import { readFileSync, writeFileSync } from "node:fs";

type CiRow = Record<string, number | string>;

// one bar per condition + a CI whisker on top, plus a fallback table (the
// contrast validator flagged the aqua tone in light mode, so every chart
// needs a visible-label/table fallback anyway — this covers it)
function barChart(cis: CiRow[], metric: string, title: string, fmt: (v: number) => string): string {
  const W = 420, H = 220, padL = 50, padB = 34, padT = 20, padR = 20;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const colors = ["var(--series-1)", "var(--series-2)"];

  const values = cis.map((r) => ({
    label: String(r.label),
    mean: Number(r[`${metric}_mean`]),
    lo: Number(r[`${metric}_lo`]),
    hi: Number(r[`${metric}_hi`]),
  }));
  const maxVal = Math.max(...values.map((v) => v.hi)) * 1.15 || 1;
  const barW = plotW / values.length / 2;

  const bars = values.map((v, i) => {
    const cx = padL + plotW * ((i + 0.5) / values.length);
    const barH = (v.mean / maxVal) * plotH;
    const y = padT + plotH - barH;
    const hiY = padT + plotH - (v.hi / maxVal) * plotH;
    const loY = padT + plotH - (v.lo / maxVal) * plotH;
    return `
      <rect x="${cx - barW / 2}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${colors[i]}" />
      <line x1="${cx}" y1="${hiY}" x2="${cx}" y2="${loY}" stroke="var(--text-primary)" stroke-width="2" />
      <line x1="${cx - 6}" y1="${hiY}" x2="${cx + 6}" y2="${hiY}" stroke="var(--text-primary)" stroke-width="2" />
      <line x1="${cx - 6}" y1="${loY}" x2="${cx + 6}" y2="${loY}" stroke="var(--text-primary)" stroke-width="2" />
      <text x="${cx}" y="${y - 10}" text-anchor="middle" class="value-label">${fmt(v.mean)}</text>
      <text x="${cx}" y="${H - padB + 20}" text-anchor="middle" class="axis-label">${v.label}</text>
    `;
  }).join("");

  const rows = values.map((v) =>
    `<tr><td>${v.label}</td><td>${fmt(v.mean)}</td><td>${fmt(v.lo)} – ${fmt(v.hi)}</td></tr>`
  ).join("");

  return `
    <div class="chart-block">
      <h3>${title}</h3>
      <svg viewBox="0 0 ${W} ${H}" class="chart">
        <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="var(--text-secondary)" stroke-width="1" />
        ${bars}
      </svg>
      <table class="fallback-table">
        <thead><tr><th>condition</th><th>mean</th><th>95% CI</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const num = (v: number) => v.toFixed(2);
const usd = (v: number) => `$${v.toFixed(4)}`;
const ms = (v: number) => `${Math.round(v)}ms`;

function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error("usage: tsx src/report.ts <manifest.json>");
  const dir = manifestPath.replace(/manifest\.json$/, "");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const cis: CiRow[] = JSON.parse(readFileSync(`${dir}cis.json`, "utf-8"));
  const metrics = JSON.parse(readFileSync(`${dir}metrics.json`, "utf-8"));

  const charts = [
    barChart(cis, "finalGini", "Final Gini (wealth inequality)", num),
    barChart(cis, "offered", "Trade offers made", (v) => v.toFixed(1)),
    barChart(cis, "declineRate", "Decline rate", pct),
    barChart(cis, "unaffordableRate", "Unaffordable-after-agreeing rate", pct),
    barChart(cis, "cost", "Cost per run", usd),
    barChart(cis, "meanLatencyMs", "Mean LLM latency", ms),
  ];

  const appendixRows = metrics.map((r: any) => `
    <tr>
      <td>${r.label}</td><td class="mono">${r.runId.slice(0, 8)}</td>
      <td>${num(r.finalGini)}</td><td>${r.offered}</td><td>${r.accepted}</td><td>${r.executed}</td>
      <td>${usd(r.cost)}</td><td>${ms(r.meanLatencyMs)}</td>
    </tr>`).join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${manifest.experiment.name} — agora-evals report</title>
<style>
  :root {
    color-scheme: light;
    --surface-1: #fcfcfb; --surface-2: #f3f2ef;
    --text-primary: #0b0b0b; --text-secondary: #52514e; --text-muted: #6f6e69;
    --series-1: #2a78d6; --series-2: #1baf7a;
    --border: #e3e1da;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) {
      color-scheme: dark;
      --surface-1: #1a1a19; --surface-2: #232320;
      --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #8f8e86;
      --series-1: #3987e5; --series-2: #199e70;
      --border: #33322d;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --surface-1: #1a1a19; --surface-2: #232320;
    --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #8f8e86;
    --series-1: #3987e5; --series-2: #199e70;
    --border: #33322d;
  }
  body { background: var(--surface-1); color: var(--text-primary); font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 2rem; }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .hypothesis { color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 2rem; max-width: 640px; }
  .legend { display: flex; gap: 1.25rem; margin-bottom: 1.5rem; font-size: 0.85rem; color: var(--text-secondary); }
  .legend span { display: inline-flex; align-items: center; gap: 0.4rem; }
  .swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; }
  .chart-block { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
  .chart-block h3 { margin: 0 0 0.5rem; font-size: 0.95rem; color: var(--text-secondary); font-weight: 600; }
  .chart { width: 100%; height: auto; }
  .value-label { fill: var(--text-primary); font-size: 11px; font-weight: 600; }
  .axis-label { fill: var(--text-secondary); font-size: 11px; }
  table.fallback-table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-size: 0.8rem; }
  table.fallback-table th, table.fallback-table td { text-align: left; padding: 0.25rem 0.5rem; color: var(--text-secondary); }
  table.fallback-table th { color: var(--text-muted); font-weight: 500; border-bottom: 1px solid var(--border); }
  .appendix { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .appendix th, .appendix td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border); }
  .appendix th { color: var(--text-muted); font-weight: 500; }
  .mono { font-family: ui-monospace, monospace; color: var(--text-muted); }
  .limitations { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.25rem; margin-top: 2rem; font-size: 0.85rem; color: var(--text-secondary); }
  .limitations h3 { margin-top: 0; font-size: 0.9rem; color: var(--text-primary); }
  h2 { font-size: 1.1rem; margin: 2rem 0 0.75rem; }
</style>
</head>
<body>
<main>
  <h1>${manifest.experiment.name}</h1>
  <p class="hypothesis">${manifest.experiment.notes ?? ""}</p>
  <div class="legend">
    <span><span class="swatch" style="background:var(--series-1)"></span>${cis[0]?.label}</span>
    <span><span class="swatch" style="background:var(--series-2)"></span>${cis[1]?.label}</span>
  </div>

  <h2>Behavior</h2>
  <div class="grid">${charts[0]}${charts[1]}</div>

  <h2>Trade funnel drop-off</h2>
  <div class="grid">${charts[2]}${charts[3]}</div>

  <h2>Cost &amp; latency</h2>
  <div class="grid">${charts[4]}${charts[5]}</div>

  <h2>Per-run appendix</h2>
  <table class="appendix">
    <thead><tr><th>condition</th><th>run</th><th>final gini</th><th>offered</th><th>accepted</th><th>executed</th><th>cost</th><th>mean latency</th></tr></thead>
    <tbody>${appendixRows}</tbody>
  </table>

  <div class="limitations">
    <h3>Limitations</h3>
    <p>n=${cis[0]?.n ?? "?"} replicates per condition — small sample, CIs describe
    run-to-run noise here, not formal significance (no p-value). Replicates are
    independent samples, not deterministic reruns (LLM calls at temp&gt;0 aren't
    seedable). Judge (exploitation-of-need) not run this pass. Gini uses total
    wealth with labor-cost weights {food:2, ore:3, gold:6}, not gold alone.</p>
  </div>
</main>
</body>
</html>`;

  writeFileSync(`${dir}report.html`, html);
  console.log(`report: ${dir}report.html`);
}

main();
