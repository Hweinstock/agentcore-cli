import { computePage, parseIssues, parsePRs } from './compute.js';
import { config } from './config.js';
import { fetchCIRuns, fetchIssues, fetchPRs } from './github.js';
import { renderPage } from './render.js';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', config.outputDir);

function main(): void {
  mkdirSync(outDir, { recursive: true });

  const rawIssues = fetchIssues(config.repo);
  const issues = parseIssues(rawIssues);

  const rawPRs = fetchPRs(config.repo);
  const prs = parsePRs(rawPRs);

  // Fetch CI runs if any page needs them
  const ciPage = config.pages.find(p => p.dataSource === 'ci');
  const ciSection = ciPage?.sections.find(s => s.type === 'ci');
  const ciRuns = ciSection
    ? fetchCIRuns(config.repo, ciSection.workflows, ciSection.branch, ciSection.maxRuns)
    : undefined;

  for (const page of config.pages) {
    const data = computePage(page, issues, prs, ciRuns);
    const html = renderPage(data, config);
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
