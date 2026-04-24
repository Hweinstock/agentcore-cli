import type {
  CIData,
  ChartData,
  GHIssue,
  GHPullRequestNode,
  HistogramBucket,
  Issue,
  PageConfig,
  PageData,
  PullRequest,
  SectionData,
  StatValue,
  TableRow,
  TableSection,
  TermCount,
  WeekBucket,
  WorkflowRun,
} from './types.js';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function percentiles(vals: number[]): { median: number; avg: number; p90: number } {
  if (vals.length === 0) return { median: 0, avg: 0, p90: 0 };
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1] ?? 0;
  return { median, avg, p90 };
}

function weekKey(d: Date): string {
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function ageDays(created: Date): number {
  return (Date.now() - created.getTime()) / MS_PER_DAY;
}

function formatRelativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const hours = diffMs / MS_PER_HOUR;
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function isIssue(item: Issue | PullRequest): item is Issue {
  return 'stateReason' in item;
}

// ── Parsers ─────────────────────────────────────────────────────────

export function parseIssues(raw: GHIssue[]): Issue[] {
  return raw
    .filter(r => !r.pull_request)
    .map(r => ({
      number: r.number,
      title: r.title,
      state: r.state.toLowerCase() as 'open' | 'closed',
      created: new Date(r.created_at),
      closed: r.closed_at ? new Date(r.closed_at) : null,
      labels: r.labels.map(l => l.name),
      assignees: r.assignees.map(a => a.login),
      comments: r.comments,
      reactions: r.reactions.total_count,
      stateReason: r.state_reason,
      author: r.user.login,
      authorType: r.author_association,
    }));
}

export function parsePRs(raw: GHPullRequestNode[]): PullRequest[] {
  return raw.map(r => {
    const created = new Date(r.createdAt);
    const sortedReviews = r.reviews.nodes
      .filter(rv => rv.submittedAt)
      .sort((a, b) => new Date(a.submittedAt!).getTime() - new Date(b.submittedAt!).getTime());
    const firstReview = sortedReviews[0];
    const lastReview = sortedReviews[sortedReviews.length - 1];
    const ttfrHours = firstReview?.submittedAt
      ? (new Date(firstReview.submittedAt).getTime() - created.getTime()) / MS_PER_HOUR
      : null;
    const ttmHours = r.mergedAt ? (new Date(r.mergedAt).getTime() - created.getTime()) / MS_PER_HOUR : null;
    const lastCommitNode = r.commits.nodes[0];
    const lastCommitDate = lastCommitNode ? new Date(lastCommitNode.commit.committedDate) : null;
    const lastReviewDate = lastReview?.submittedAt ? new Date(lastReview.submittedAt) : null;
    const priorityRank: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, bug: 4, enhancement: 5 };
    let linkedIssuePriority: string | null = null;
    let bestRank = Infinity;
    for (const issue of r.closingIssuesReferences.nodes) {
      for (const l of issue.labels.nodes) {
        for (const [prefix, rank] of Object.entries(priorityRank)) {
          if (l.name.startsWith(prefix) && rank < bestRank) {
            linkedIssuePriority = l.name;
            bestRank = rank;
          }
        }
      }
    }
    const allApproved = sortedReviews.length > 0 && sortedReviews.every(rv => rv.state === 'APPROVED');
    const state: 'open' | 'closed' = r.state === 'OPEN' ? 'open' : 'closed';
    let bucket: PullRequest['bucket'];
    if (state === 'closed') {
      bucket = 'closed';
    } else if (!lastReviewDate) {
      bucket = 'needs-initial-review';
    } else if (lastCommitDate && lastCommitDate > lastReviewDate) {
      bucket = 'needs-re-review';
    } else if (allApproved) {
      bucket = 'approved';
    } else {
      bucket = 'waiting-on-author';
    }
    return {
      number: r.number,
      title: r.title,
      state,
      created,
      merged: r.mergedAt ? new Date(r.mergedAt) : null,
      draft: r.isDraft,
      author: r.author?.login ?? 'ghost',
      labels: r.labels.nodes.map(l => l.name),
      ttfrHours,
      ttmHours,
      lastCommitDate,
      lastReviewDate,
      linkedIssuePriority,
      bucket,
    };
  });
}

// ── Stats ───────────────────────────────────────────────────────────

function computeStats(metrics: string[], items: (Issue | PullRequest)[]): StatValue[] {
  const issues = items.filter(isIssue);
  const prs = items.filter((i): i is PullRequest => !isIssue(i));

  const resolutionHours = issues
    .filter(i => i.closed)
    .map(i => (i.closed!.getTime() - i.created.getTime()) / MS_PER_HOUR);
  const resPct = percentiles(resolutionHours);

  const ttfrVals = prs.map(p => p.ttfrHours).filter((v): v is number => v !== null);
  const ttmVals = prs.map(p => p.ttmHours).filter((v): v is number => v !== null);
  const ttfrPct = percentiles(ttfrVals);
  const ttmPct = percentiles(ttmVals);

  const fourWeeksAgo = Date.now() - 28 * MS_PER_DAY;
  const recentClosed = issues.filter(i => i.closed && i.closed.getTime() > fourWeeksAgo).length;

  const lookup: Record<string, () => StatValue> = {
    total: () => ({ key: 'Total', value: items.length }),
    open: () => ({ key: 'Open', value: items.filter(i => i.state === 'open').length, color: 'green' }),
    closed: () => ({ key: 'Closed', value: items.filter(i => i.state === 'closed').length }),
    weeklyRate: () => ({ key: 'Weekly Close Rate', value: +(recentClosed / 4).toFixed(1), sublabel: 'last 4 weeks' }),
    unlabeled: () => ({ key: 'Unlabeled', value: issues.filter(i => i.labels.length === 0).length, color: 'yellow' }),
    unassigned: () => ({
      key: 'Unassigned',
      value: issues.filter(i => i.assignees.length === 0).length,
      color: 'yellow',
    }),
    medianResolution: () => ({ key: 'Median Resolution', value: formatHours(resPct.median) }),
    avgResolution: () => ({ key: 'Avg Resolution', value: formatHours(resPct.avg) }),
    p90Resolution: () => ({ key: 'P90 Resolution', value: formatHours(resPct.p90), color: 'red' }),
    completed: () => ({
      key: 'Completed',
      value: issues.filter(i => i.stateReason === 'completed').length,
      color: 'green',
    }),
    notPlanned: () => ({
      key: 'Not Planned',
      value: issues.filter(i => i.stateReason === 'not_planned').length,
      color: 'dim',
    }),
    duplicates: () => ({ key: 'Duplicates', value: issues.filter(i => i.stateReason === 'duplicate').length }),
    merged: () => ({ key: 'Merged', value: prs.filter(p => p.merged).length, color: 'purple' }),
    closedNoMerge: () => ({
      key: 'Closed (no merge)',
      value: prs.filter(p => p.state === 'closed' && !p.merged).length,
      color: 'red',
    }),
    drafts: () => ({ key: 'Drafts', value: prs.filter(p => p.draft).length }),
    mergeRate: () => {
      const closed = prs.filter(p => p.state === 'closed').length;
      const rate = closed > 0 ? (prs.filter(p => p.merged).length / closed) * 100 : 0;
      return { key: 'Merge Rate', value: `${rate.toFixed(0)}%`, color: 'accent' };
    },
    medianTTFR: () => ({ key: 'Median TTFR', value: formatHours(ttfrPct.median) }),
    avgTTFR: () => ({ key: 'Avg TTFR', value: formatHours(ttfrPct.avg) }),
    p90TTFR: () => ({ key: 'P90 TTFR', value: formatHours(ttfrPct.p90), color: 'red' }),
    medianTTM: () => ({ key: 'Median TTM', value: formatHours(ttmPct.median) }),
    avgTTM: () => ({ key: 'Avg TTM', value: formatHours(ttmPct.avg) }),
    p90TTM: () => ({ key: 'P90 TTM', value: formatHours(ttmPct.p90), color: 'red' }),
  };

  return metrics.map(m => lookup[m]?.() ?? { key: m, value: 'N/A' });
}

// ── Timeline ────────────────────────────────────────────────────────

function computeTimeline(_bucket: 'week', series: string[], items: (Issue | PullRequest)[]): WeekBucket[] {
  const weeks = new Map<string, WeekBucket>();
  const ensure = (w: string) => {
    if (!weeks.has(w)) {
      const b: WeekBucket = { week: w };
      for (const s of series) b[s] = 0;
      weeks.set(w, b);
    }
    return weeks.get(w)!;
  };

  for (const item of items) {
    const w = ensure(weekKey(item.created));
    if (series.includes('opened')) (w.opened as number)++;

    const closedDate = isIssue(item) ? item.closed : 'merged' in item ? item.merged : null;
    if (closedDate) {
      const cw = ensure(weekKey(closedDate));
      if (series.includes('closed')) (cw.closed as number)++;
      if (series.includes('merged') && !isIssue(item) && item.merged) {
        (cw.merged as number)++;
      }
    }
  }

  const sorted = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
  let cumulative = 0;
  return sorted.map(([, b]) => {
    cumulative += ((b.opened as number) ?? 0) - ((b.closed as number) ?? 0) - ((b.merged as number) ?? 0);
    if (series.includes('cumulativeOpen')) b.cumulativeOpen = Math.max(0, cumulative);
    return b;
  });
}

// ── Distribution ────────────────────────────────────────────────────

function computeDistribution(field: string, items: (Issue | PullRequest)[]): ChartData {
  const counts = new Map<string, number>();
  const inc = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);

  if (field === 'labels') {
    let unlabeled = 0;
    for (const item of items) {
      if (item.labels.length === 0) {
        unlabeled++;
        continue;
      }
      for (const l of item.labels) inc(l);
    }
    if (unlabeled > 0) counts.set('(unlabeled)', unlabeled);
  } else if (field === 'age') {
    const bucketNames = ['<1d', '1-3d', '3-7d', '1-2w', '2-4w', '1-2m', '>2m'];
    const thresholds = [1, 3, 7, 14, 28, 60];
    for (const b of bucketNames) counts.set(b, 0);
    for (const item of items.filter(i => i.state === 'open')) {
      const d = ageDays(item.created);
      const idx = thresholds.findIndex(t => d < t);
      inc(bucketNames[idx === -1 ? bucketNames.length - 1 : idx]);
    }
  } else if (field === 'sizeLabel') {
    for (const item of items) {
      const sizeLabel = item.labels.find(l => l.startsWith('size/'));
      inc(sizeLabel ?? '(no size label)');
    }
  } else if (field === 'author') {
    for (const item of items) inc(item.author);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    return { labels: sorted.map(([l]) => l), values: sorted.map(([, v]) => v) };
  } else if (field === 'bucket') {
    for (const item of items) {
      if (item.state === 'open' && !isIssue(item)) inc(item.bucket);
    }
  } else if (field === 'linkedIssuePriority') {
    for (const item of items) {
      if (!isIssue(item)) inc(item.linkedIssuePriority ?? '(none)');
    }
  }

  const entries = [...counts.entries()];
  return { labels: entries.map(([l]) => l), values: entries.map(([, v]) => v) };
}

// ── Histogram ───────────────────────────────────────────────────────

function extractNumericField(field: string, item: Issue | PullRequest): number | null {
  if (field === 'resolutionHours' && isIssue(item) && item.closed) {
    return (item.closed.getTime() - item.created.getTime()) / MS_PER_HOUR;
  }
  if (field === 'ttfrHours' && !isIssue(item)) return item.ttfrHours;
  if (field === 'ttmHours' && !isIssue(item)) return item.ttmHours;
  return null;
}

function bucketLabel(low: number, high: number | undefined): string {
  if (high === undefined) return `>${formatHours(low)}`;
  return `${formatHours(low)}-${formatHours(high)}`;
}

function buildHistogram(values: number[], buckets: number[]): HistogramBucket[] {
  const result: HistogramBucket[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const low = buckets[i];
    const high = buckets[i + 1];
    const label = i === 0 ? `<${formatHours(high ?? low)}` : bucketLabel(low, high);
    const count = values.filter(v => (high !== undefined ? v >= low && v < high : v >= low)).length;
    result.push({ label, count });
  }
  return result;
}

function autoBuckets(values: number[]): number[] {
  if (values.length === 0) return [0];
  const sorted = [...values].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1];
  const step = max / 8;
  return Array.from({ length: 9 }, (_, i) => +(i * step).toFixed(1));
}

function getSizeLabel(item: Issue | PullRequest): string {
  return item.labels.find(l => l.startsWith('size/')) ?? '(no size label)';
}

function computeHistogram(
  field: string,
  buckets: number[] | 'auto',
  items: (Issue | PullRequest)[],
  groupBy?: string
): { histogram?: HistogramBucket[]; histogramGrouped?: Record<string, HistogramBucket[]> } {
  if (groupBy) {
    const groups = new Map<string, number[]>();
    for (const item of items) {
      const v = extractNumericField(field, item);
      if (v === null) continue;
      const key =
        groupBy === 'sizeLabel' ? getSizeLabel(item) : groupBy === 'labels' ? (item.labels[0] ?? '(unlabeled)') : 'all';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(v);
    }
    const result: Record<string, HistogramBucket[]> = {};
    for (const [key, vals] of groups) {
      const b = buckets === 'auto' ? autoBuckets(vals) : buckets;
      result[key] = buildHistogram(vals, b);
    }
    return { histogramGrouped: result };
  }

  const values = items.map(i => extractNumericField(field, i)).filter((v): v is number => v !== null);
  const b = buckets === 'auto' ? autoBuckets(values) : buckets;
  return { histogram: buildHistogram(values, b) };
}

// ── Table ───────────────────────────────────────────────────────────

function computeTable(config: TableSection, items: (Issue | PullRequest)[]): TableRow[] {
  let filtered = [...items];
  const { filter } = config;

  if (filter.state) filtered = filtered.filter(i => i.state === filter.state);
  if (filter.minAgeDays !== undefined) filtered = filtered.filter(i => ageDays(i.created) >= filter.minAgeDays!);
  if (filter.maxComments !== undefined)
    filtered = filtered.filter(i => isIssue(i) && i.comments <= filter.maxComments!);
  if (filter.labeled === true) filtered = filtered.filter(i => i.labels.length > 0);
  if (filter.labeled === false) filtered = filtered.filter(i => i.labels.length === 0);

  if (config.id === 'stale') {
    filtered.sort((a, b) => a.created.getTime() - b.created.getTime());
  } else if (config.id === 'engagement') {
    filtered.sort((a, b) => {
      const ac = isIssue(a) ? a.comments : 0;
      const bc = isIssue(b) ? b.comments : 0;
      return bc - ac;
    });
  }

  return filtered.slice(0, config.limit ?? 20).map(item => {
    const row: TableRow = {};
    for (const col of config.columns) {
      if (col === 'number') row[col] = item.number;
      else if (col === 'title') row[col] = item.title;
      else if (col === 'state') row[col] = item.state;
      else if (col === 'labels') row[col] = item.labels;
      else if (col === 'author') row[col] = item.author;
      else if (col === 'age') row[col] = `${Math.floor(ageDays(item.created))}d`;
      else if (col === 'comments' && isIssue(item)) row[col] = item.comments;
      else if (col === 'reactions' && isIssue(item)) row[col] = item.reactions;
      else if (col === 'draft' && !isIssue(item)) row[col] = item.draft;
      else if (col === 'priority' && !isIssue(item)) row[col] = item.linkedIssuePriority ?? '';
      else if (col === 'bucket' && !isIssue(item)) row[col] = item.bucket;
      else if (col === 'lastActivity' && !isIssue(item)) {
        const pr = item;
        const latest = [pr.lastCommitDate, pr.lastReviewDate]
          .filter((d): d is Date => d !== null)
          .sort((a, b) => b.getTime() - a.getTime())[0];
        row[col] = latest ? formatRelativeTime(latest) : '';
      }
    }
    return row;
  });
}

// ── Term Frequency ──────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'had',
  'her',
  'was',
  'one',
  'our',
  'out',
  'has',
  'have',
  'been',
  'from',
  'this',
  'that',
  'with',
  'they',
  'will',
  'each',
  'make',
  'like',
  'into',
  'them',
  'then',
  'than',
  'its',
  'also',
  'after',
  'should',
  'would',
  'could',
  'when',
  'what',
  'which',
  'their',
  'about',
  'other',
  'there',
  'does',
  'just',
  'more',
]);

function computeTermFrequency(
  _field: string,
  filter: { labeled: boolean },
  minCount: number,
  items: Issue[]
): { terms: TermCount[]; unusedLabels: string[] } {
  const filtered = filter.labeled ? items.filter(i => i.labels.length > 0) : items.filter(i => i.labels.length === 0);

  const wordCounts = new Map<string, number>();
  for (const item of filtered) {
    const words = item.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/);
    for (const w of words) {
      if (w.length < 3 || STOP_WORDS.has(w)) continue;
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
  }

  const terms = [...wordCounts.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term, count]) => ({ term, count }));

  const usedLabels = new Set(filtered.flatMap(i => i.labels));
  const allLabels = new Set(items.flatMap(i => i.labels));
  const unusedLabels = [...allLabels].filter(l => !usedLabels.has(l));

  return { terms, unusedLabels };
}

// ── Page Computation ────────────────────────────────────────────────

export function computePage(
  pageConfig: PageConfig,
  issues: Issue[],
  prs: PullRequest[],
  ciRuns?: WorkflowRun[]
): PageData {
  const items: (Issue | PullRequest)[] = pageConfig.dataSource === 'issues' ? issues : prs;

  const sections: SectionData[] = pageConfig.sections.map((sec): SectionData => {
    switch (sec.type) {
      case 'stats': {
        const result: SectionData = { config: sec, stats: computeStats(sec.metrics, items) };
        if (sec.windows) {
          const now = new Date();
          result.windowedStats = {};
          for (const w of sec.windows) {
            const cutoff = new Date(now.getTime() - w.days * MS_PER_DAY);
            const filtered = items.filter(i => i.created >= cutoff);
            result.windowedStats[w.label] = computeStats(sec.metrics, filtered);
          }
        }
        return result;
      }
      case 'timeline':
        return { config: sec, timeline: computeTimeline(sec.bucket, sec.series, items) };
      case 'distribution':
        return { config: sec, chart: computeDistribution(sec.field, items) };
      case 'histogram': {
        const h = computeHistogram(sec.field, sec.buckets, items, sec.groupBy);
        return { config: sec, ...h };
      }
      case 'table':
        return { config: sec, table: computeTable(sec, items) };
      case 'termFrequency': {
        const tf = computeTermFrequency(sec.field, sec.filter, sec.minCount, items as Issue[]);
        return { config: sec, terms: tf.terms, unusedLabels: tf.unusedLabels };
      }
      case 'ci':
        return { config: sec, ci: computeCI(ciRuns ?? []) };
    }
  });

  return {
    id: pageConfig.id,
    title: pageConfig.title,
    generatedAt: new Date().toISOString(),
    sections,
  };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) (result[keyFn(item)] ??= []).push(item);
  return result;
}

function calcPassRates(runs: WorkflowRun[]): { overall: number; perWf: Record<string, number> } {
  const overall =
    runs.length > 0 ? Math.round((runs.filter(r => r.conclusion === 'success').length / runs.length) * 100) : 0;
  const perWf: Record<string, number> = {};
  for (const [name, wfRuns] of Object.entries(groupBy(runs, r => r.workflowName))) {
    perWf[name] =
      wfRuns.length > 0 ? Math.round((wfRuns.filter(r => r.conclusion === 'success').length / wfRuns.length) * 100) : 0;
  }
  return { overall, perWf };
}

function buildCITimeline(runs: WorkflowRun[]): CIData['timeline'] {
  const sorted = [...runs].sort((a, b) => a.created.getTime() - b.created.getTime());
  const start =
    sorted.length > 0 ? new Date(sorted[0].created.getTime() - sorted[0].created.getDay() * MS_PER_DAY) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = sorted.length > 0 ? sorted[sorted.length - 1].created : new Date();
  const timeline: CIData['timeline'] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const nxt = new Date(cur.getTime() + 7 * MS_PER_DAY);
    const weekRuns = runs.filter(r => r.created >= cur && r.created < nxt);
    timeline.push({
      week: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      pass: weekRuns.filter(r => r.conclusion === 'success').length,
      fail: weekRuns.filter(r => r.conclusion === 'failure').length,
    });
    cur.setTime(nxt.getTime());
  }
  return timeline;
}

function findFailingJobs(runs: WorkflowRun[]): CIData['failingJobs'] {
  const jobStats: Record<string, { failures: number; total: number }> = {};
  for (const r of runs) {
    for (const j of r.jobs) {
      if (j.conclusion === 'skipped') continue;
      const s = (jobStats[j.name] ??= { failures: 0, total: 0 });
      s.total++;
      if (j.conclusion === 'failure') s.failures++;
    }
  }
  return Object.entries(jobStats)
    .filter(([, s]) => s.failures > 0)
    .map(([job, s]) => ({ job, failures: s.failures, total: s.total, rate: Math.round((s.failures / s.total) * 100) }))
    .sort((a, b) => b.failures - a.failures);
}

function detectFlakyJobs(runs: WorkflowRun[]): CIData['flaky'] {
  const flaky: CIData['flaky'] = [];
  for (const wfRuns of Object.values(groupBy(runs, r => r.workflowName))) {
    const chronological = [...wfRuns].sort((a, b) => a.created.getTime() - b.created.getTime());
    const jobHistory: Record<string, string[]> = {};
    for (const r of chronological) {
      for (const j of r.jobs) {
        if (j.conclusion === 'skipped') continue;
        (jobHistory[j.name] ??= []).push(j.conclusion);
      }
    }
    for (const [job, history] of Object.entries(jobHistory)) {
      let flips = 0;
      for (let i = 1; i < history.length; i++) {
        if (history[i] !== history[i - 1]) flips++;
      }
      if (flips >= 3) {
        const existing = flaky.find(f => f.job === job);
        if (existing) existing.flipCount += flips;
        else flaky.push({ job, flipCount: flips });
      }
    }
  }
  return flaky.sort((a, b) => b.flipCount - a.flipCount);
}

function getRecentFailures(runs: WorkflowRun[]): CIData['recentFailures'] {
  return runs
    .filter(r => r.conclusion === 'failure')
    .sort((a, b) => b.created.getTime() - a.created.getTime())
    .slice(0, 20)
    .map(r => ({
      id: r.id,
      workflow: r.workflowName,
      date: r.created.toISOString().slice(0, 16).replace('T', ' '),
      failedJobs: r.jobs.filter(j => j.conclusion === 'failure').map(j => j.name),
    }));
}

function calcAvgDuration(runs: WorkflowRun[]): Record<string, number> {
  const jobDurations: Record<string, number[]> = {};
  for (const r of runs) {
    for (const j of r.jobs) {
      if (j.durationMin > 0) (jobDurations[j.name] ??= []).push(j.durationMin);
    }
  }
  const result: Record<string, number> = {};
  for (const [job, durations] of Object.entries(jobDurations)) {
    result[job] = Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10;
  }
  return result;
}

function calcCIWindows(runs: WorkflowRun[]): CIData['windows'] {
  return Object.fromEntries(
    [
      ['Past 24h', 1],
      ['Past 7 days', 7],
      ['Past 30 days', 30],
    ].map(([label, days]) => {
      const cutoff = new Date(Date.now() - (days as number) * MS_PER_DAY);
      const subset = runs.filter(r => r.created >= cutoff);
      const rates = calcPassRates(subset);
      return [label, { overallPassRate: rates.overall, passRate: rates.perWf }];
    })
  );
}

function computeCI(runs: WorkflowRun[]): CIData {
  const { overall: overallPassRate, perWf: passRate } = calcPassRates(runs);
  return {
    overallPassRate,
    passRate,
    timeline: buildCITimeline(runs),
    failingJobs: findFailingJobs(runs),
    flaky: detectFlakyJobs(runs),
    recentFailures: getRecentFailures(runs),
    avgDuration: calcAvgDuration(runs),
    windows: calcCIWindows(runs),
  };
}
