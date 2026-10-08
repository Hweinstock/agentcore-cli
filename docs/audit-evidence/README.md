# Refactor audit verification

The Handlebars 4.7.10 update passes the CI audit and generates a TypeScript agent
using the compiled Linux CLI. The recording shows both commands and their output.

- [Recording](demo.gif)
- [Replay tape](demo.tape)
- [Failing CI job](https://github.com/aws/agentcore-cli/actions/runs/37837354727/job/113517692567)

Run from the repository root with Bun, VHS, ttyd, and ffmpeg installed:

```sh
bun install --frozen-lockfile
bun run compile:linux-x64
AUDIT_DEMO_BIN_DIR=$(mktemp -d /tmp/agentcore-audit-bin.XXXXXX)
ln -s "$PWD/dist/bin/agentcore-linux-x64" "$AUDIT_DEMO_BIN_DIR/agentcore"
PATH="$AUDIT_DEMO_BIN_DIR:$PATH" vhs docs/audit-evidence/demo.tape
```

The tape creates its own temporary project and skips dependency installation and
Git initialization. It does not deploy resources or require AWS credentials.

The existing braces advisory remains excluded by the CI audit script. The update
adds no exclusions. Independent review approved the change and reproduced the
passing audit. Full verification passed: 4,098 tests, typecheck, lint, formatting,
secret scan, frozen installation, bundle, and Linux compile.
