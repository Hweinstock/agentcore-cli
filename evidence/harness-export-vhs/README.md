# Harness export recorded with VHS

Recorded with VHS 0.11.0 against the compiled Linux CLI from PR #2552 at `cb6d67f39`.

- [GIF](harness-export-vhs.gif)
- [VHS tape](harness-export.tape)
- [Final frame](harness-export-vhs-final.png)

The recording shows project creation, adding `helloWorld`, and exporting it. Export includes
the live progress spinner, real `uv sync` output, completed steps, and the compact review-code
next step. The GIF uses the Catppuccin Mocha theme.

The tape creates a fresh temporary directory, an empty project, and the `helloWorld` harness
before exporting it. Only terminal initialization and entering the temporary directory are
hidden; project and harness creation are visible. Each run uses a new directory, so it can be
repeated without an existing project or harness.

To reproduce, put the compiled CLI on `PATH` as `agentcore` and run:

```sh
vhs /path/to/harness-export.tape
```

The tools required are `agentcore`, `uv`, `mktemp`, VHS, `ttyd`, and `ffmpeg`. The tape uses
DejaVu Sans Mono with Noto Sans Symbols2 as a fallback for the braille spinner.

The harness uses a synthetic memory ARN and creates no AWS resources. Generated projects remain
in their temporary directories for inspection.
