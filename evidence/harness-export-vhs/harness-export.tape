Output harness-export-vhs.gif
Output harness-export-vhs.txt

Require agentcore
Require uv
Require mktemp

Set Shell "bash"
Set FontFamily "DejaVu Sans Mono, Noto Sans Symbols2"
Set FontSize 15
Set Width 1210
Set Height 567
Set Padding 10
Set Framerate 30
Set Theme "Catppuccin Mocha"
Set CursorBlink false
Set TypingSpeed 20ms

Env AGENTCORE_TELEMETRY_DISABLED "1"
Env UV_LINK_MODE "copy"

Hide
Type@0ms `export PS1='> '; unset PROMPT_COMMAND; cd "$(mktemp -d)"`
Enter
Sleep 200ms

Type@0ms "agentcore create --name ExportDemo --template empty --skip-install --skip-git --json > /dev/null && cd ExportDemo && echo PROJECT_READY"
Enter
Wait+Screen@30s /(?m)^PROJECT_READY\s*$/

Type@0ms `agentcore add harness --name helloWorld --model '{"provider":"bedrock","modelId":"us.amazon.nova-lite-v1:0"}' --system-prompt 'You are a helpful assistant.' --memory '{"mode":"existing","arn":"arn:aws:bedrock-agentcore:us-east-1:111122223333:memory/example-1234567890"}' --json > /dev/null && echo HARNESS_READY`
Enter
Wait+Screen@30s /(?m)^HARNESS_READY\s*$/

Type@0ms "clear"
Enter
Sleep 200ms
Show

Type "agentcore export harness --name helloWorld"
Enter
Wait+Screen@60s /agentcore deploy/
Sleep 5s
