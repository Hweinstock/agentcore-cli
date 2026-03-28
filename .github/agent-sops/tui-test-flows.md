# TUI Test Flows

Each flow describes a user interaction to verify. The tester agent drives these using the TUI harness MCP tools.

---

## Flow: Help text lists all subcommands

1. Launch: `agentcore --help` (use `tui_launch` with `command: "agentcore"`, `args: ["--help"]`)
2. Wait for: "Usage:" on screen
3. Expect all of these subcommands visible: `create`, `deploy`, `invoke`, `status`, `logs`, `add`, `remove`
4. Close session

---

## Flow: Create wizard prompts for project name

1. Launch: `agentcore create` (no flags, in a temp directory)
2. Wait for: a prompt asking for the project name (look for "name" or "project")
3. Expect: an input field or prompt is visible
4. Close session (Ctrl+C)

---

## Flow: Create with --json produces valid JSON

1. In a temp directory, run via shell:
   `agentcore create --name TestProj --language Python --framework Strands --model-provider Bedrock --memory none --json`
2. Expect: stdout contains valid JSON with `"success": true` and `"projectPath"`
3. Verify the project directory was created

---

## Flow: Add agent shows framework selection

1. First create a project via shell: `agentcore create --name AgentTest --no-agent --json` (in a temp directory)
2. Launch: `agentcore add agent` in the created project directory
3. Wait for: agent name prompt
4. Type a name, press Enter
5. Wait for: framework or language selection to appear
6. Expect: at least "Strands" and "LangChain_LangGraph" visible as options
7. Close session (Ctrl+C)

---

## Flow: Invalid project name shows error

1. In a temp directory, run via shell:
   `agentcore create --name "123invalid" --language Python --framework Strands --model-provider Bedrock --memory none --json`
2. Expect: exit code is non-zero OR output contains an error about the project name (must start with a letter)
