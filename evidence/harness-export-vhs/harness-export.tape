Output harness-export-vhs.gif
Output harness-export-vhs.txt

Require agentcore

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
Type@0ms "export PS1='> '; unset PROMPT_COMMAND; clear"
Enter
Sleep 200ms
Show

Type "agentcore export harness --name helloWorld"
Enter
Wait+Screen@60s /agentcore deploy/
Sleep 5s
