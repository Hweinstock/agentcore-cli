# Deploy telemetry verification

From the repository root:

```sh
bun run compile:linux-x64
export PATH="$PWD/dist/bin:$PATH"
cd .github/evidence/deploy-telemetry
vhs demo.tape
```

VHS requires `ttyd` and `ffmpeg`. To verify without recording, run
`python3 verify.py agentcore-linux-x64`.

The script creates a temporary project, enables the local audit sink, and restores the
original CLI configuration afterward. Deploying to a missing target records telemetry
before failing validation, so the demo makes no AWS deployment calls. It checks all 18
counts against independent expectations for empty and populated projects.
