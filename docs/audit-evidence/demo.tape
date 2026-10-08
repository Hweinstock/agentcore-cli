Output demo.gif
Output demo.txt

Require bun
Require agentcore

Set Width 1100
Set Height 700
Set FontSize 16
Set TypingSpeed 20ms
Set Shell "bash"

Hide
Type "export AGENTCORE_TELEMETRY_DISABLED=1"
Enter
Type "clear"
Enter
Show

Type "bun run audit"
Enter
Wait+Screen@30s /No vulnerabilities found/
Sleep 2s

Type "cd $(mktemp -d /tmp/agentcore-audit-demo.XXXXXX)"
Enter
Type "agentcore create --name AuditDemo --template agent-typescript-strands --skip-install --skip-git --region us-west-2 --json"
Enter
Wait+Screen@30s /"name": "AuditDemo"/
Sleep 2s

Type "test -f AuditDemo/app/agent/main.ts && echo 'TypeScript agent template generated'"
Enter
Wait+Screen@30s /TypeScript agent template generated/
Sleep 3s
