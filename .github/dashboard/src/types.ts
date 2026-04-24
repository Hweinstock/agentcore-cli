// ── Config types ────────────────────────────────────────────────────

export interface DashboardConfig {
  repo: string;
  outputDir: string;
  pages: PageConfig[];
}

export interface PageConfig {
  id: string;
  title: string;
  dataSource: 'issues' | 'prs' | 'ci';
  sections: SectionConfig[];
}

export type SectionConfig =
  | StatsSection
  | TimelineSection
  | DistributionSection
  | HistogramSection
  | TableSection
  | TermFrequencySection
  | CIStatsSection;

export interface StatsSection {
  type: 'stats';
  metrics: string[];
  windows?: StatsWindow[];
}

export interface StatsWindow {
  label: string;
  days: number;
}

export interface TimelineSection {
  type: 'timeline';
  bucket: 'week';
  series: string[];
}

export interface DistributionSection {
  type: 'distribution';
  field: string;
  chart: 'doughnut' | 'bar';
  orientation?: 'horizontal' | 'vertical';
}

export interface HistogramSection {
  type: 'histogram';
  field: string;
  buckets: number[] | 'auto';
  title?: string;
  groupBy?: string;
}

export interface TableSection {
  type: 'table';
  id: string;
  title: string;
  filter: TableFilter;
  columns: string[];
  limit?: number;
}

export interface TermFrequencySection {
  type: 'termFrequency';
  field: string;
  filter: { labeled: boolean };
  minCount: number;
  title?: string;
}

export interface TableFilter {
  state?: 'open' | 'closed';
  minAgeDays?: number;
  maxComments?: number;
  labeled?: boolean;
}

// ── Raw GitHub API types ────────────────────────────────────────────

export interface GHIssue {
  number: number;
  title: string;
  state: string;
  created_at: string;
  closed_at: string | null;
  labels: { name: string }[];
  assignees: { login: string }[];
  comments: number;
  reactions: { total_count: number };
  state_reason: string | null;
  user: { login: string };
  author_association: string;
  pull_request?: unknown;
}

export interface GHPullRequestNode {
  number: number;
  title: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  isDraft: boolean;
  author: { login: string } | null;
  labels: { nodes: { name: string }[] };
  reviews: { nodes: GHReviewNode[] };
  commits: { nodes: { commit: { committedDate: string } }[] };
  closingIssuesReferences: { nodes: { number: number; labels: { nodes: { name: string }[] } }[] };
}

export interface GHReviewNode {
  author: { login: string } | null;
  state: string;
  submittedAt: string | null;
}

// ── Processed data types ────────────────────────────────────────────

export interface Issue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  created: Date;
  closed: Date | null;
  labels: string[];
  assignees: string[];
  comments: number;
  reactions: number;
  stateReason: string | null;
  author: string;
  authorType: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed';
  created: Date;
  merged: Date | null;
  draft: boolean;
  author: string;
  labels: string[];
  ttfrHours: number | null;
  ttmHours: number | null;
  lastCommitDate: Date | null;
  lastReviewDate: Date | null;
  linkedIssuePriority: string | null;
  bucket: 'needs-re-review' | 'waiting-on-author' | 'needs-initial-review' | 'approved' | 'closed';
}

export interface WeekBucket {
  week: string;
  [series: string]: string | number;
}

export interface StatValue {
  key: string;
  value: string | number;
  color?: 'green' | 'red' | 'yellow' | 'accent' | 'purple' | 'dim';
  sublabel?: string;
}

export interface ChartData {
  labels: string[];
  values: number[];
  colors?: string[];
}

export interface HistogramBucket {
  label: string;
  count: number;
}

export type TableRow = Record<string, string | number | boolean | string[]>;

export interface TermCount {
  term: string;
  count: number;
}

export interface SectionData {
  config: SectionConfig;
  stats?: StatValue[];
  windowedStats?: Record<string, StatValue[]>;
  timeline?: WeekBucket[];
  chart?: ChartData;
  histogram?: HistogramBucket[];
  histogramGrouped?: Record<string, HistogramBucket[]>;
  table?: TableRow[];
  terms?: TermCount[];
  unusedLabels?: string[];
  extraHtml?: string;
  ci?: CIData;
}

export interface PageData {
  id: string;
  title: string;
  generatedAt: string;
  sections: SectionData[];
}

// ── CI types ────────────────────────────────────────────────────────

export interface CIStatsSection {
  type: 'ci';
  workflows: string[];
  branch: string;
  maxRuns: number;
}

export interface CIData {
  overallPassRate: number;
  passRate: Record<string, number>;
  timeline: { week: string; pass: number; fail: number }[];
  failingJobs: { job: string; failures: number; total: number; rate: number }[];
  flaky: { job: string; flipCount: number }[];
  recentFailures: { id: number; workflow: string; date: string; failedJobs: string[] }[];
  avgDuration: Record<string, number>;
  windows: Record<string, { overallPassRate: number; passRate: Record<string, number> }>;
}

export interface WorkflowRun {
  id: number;
  workflowName: string;
  conclusion: string;
  created: Date;
  jobs: WorkflowJob[];
}

export interface WorkflowJob {
  name: string;
  conclusion: string;
  durationMin: number;
}
