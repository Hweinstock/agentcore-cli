# Harness export recorded with VHS

Recorded with VHS 0.11.0 against the compiled Linux CLI from PR #65.

- [GIF](harness-export-vhs.gif)
- [VHS tape](harness-export.tape)
- [Final frame](harness-export-vhs-final.png)
- [Output comparison](comparison.txt)

The recording includes the live progress spinner, real `uv sync` output, completed steps,
and the compact review-code next step. The final CLI text matches the earlier `agg` recording
after normalizing the temporary project directory. The GIF uses the Catppuccin Mocha theme.

VHS needs `ttyd` and `ffmpeg`. The tape uses DejaVu Sans Mono with Noto Sans Symbols2 as a
fallback for the braille spinner; a missing symbol font produces a missing-glyph box.

To reproduce, place the compiled CLI on `PATH` as `agentcore`, then prepare a fresh fixture:

```sh
agentcore create --name ExportDemo --template empty --skip-install --skip-git --json
cd ExportDemo
agentcore add harness --name helloWorld \
  --model '{"provider":"bedrock","modelId":"us.amazon.nova-lite-v1:0"}' \
  --system-prompt 'You are a helpful assistant.' \
  --memory '{"mode":"existing","arn":"arn:aws:bedrock-agentcore:us-east-1:111122223333:memory/example-1234567890"}' \
  --json
vhs /path/to/harness-export.tape
```

The fixture uses a synthetic memory ARN and creates no AWS resources. Run the tape from a fresh
project each time because export refuses to overwrite an existing runtime.
