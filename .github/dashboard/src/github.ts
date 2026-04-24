import type { GHIssue, GHPullRequestNode, WorkflowJob, WorkflowRun } from './types.js';
import { execSync } from 'node:child_process';

const EXEC_OPTS = { encoding: 'utf-8' as const, maxBuffer: 50 * 1024 * 1024 };

export function fetchIssues(repo: string): GHIssue[] {
  process.stderr.write(`Fetching issues for ${repo}...\n`);
  const raw = execSync(`gh api --paginate '/repos/${repo}/issues?state=all&per_page=100'`, EXEC_OPTS);
  const items = JSON.parse(raw.trim()) as GHIssue[];
  const issues = items.filter(i => !i.pull_request);
  process.stderr.write(`  Fetched ${issues.length} issues\n`);
  return issues;
}

export function fetchPRs(repo: string): GHPullRequestNode[] {
  const [owner, name] = repo.split('/');
  const prs: GHPullRequestNode[] = [];
  let cursor: string | null = null;
  let page = 0;

  const query = `
    query($cursor: String) {
      repository(owner: "${owner}", name: "${name}") {
        pullRequests(first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
          pageInfo { hasNextPage endCursor }
          nodes {
            number title state createdAt mergedAt closedAt isDraft
            author { login }
            labels(first: 10) { nodes { name } }
            reviews(first: 20) { nodes { author { login } state submittedAt } }
            commits(last: 1) { nodes { commit { committedDate } } }
            closingIssuesReferences(first: 3) { nodes { number labels(first: 5) { nodes { name } } } }
          }
        }
      }
    }`;

  for (;;) {
    page++;
    process.stderr.write(`Fetching PRs page ${page}...\n`);
    const cursorArg = cursor ? `-f cursor="${cursor}"` : '';
    const raw = execSync(`gh api graphql -f query='${query}' ${cursorArg}`, EXEC_OPTS);
    const resp = JSON.parse(raw) as {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: boolean; endCursor: string };
            nodes: GHPullRequestNode[];
          };
        };
      };
    };
    const data = resp.data.repository.pullRequests;
    prs.push(...data.nodes);
    if (!data.pageInfo.hasNextPage) break;
    cursor = data.pageInfo.endCursor;
  }

  const filtered = prs.filter(pr => pr.author?.login !== 'github-actions[bot]');
  process.stderr.write(`  Fetched ${filtered.length} PRs (filtered from ${prs.length})\n`);
  return filtered;
}

interface GHWorkflow {
  id: number;
  name: string;
}
interface GHRunsResponse {
  workflow_runs: { id: number; conclusion: string; created_at: string }[];
}
interface GHJobsResponse {
  jobs: { name: string; conclusion: string; started_at: string; completed_at: string }[];
}

export function fetchCIRuns(repo: string, workflowNames: string[], branch: string, maxRuns: number): WorkflowRun[] {
  process.stderr.write(`Fetching CI runs for ${branch}...\n`);
  const wfList = JSON.parse(
    execSync(`gh api '/repos/${repo}/actions/workflows' --jq '.workflows'`, EXEC_OPTS)
  ) as GHWorkflow[];
  const matched = wfList.filter(w => workflowNames.includes(w.name));
  const runs: WorkflowRun[] = [];
  const perWf = Math.ceil(maxRuns / matched.length);

  for (const wf of matched) {
    process.stderr.write(`  ${wf.name}...\n`);
    let fetched = 0;
    let page = 1;
    while (fetched < perWf) {
      const resp = JSON.parse(
        execSync(
          `gh api '/repos/${repo}/actions/workflows/${wf.id}/runs?branch=${branch}&per_page=100&page=${page}'`,
          EXEC_OPTS
        )
      ) as GHRunsResponse;
      if (resp.workflow_runs.length === 0) break;
      for (const run of resp.workflow_runs) {
        if (fetched >= perWf) break;
        // Only fetch job details for failed runs — success runs don't need them
        let jobs: WorkflowJob[] = [];
        if (run.conclusion === 'failure') {
          const jobsResp = JSON.parse(
            execSync(`gh api '/repos/${repo}/actions/runs/${run.id}/jobs'`, EXEC_OPTS)
          ) as GHJobsResponse;
          jobs = jobsResp.jobs.map(
            (j): WorkflowJob => ({
              name: j.name,
              conclusion: j.conclusion ?? 'in_progress',
              durationMin:
                j.completed_at && j.started_at
                  ? Math.round(((new Date(j.completed_at).getTime() - new Date(j.started_at).getTime()) / 60000) * 10) /
                    10
                  : 0,
            })
          );
        }
        runs.push({
          id: run.id,
          workflowName: wf.name,
          conclusion: run.conclusion ?? 'in_progress',
          created: new Date(run.created_at),
          jobs,
        });
        fetched++;
      }
      process.stderr.write(`    ...${fetched} runs\n`);
      page++;
    }
  }
  process.stderr.write(`  ${runs.length} CI runs fetched\n`);
  return runs;
}
