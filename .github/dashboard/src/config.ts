import type { DashboardConfig } from './types.js';

export const config: DashboardConfig = {
  repo: 'aws/agentcore-cli',
  outputDir: 'site/dashboard',
  pages: [
    {
      id: 'issues',
      title: 'Issues',
      dataSource: 'issues',
      windows: [
        { label: 'Past 24h', days: 1 },
        { label: 'Past 7 days', days: 7 },
        { label: 'Past 30 days', days: 30 },
      ],
      sections: [
        {
          type: 'stats',
          metrics: [
            'total',
            'open',
            'closed',
            'weeklyRate',
            'unlabeled',
            'unassigned',
            'medianResolution',
            'avgResolution',
            'p90Resolution',
            'completed',
            'notPlanned',
            'duplicates',
          ],
        },
        { type: 'timeline', bucket: 'week', series: ['opened', 'closed', 'cumulativeOpen'] },
        // Row: label pie + age bar
        { type: 'distribution', field: 'labels', chart: 'doughnut' },
        { type: 'distribution', field: 'age', chart: 'bar', orientation: 'horizontal' },
        // Row: open age trend + resolution histogram
        { type: 'trend', title: 'Avg Open Issue Age Over Time (days)', fields: ['openAgeDays'], aggregate: 'avg' },
        {
          type: 'histogram',
          field: 'resolutionHours',
          buckets: [0, 1, 4, 8, 12, 24, 48, 72, 168, 336, 720],
          groupBy: 'labels',
        },
        // Row: top creators + top resolvers
        { type: 'distribution', field: 'author', chart: 'bar', orientation: 'horizontal' },
        { type: 'distribution', field: 'resolver', chart: 'bar', orientation: 'horizontal' },
        // Tables
        {
          type: 'table',
          id: 'engagement',
          title: 'Most Discussed Open Issues',
          filter: { state: 'open' },
          columns: ['number', 'title', 'comments', 'reactions', 'state'],
          limit: 10,
        },
        {
          type: 'table',
          id: 'stale',
          title: 'Stale Open Issues (>14 days, 0 comments)',
          filter: { state: 'open', minAgeDays: 14, maxComments: 0 },
          columns: ['number', 'title', 'age', 'labels'],
          limit: 20,
        },
        { type: 'termFrequency', field: 'title', filter: { labeled: false }, minCount: 3 },
        {
          type: 'weeklyTable',
          title: 'Weekly Summary (recent 8 weeks)',
          metrics: ['opened', 'closed', 'net', 'medianResolution'],
          weeks: 8,
        },
      ],
    },
    {
      id: 'prs',
      title: 'Pull Requests',
      dataSource: 'prs',
      windows: [
        { label: 'Past 24h', days: 1 },
        { label: 'Past 7 days', days: 7 },
        { label: 'Past 30 days', days: 30 },
      ],
      sections: [
        {
          type: 'stats',
          metrics: [
            'total',
            'merged',
            'closedNoMerge',
            'open',
            'drafts',
            'mergeRate',
            'medianTTFR',
            'avgTTFR',
            'p90TTFR',
            'medianTTM',
            'avgTTM',
            'p90TTM',
          ],
        },
        { type: 'timeline', bucket: 'week', series: ['opened', 'merged', 'cumulativeOpen'] },
        // Row: PR status + open age trend
        { type: 'distribution', field: 'bucket', chart: 'doughnut' },
        { type: 'trend', title: 'Avg Open PR Age Over Time (days)', fields: ['openAgeDays'], aggregate: 'avg' },
        // Row: TTFR + TTM histograms
        {
          type: 'histogram',
          field: 'ttfrHours',
          title: 'Time to First Review',
          buckets: [0, 0.25, 0.5, 1, 2, 4, 8, 12, 24, 48, 72, 168],
        },
        {
          type: 'histogram',
          field: 'ttmHours',
          title: 'Time to Merge',
          buckets: [0, 0.25, 0.5, 1, 2, 4, 8, 12, 24, 48, 72, 168],
        },
        // Row: size pie + TTM by size
        { type: 'distribution', field: 'sizeLabel', chart: 'doughnut' },
        {
          type: 'histogram',
          field: 'ttmHours',
          title: 'Time to Merge by Size',
          buckets: [0, 0.25, 0.5, 1, 2, 4, 8, 12, 24, 48, 72, 168],
          groupBy: 'sizeLabel',
        },
        // Row: top authors + top reviewers
        { type: 'distribution', field: 'author', chart: 'bar', orientation: 'horizontal' },
        { type: 'distribution', field: 'reviewer', chart: 'bar', orientation: 'horizontal' },
        // Tables
        {
          type: 'table',
          id: 'stale',
          title: 'Stale Open PRs (>7 days)',
          filter: { state: 'open', minAgeDays: 7 },
          columns: ['number', 'title', 'age', 'author', 'priority', 'lastActivity', 'draft'],
          limit: 15,
        },
        {
          type: 'weeklyTable',
          title: 'Weekly Summary (recent 8 weeks)',
          metrics: ['opened', 'merged', 'net', 'medianTTFR', 'medianTTM'],
          weeks: 8,
        },
      ],
    },
    {
      id: 'ci',
      title: 'CI / Tests',
      dataSource: 'ci',
      sections: [
        {
          type: 'ci',
          workflows: ['Build and Test', 'E2E Tests (Full Suite)', 'E2E Tests'],
          branch: 'main',
          // 900 runs ÷ 3 workflows = 300 per workflow, ~120 failed-run job fetches
          maxRuns: 900,
        },
      ],
    },
  ],
};
