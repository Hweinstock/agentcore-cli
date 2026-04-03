// This file assumes that its run from an environment that already has github and core imported:
// const github = require('@actions/github');
// const core = require('@actions/core');

const fs = require('fs');

async function getIssueInfo(github, repo, inputs, eventName, payload) {
  let issueId;

  if (eventName === 'workflow_dispatch') {
    issueId = inputs.issue_id;
  } else {
    // Handle both issue comments and PR comments
    issueId = (payload.issue?.number || payload.pull_request?.number)?.toString();
  }

  const command =
    eventName === 'workflow_dispatch'
      ? inputs.command
      : payload.comment.body.match(/^\/strands\s*(.*)$/)?.[1]?.trim() || '';

  console.log(`Event: ${eventName}, Issue ID: ${issueId}, Command: "${command}"`);

  const issue = await github.rest.issues.get({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: issueId,
  });

  return { issueId, command, issue };
}

async function determineBranch(github, repo, issueId, mode, isPullRequest) {
  let branchName = 'main';

  if (mode === 'implementer' && !isPullRequest) {
    branchName = `agent-tasks/${issueId}`;

    const mainRef = await github.rest.git.getRef({
      owner: repo.owner,
      repo: repo.repo,
      ref: 'heads/main',
    });

    try {
      await github.rest.git.createRef({
        owner: repo.owner,
        repo: repo.repo,
        ref: `refs/heads/${branchName}`,
        sha: mainRef.data.object.sha,
      });
      console.log(`Created branch ${branchName}`);
    } catch (error) {
      if (error.status === 422 || error.message?.includes('already exists')) {
        console.log(`Branch ${branchName} already exists`);
      } else {
        throw error;
      }
    }
  } else if (isPullRequest) {
    const pr = await github.rest.pulls.get({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: issueId,
    });
    branchName = pr.data.head.ref;
  }

  return branchName;
}

function buildPrompts(mode, issueId, isPullRequest, command, branchName, inputs, repo) {
  const sessionId =
    inputs.session_id ||
    (mode === 'implementer' ? `${mode}-${branchName}`.replace(/[\/\\]/g, '-') : `${mode}-${issueId}`);

  const sopFiles = {
    implementer: '.github/agent-sops/task-implementer.sop.md',
    reviewer: '.github/agent-sops/task-reviewer.sop.md',
    refiner: '.github/agent-sops/task-refiner.sop.md',
    tester: '.github/agent-sops/task-tester.sop.md',
  };
  const scriptFile = sopFiles[mode] || sopFiles.refiner;

  const systemPrompt = fs.readFileSync(scriptFile, 'utf8');

  let prompt = isPullRequest ? 'The pull request id is:' : 'The issue id is:';
  prompt += `${issueId}\n`;
  prompt += `The repository is: ${repo.owner}/${repo.repo}\n`;

  if (mode === 'tester') {
    const flowDescription = command.replace(/^test\s*/, '').trim();
    if (flowDescription) {
      prompt += `Run this ad-hoc test flow: ${flowDescription}\n`;
    } else {
      prompt += `Run all predefined test flows from .github/agent-sops/tui-test-flows.md\n`;
    }
  } else {
    prompt += `${command}\n`;
  }
  prompt += 'review and continue';

  return { sessionId, systemPrompt, prompt };
}

module.exports = async (context, github, core, inputs) => {
  try {
    const repo = inputs.target_repo || { owner: context.repo.owner, repo: context.repo.repo };

    const { issueId, command, issue } = await getIssueInfo(github, repo, inputs, context.eventName, context.payload);

    const isPullRequest = !!issue.data.pull_request;

    const COMMAND_MODES = { test: 'tester', review: 'reviewer', implement: 'implementer' };
    const mode =
      Object.entries(COMMAND_MODES).find(([prefix]) => command.startsWith(prefix))?.[1] ??
      (isPullRequest ? 'implementer' : 'refiner');
    console.log(`Is PR: ${isPullRequest}, Mode: ${mode}`);

    const branchName = await determineBranch(github, repo, issueId, mode, isPullRequest);
    console.log(`Building prompts - mode: ${mode}, issue: ${issueId}, is PR: ${isPullRequest}`);

    const { sessionId, systemPrompt, prompt } = buildPrompts(
      mode,
      issueId,
      isPullRequest,
      command,
      branchName,
      inputs,
      repo
    );

    console.log(`Session ID: ${sessionId}`);
    console.log(`Task prompt: "${prompt}"`);

    core.setOutput('branch_name', branchName);
    core.setOutput('session_id', sessionId);
    core.setOutput('system_prompt', systemPrompt);
    core.setOutput('prompt', prompt);
    core.setOutput('mode', mode);
  } catch (error) {
    const errorMsg = `Failed: ${error.message}`;
    console.error(errorMsg);
    core.setFailed(errorMsg);
  }
};
