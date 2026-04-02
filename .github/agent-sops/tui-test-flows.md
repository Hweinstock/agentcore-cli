# TUI Test Flows

Each flow describes a user interaction to verify. The tester agent drives these using the TUI harness MCP tools.

---

## Flow: Help text lists all commands

1. Launch: `agentcore --help` (use `tui_launch` with `command: "agentcore"`, `args: ["--help"]`)
2. Wait for: "Usage:" on screen
3. Expect all of these commands visible: `create`, `deploy`, `invoke`, `status`, `add`, `remove`, `dev`, `logs`
4. Close session

---

## Flow: Add agent then verify status shows local-only

1. Create a project via shell: `agentcore create --name TestStatus --no-agent --json` (in a temp directory)
2. Add an agent via shell:
   `agentcore add agent --name MyAgent --language Python --framework Strands --model-provider Bedrock --json` (in the
   project directory)
3. Launch: `agentcore status` in the project directory (use `tui_launch`)
4. Wait for: the status table to render (look for "MyAgent" or "agent" on screen)
5. Expect: "MyAgent" appears with a "local-only" state
6. Close session
