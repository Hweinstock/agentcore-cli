# GitHub Dashboard

Config-driven static dashboard for tracking issues, PRs, and CI health. Auto-deployed to GitHub Pages via Actions.

## Quick Start

```bash
cd .github/dashboard
npm install
npx tsx src/generate.ts    # fetches live data, outputs to site/
npx serve site -l 8901     # preview at http://localhost:8901
```

## Project Structure

```
src/
  config.ts     ← declarative dashboard config (pages, sections, metrics)
  types.ts      ← all TypeScript types
  github.ts     ← GitHub API client (REST + GraphQL)
  compute.ts    ← transforms raw data → chart-ready data
  render.ts     ← generates HTML with Chart.js
  generate.ts   ← entry point: fetch → compute → render → write
site/           ← generated output (gitignored)
```

## Adding a Section

Edit `src/config.ts`. Each page has a `sections` array. Available section types:

| Type            | Description                         | Key fields                       |
| --------------- | ----------------------------------- | -------------------------------- |
| `stats`         | Stat cards with time windows        | `metrics`, `windows`             |
| `timeline`      | Weekly bar chart + cumulative line  | `series`                         |
| `distribution`  | Doughnut or bar chart               | `field`, `chart`                 |
| `histogram`     | Bucketed bar chart                  | `field`, `buckets`, `groupBy`    |
| `table`         | Filtered/sorted table               | `filter`, `columns`, `limit`     |
| `termFrequency` | Word frequency from titles          | `field`, `filter`, `minCount`    |
| `ci`            | CI pass rates, failures, flaky jobs | `workflows`, `branch`, `maxRuns` |

Example — add a new chart to the PRs page:

```typescript
{ type: "distribution", field: "author", chart: "bar", orientation: "horizontal" },
```

## Adding a Page

Add an entry to `config.pages` in `src/config.ts`:

```typescript
{
  id: "my-page",
  title: "My Page",
  dataSource: "issues",  // "issues" | "prs" | "ci"
  sections: [ ... ],
}
```

Navigation links are generated automatically.

## Development Workflow

```bash
# Type check
npx tsc --noEmit

# Generate with reduced CI data (faster iteration)
# Set maxRuns to 10 in config.ts, then:
npx tsx src/generate.ts

# Serve and preview
npx serve site -l 8901
```

Full generation takes ~90s (CI job fetching is the bottleneck). For faster iteration, set `maxRuns: 10` in the CI
section config while developing.

## Deployment

Handled automatically by `.github/workflows/dashboard.yml`:

- Triggers on issue/PR events, daily at 6am UTC, or manual dispatch
- Runs `npm ci && npx tsx src/generate.ts`
- Deploys `site/` to GitHub Pages

To enable: Settings → Pages → Source → GitHub Actions.
