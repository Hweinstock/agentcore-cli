# End-to-end integration tests

This directory contains the end-to-end (e2e) integration tests for the `agentcore`
CLI. Unlike the unit tests under `src/`, which exercise handlers and core logic in
process, these tests treat the CLI as a black box: they build the CLI, run it as a
real subprocess, and drive complete customer journeys — creating a project, adding
resources, deploying to a real AWS account, and invoking the deployed resources.
They assert only on what a customer can observe (process exit codes and printed
output) and never reach into the CLI's internals.

## What these tests cover

Each feature has its own file, and each file corresponds to exactly one project.
A single project deploys many resources together in one CloudFormation stack, so
the slow, expensive deploy happens once per file instead of once per resource.

- **`project/runtime.test.ts`** — one project containing a runtime for every
  template the CLI ships, across both CodeZip and Container builds:
  `agent-python`, `agent-python-strands` (zip and container),
  `agent-typescript-strands`, `mcp-python-fastmcp`, `a2a-python-strands`, and
  `agui-python-strands`. The first runtime is scaffolded by `project create`; the
  rest are added with `project add runtime`. HTTP runtimes are invoked with a
  prompt; MCP, A2A, AGUI, and TypeScript runtimes (whose data plane is not a plain
  prompt) are verified by confirming they appear in the deploy output.

- **`project/memory.test.ts`** — one project containing a strands runtime for each
  memory configuration (`none`, `shortTerm`, `longAndShortTerm`). Every runtime is
  invoked; the two memory-backed runtimes must recall a fact stated in an earlier
  turn of the same session.

- **`project/harness.test.ts`** — one project containing several harness
  configurations (a default harness plus tuned variants). Every harness is invoked
  with a prompt.

Every test is a `test.each` row over a plain data table. Adding coverage — a new
template, build type, memory option, or harness setting — means adding a row to the
table at the top of the file, not writing a new test.

## How the tests run the CLI

`helpers/run.ts` exposes a single `run(args, cwd?)` function that spawns the built
CLI (`node dist/index.js`) with the given arguments and returns its stdout, stderr,
and exit code. `helpers/project.ts` wraps a throwaway temp-directory project: it
scaffolds the project with `project create`, exposes a `run` bound to the project
directory, and tears the project down afterward. The tests therefore read as the
literal CLI commands a customer would type, for example:

```ts
project.run(["project", "invoke", "runtime", "--name", "pyzip", "--payload", payload, "--json"]);
```

`helpers/retry.ts` retries an invoke a few times, because a freshly deployed runtime
can cold-start and reject the first request.

## Running the tests

The tests deploy to and invoke real AWS resources, so you need valid AWS
credentials for a test account before running them:

```sh
ada credentials update --account <dev-account> --role Admin --once
export AWS_REGION=us-east-1   # defaults to us-east-1 if unset

bun run test:e2e
```

To run a subset, point `E2E_TEST_PATH` at a file or directory:

```sh
E2E_TEST_PATH=test/project/runtime.test.ts bun run test:e2e
```

`bun run test:e2e` loads `test/preRunCleanup.ts` as a preload. That preload runs
once before any test file and deletes stale `AgentCore-e2e` CloudFormation stacks
left behind by earlier runs that crashed before their teardown. Each test also
tears its own project down (`project remove all` followed by `project deploy`) in
an `afterAll` hook, so a normal run leaves nothing behind; the stale-stack sweep is
the backstop for abnormal exits.

## Continuous integration

`.github/workflows/e2e-test.yml` runs this suite. Given a git reference and a
filepath pattern, it builds the CLI at that reference and runs the matching tests.
It triggers on pushes to `refactor`, can be dispatched manually against any
reference (for example an individual PR) with a custom `test_path`, and is reusable
from other workflows via `workflow_call`. It authorizes runs through the shared
`agentcore-devx-devtools` collaborator check and assumes an AWS role via OIDC from
the repository variable `E2E_ROLE_ARN`.
