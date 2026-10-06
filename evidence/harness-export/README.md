# Harness export verification

Captured from the compiled Linux CLI and the npm bundle on Node 20.20.2.
Projects were created in temporary directories with a sample harness and a synthetic external
memory ARN. Exports installed real Python dependencies with `uv sync`.

- [Screen recording](harness-export.gif): actual terminal progress and final output.
- [Terminal replay](harness-export.cast): the original timed terminal recording.
- [End-to-end output](e2e-output.txt): Node 20 export, JSON, unrelated warnings, and a quiet export.

The terminal flow ran:

```sh
agentcore create --name ExportDemo --template empty --skip-install --skip-git --json
agentcore add harness --name helloWorld \
  --model '{"provider":"bedrock","modelId":"us.amazon.nova-lite-v1:0"}' \
  --system-prompt 'You are a helpful assistant.' \
  --memory '{"mode":"existing","arn":"arn:aws:bedrock-agentcore:us-east-1:111122223333:memory/example-1234567890"}' \
  --json
agentcore export harness --name helloWorld
```

Verification also checked generated code, runtime registration, the lockfile and installed
environment, persisted manual follow-up details, valid JSON without ANSI, and preservation of
unrelated Node warnings. No AWS resources were deployed.
