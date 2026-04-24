import { Page } from './components/index.js';
import { config } from './config.js';
import { fetchCIRuns, fetchIssues, fetchPRs } from './github.js';
import { computePage, parseIssues, parsePRs } from './transform.js';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', config.outputDir);

function main(): void {
  mkdirSync(outDir, { recursive: true });

  // Copy chart.js and charts.js to output dir
  const chartSrc = join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js');
  copyFileSync(chartSrc, join(outDir, 'chart.js'));

  const chartsClientSrc = join(__dirname, '..', 'src', 'charts.ts');
  const chartsClient = readFileSync(chartsClientSrc, 'utf-8')
    // Strip the declare block
    .replace(/^declare const Chart:[\s\S]*?;\n\n/, '')
    // Strip generic type params: <HTMLCanvasElement>, <HTMLElement>, etc.
    .replace(/<\w+>/g, '')
    // Strip type annotations: `: unknown`, `: string`
    .replace(/: (unknown|string)/g, '')
    // Strip `void` before expressions (used for floating promises)
    .replace(/void /g, '');
  writeFileSync(join(outDir, 'charts.js'), chartsClient);

  const rawIssues = fetchIssues(config.repo);
  const issues = parseIssues(rawIssues);

  const rawPRs = fetchPRs(config.repo);
  const prs = parsePRs(rawPRs);

  // Fetch CI runs only if a CI page exists
  const ciPage = config.pages.find(p => p.dataSource === 'ci');
  const ciSection = ciPage?.sections.find(s => s.type === 'ci');
  const ciRuns = ciSection
    ? fetchCIRuns(config.repo, ciSection.workflows, ciSection.branch, ciSection.maxRuns)
    : undefined;

  for (const page of config.pages) {
    const data = computePage(page, issues, prs, ciRuns);
    const markup = renderToStaticMarkup(<Page page={data} config={config} />);
    const html = `<!DOCTYPE html><html lang="en">${markup}</html>`;
    const outPath = join(outDir, `${page.id}.html`);
    writeFileSync(outPath, html);
    console.error(`  → ${outPath}`);
  }

  // Index redirect to first page
  writeFileSync(
    join(outDir, 'index.html'),
    `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${config.pages[0].id}.html"></head></html>`
  );
  console.error(`  → ${join(outDir, 'index.html')}`);
  console.error('Done!');
}

main();
