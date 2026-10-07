Output harness-export-vhs.gif
Output harness-export-vhs.txt

Require agentcore
Require uv
Require mktemp

Set Shell "bash"
Set FontFamily "DejaVu Sans Mono, Noto Sans Symbols2"
Set FontSize 15
Set Width 1210
Set Height 720
Set Padding 10
Set Framerate 30
Set Theme "Catppuccin Mocha"
Set CursorBlink false
Set TypingSpeed 20ms

Env AGENTCORE_TELEMETRY_DISABLED "1"
Env UV_LINK_MODE "copy"

Hide
Type@0ms `export PS1='> '; unset PROMPT_COMMAND; cd "$(mktemp -d)"; clear`
Enter
Sleep 200ms
Show

Type "agentcore create --name ExportDemo --template empty --skip-install --skip-git"
Enter
Wait+Line@30s /^>\s*$/
Sleep 1s

Type "cd ExportDemo"
Enter
Wait+Line@5s /^>\s*$/

Type `agentcore add harness --name helloWorld --model '{"provider":"bedrock","modelId":"us.amazon.nova-lite-v1:0"}' --system-prompt 'You are a helpful assistant.' --memory '{"mode":"existing","arn":"arn:aws:bedrock-agentcore:us-east-1:111122223333:memory/example-1234567890"}'`
Enter
Wait+Line@30s /^>\s*$/
Sleep 1s

Type "agentcore export harness --name helloWorld"
Enter
Wait+Screen@60s /1 manual follow-up in EXPORT_NOTES[.]md/
Sleep 5s
