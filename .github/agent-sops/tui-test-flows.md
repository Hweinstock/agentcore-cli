# TUI Test Flows

Each flow describes a user interaction to verify. The tester agent drives these using the TUI harness MCP tools.

All flows use `tui_launch` with `command: "agentcore"` and the appropriate `args`. Use `cols: 100, rows: 24`.

---

## Flow: Help text lists all commands

1. Launch: `agentcore --help`
2. Wait for: "Usage:" on screen
3. Expect all of these commands visible: `create`, `deploy`, `invoke`, `status`, `add`, `remove`, `dev`, `logs`
4. Close session

---

## Flow: Create project with agent via TUI wizard

This flow drives the full interactive create wizard — no `--json` flags.

1. Create a temp directory via `shell`: `mktemp -d`
2. Launch: `agentcore create` with `cwd` set to the temp directory
3. Wait for: "Project name" prompt
4. Type a project name (e.g. `TuiTest`), press Enter
5. Wait for: "Would you like to add an agent" selection
6. Expect: "Yes, add an agent" is visible and selected (has `❯` marker)
7. Press Enter to select "Yes, add an agent"
8. Wait for: "Agent name" prompt inside the Add Agent wizard
9. Accept the default name or type one, press Enter
10. Wait for: "Select agent type" selection
11. Expect: "Create new agent" is visible
12. Press Enter to select it
13. Wait for: "Language" step with "Python" visible
14. Press Enter to select Python
15. Continue pressing Enter through remaining steps (Build, Protocol, Framework, Model) accepting defaults until you
    reach a "Confirm" or completion screen
16. Expect: the wizard completes — look for a success message or the process exits
17. Close session
