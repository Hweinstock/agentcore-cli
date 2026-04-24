import type { DashboardConfig, PageData, SectionData } from './types.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PALETTE = {
  bg: '#0d1117',
  card: '#161b22',
  text: '#e6edf3',
  border: '#30363d',
  dim: '#8b949e',
  accent: '#58a6ff',
  green: '#3fb950',
  red: '#f85149',
  yellow: '#d29922',
  purple: '#bc8cff',
} as const;
const CHART_COLORS = [
  PALETTE.accent,
  PALETTE.green,
  PALETTE.red,
  PALETTE.yellow,
  PALETTE.purple,
  '#f778ba',
  '#79c0ff',
  '#7ee787',
  '#ffa657',
  '#ff7b72',
];

const SCRIPT_CLOSE = '<' + '/script>';

function renderCSS(): string {
  return `<style>
:root{--bg:${PALETTE.bg};--card:${PALETTE.card};--text:${PALETTE.text};--border:${PALETTE.border};--dim:${PALETTE.dim};--accent:${PALETTE.accent};--green:${PALETTE.green};--red:${PALETTE.red};--yellow:${PALETTE.yellow};--purple:${PALETTE.purple}}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;padding:24px;max-width:1400px;margin:0 auto}
h1{font-size:22px;margin-bottom:4px}
.sub{color:var(--dim);font-size:13px;margin-bottom:16px}
nav{display:flex;gap:8px;margin-bottom:20px;padding:8px 12px;background:var(--card);border-radius:8px;border:1px solid var(--border)}
nav a{color:var(--dim);text-decoration:none;padding:6px 14px;border-radius:6px;font-weight:600;font-size:13px}
nav a:hover{color:var(--text);background:rgba(255,255,255,.04)}
nav a.active{color:var(--accent);background:rgba(31,111,235,.12)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px}
.card h2{font-size:14px;color:var(--accent);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border);position:relative}
.wide{grid-column:1/-1}
.row{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:10px}
.st{text-align:center;flex:1;min-width:90px;padding:8px 4px}
.st .v{font-size:26px;font-weight:700;line-height:1.2}
.st .l{font-size:11px;color:var(--dim);margin-top:2px}
.sm .v{font-size:18px}
.green{color:var(--green)}.red{color:var(--red)}.yellow{color:var(--yellow)}.accent{color:var(--accent)}.purple{color:var(--purple)}.dim{color:var(--dim)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--dim);font-weight:600}
td{padding:6px 8px;border-bottom:1px solid #21262d}
tr:hover{background:rgba(255,255,255,.02)}
a{color:var(--accent);text-decoration:none}
.b{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.b-green{background:rgba(63,185,80,.15);color:var(--green)}
.b-red{background:rgba(248,81,73,.15);color:var(--red)}
.b-yellow{background:rgba(210,153,34,.15);color:var(--yellow)}
.b-blue{background:rgba(88,166,255,.15);color:var(--accent)}
.b-dim{background:rgba(139,148,158,.15);color:var(--dim)}
.b-purple{background:rgba(188,140,255,.15);color:var(--purple)}
footer{text-align:center;color:#484f58;font-size:12px;margin-top:24px;padding:16px}
canvas{max-height:300px}
.copy-btn{position:absolute;right:0;top:-2px;background:none;border:none;color:var(--dim);cursor:pointer;font-size:14px;padding:4px 8px;border-radius:4px}
.copy-btn:hover{color:var(--text);background:rgba(255,255,255,.06)}
.copied{color:var(--green)!important}
.tabs{display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:8px}
.tab{background:none;border:none;color:var(--dim);font-size:12px;font-weight:600;padding:4px 12px;border-radius:4px;cursor:pointer}
.tab:hover{color:var(--text);background:rgba(255,255,255,.04)}
.tab.active{color:var(--accent);background:rgba(31,111,235,.12)}
.extra{margin-top:12px}
.extra h4{font-size:13px;color:var(--dim);margin-bottom:8px}
</style>`;
}

function renderClientJS(page: PageData, config: DashboardConfig): string {
  const clientJS = readFileSync(join(__dirname, 'client.ts'), 'utf-8');
  const paletteObj = {
    accent: PALETTE.accent,
    green: PALETTE.green,
    red: PALETTE.red,
    yellow: PALETTE.yellow,
    purple: PALETTE.purple,
    dim: '#484f58',
  };
  const injected = clientJS
    .replace('__DATA__', JSON.stringify(page.sections))
    .replace('__REPO__', JSON.stringify(`https://github.com/${config.repo}`))
    .replace('__CHART_COLORS__', JSON.stringify(CHART_COLORS))
    .replace('__PALETTE__', JSON.stringify(paletteObj));
  return `<script>${injected}${SCRIPT_CLOSE}`;
}

export function renderPage(page: PageData, config: DashboardConfig): string {
  const nav = config.pages
    .map(p => `<a href="${p.id}.html"${p.id === page.id ? ' class="active"' : ''}>${p.title}</a>`)
    .join('');

  const sections = page.sections.map((s, i) => renderSection(s, i)).join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${page.title} — ${config.repo} Dashboard</title>
<script src="chart.js">${SCRIPT_CLOSE}
${renderCSS()}</head><body>
<h1>📊 ${config.repo.split('/')[1]} Dashboard</h1>
<p class="sub">Generated: ${page.generatedAt} · <a href="https://github.com/${config.repo}">${config.repo}</a></p>
<nav>${nav}</nav>
<div class="grid">${sections}</div>
<footer>Data fetched live from GitHub API</footer>
${renderClientJS(page, config)}</body></html>`;
}

const SECTION_INNER: Record<string, (i: number) => string> = {
  stats: i => `<div id="s${i}"></div>`,
  timeline: i => `<div id="s${i}"><canvas></canvas></div>`,
  distribution: i => `<div id="s${i}"><canvas></canvas></div>`,
  histogram: i => `<div id="s${i}"><canvas></canvas></div>`,
  table: i => `<div id="s${i}"><div class="tbl"></div></div>`,
  ci: i => `<div id="s${i}">
      <div class="ci-stats"></div>
      <div class="grid" style="margin-top:16px">
        <div class="card wide"><h2>📈 Pass/Fail Over Time</h2><div class="ci-timeline"><canvas></canvas></div></div>
      </div>
      <div class="grid" style="margin-top:16px">
        <div class="card"><h2>❌ Most Failing Jobs</h2><div class="ci-failing"></div></div>
        <div class="card"><h2>🔄 Flaky Jobs (pass↔fail flips)</h2><div class="ci-flaky"></div></div>
      </div>
      <div class="grid" style="margin-top:16px">
        <div class="card"><h2>🕐 Avg Job Duration</h2><div class="ci-duration"><canvas></canvas></div></div>
        <div class="card"><h2>🔥 Recent Failures</h2><div class="ci-recent"></div></div>
      </div>
    </div>`,
  termFrequency: i => `<div id="s${i}"><div class="tbl"></div><div class="extra"></div></div>`,
};

function renderSection(s: SectionData, i: number): string {
  const c = s.config;
  const wide =
    c.type === 'stats' || c.type === 'timeline' || c.type === 'table' || c.type === 'termFrequency' || c.type === 'ci'
      ? ' wide'
      : '';
  const title = sectionTitle(s);
  const renderInner =
    SECTION_INNER[c.type] ??
    ((idx: number) => `<div id="s${idx}"><div class="tbl"></div><div class="extra"></div></div>`);
  const inner = renderInner(i);
  return `<div class="card${wide}"><h2>${title}<button class="copy-btn">📋</button></h2>${inner}</div>`;
}

function sectionTitle(s: SectionData): string {
  const c = s.config;
  switch (c.type) {
    case 'stats':
      return '📊 Overview';
    case 'timeline':
      return '📈 Activity Over Time';
    case 'distribution':
      return distributionTitle(c.field);
    case 'histogram':
      return c.title ? `⏱️ ${c.title}` : `⏱️ ${c.field}`;
    case 'table':
      return tableIcon(c.id) + ' ' + c.title;
    case 'termFrequency':
      return c.title ?? '🔍 Common Terms in Unlabeled Issues';
    case 'ci':
      return '🧪 CI / Test Health';
  }
}

function distributionTitle(field: string): string {
  const map: Record<string, string> = {
    labels: '🏷️ Issues by Label',
    age: '📅 Open Issue Age',
    sizeLabel: '📏 PR Size Distribution',
    author: '👥 Top Authors',
    bucket: '📊 Open PR Status',
    linkedIssuePriority: '🎯 PR Priority (from linked issues)',
  };
  return map[field] ?? `📊 ${field}`;
}

function tableIcon(id: string): string {
  return id === 'stale' ? '🧊' : id === 'engagement' ? '💬' : '📋';
}
