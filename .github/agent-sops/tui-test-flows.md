# TUI Test Flows

Each flow describes a user interaction to verify. The tester agent drives these using the TUI harness MCP tools.

All flows use `tui_launch` with `command: "agentcore"` and the appropriate `args`. Use `cols: 100, rows: 24`.

**Important screenshot rule:** Take the SVG screenshot BEFORE the process exits. For commands that exit immediately
(like `--help`), use `tui_wait_for` to wait for expected content, then immediately take the screenshot while the session
is still alive. For interactive wizards, take the screenshot at the most interesting step (e.g. the final confirmation
screen) before pressing the last Enter.

---

## Flow: Help text lists all commands

1. Launch: `agentcore --help`
2. Use `tui_wait_for` to wait for "Usage:" on screen
3. Immediately take SVG screenshot (the session may still be alive briefly after output)
4. Read the screen content
5. Expect all of these commands visible: `create`, `deploy`, `invoke`, `status`, `add`, `remove`, `dev`, `logs`
6. Close session

---

## Flow: Create project with agent via TUI wizard

This flow drives the full interactive create wizard — no `--json` flags.

1. Create a temp directory via `shell`: `mktemp -d`
2. Launch: `agentcore create` with `cwd` set to the temp directory
3. Wait for: "Project name" prompt
4. Type a project name (e.g. `TuiTest`), press Enter
5. Wait for: "Would you like to add an agent" selection
6. Expect: "Yes, add an agent" is visible
7. Press Enter to select "Yes, add an agent"
8. Wait for: "Agent name" prompt inside the Add Agent wizard
9. Accept the default name, press Enter
10. Wait for: "Select agent type" — expect "Create new agent" visible
11. Press Enter to select it
12. Wait for: "Language" step with "Python" visible
13. Press Enter to select Python
14. Continue pressing Enter through remaining steps (Build, Protocol, Framework, Model) accepting defaults
15. When you reach the "Confirm" step, take the SVG screenshot BEFORE pressing the final Enter
16. Press Enter to confirm
17. Wait for the process to exit or a success message
18. Close session
