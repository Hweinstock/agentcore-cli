# TUI Test Flows

---

## Flow: Help text lists all commands

1. Launch: `agentcore --help`
2. Wait for "Usage:" on screen
3. Take SVG screenshot immediately (before the process exits)
4. Verify these commands are visible: `create`, `deploy`, `invoke`, `status`, `add`, `remove`, `dev`, `logs`
5. Close session

---

## Flow: Create project with agent via TUI wizard

1. Create a temp directory via `shell`: `mktemp -d`
2. Launch: `agentcore create` with `cwd` set to the temp directory
3. Wait for "Project name" prompt, type `TuiTest`, press Enter
4. Wait for "Would you like to add an agent" — expect "Yes, add an agent" visible, press Enter
5. Wait for "Agent name" prompt, accept the default, press Enter
6. Wait for "Select agent type" — expect "Create new agent" visible, press Enter
7. Wait for "Language" step — expect "Python" visible, press Enter
8. Continue pressing Enter through remaining steps (Build, Protocol, Framework, Model) accepting defaults
9. At the "Confirm" step, take SVG screenshot, then press Enter
10. Wait for the process to exit or a success message
11. Close session
