# {{ Name }}

Lambda-based tools for AgentCore Gateway.

## Tools

- `lookup_ip` - Look up geolocation for an IP address
- `get_random_user` - Generate random user profile
- `fetch_post` - Fetch a post by ID

## Gateway Integration

Tools are invoked via AgentCore Gateway. The tool name is passed in:
`context.client_context.custom["bedrockAgentCoreToolName"]`

Format: `{target_name}___{tool_name}`

## Adding New Tools

1. Define the tool function with the `@tool("tool_name")` decorator
2. Add the tool definition to `mcp-defs.json` in your agentcore project
3. The tool will be automatically routed by the handler
