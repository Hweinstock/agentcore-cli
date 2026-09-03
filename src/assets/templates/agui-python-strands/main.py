import os

import uvicorn
from strands import Agent, tool
from ag_ui_strands import StrandsAgent, StrandsAgentConfig, create_strands_app
from model.load import load_model


@tool
def add_numbers(a: int, b: int) -> int:
    """Return the sum of two numbers."""
    return a + b


agent = Agent(
    model=load_model(),
    system_prompt="You are a helpful assistant. Use tools when appropriate.",
    tools=[add_numbers],
)

config = StrandsAgentConfig()

agui_agent = StrandsAgent(
    agent=agent, name="{{ name }}", description="A helpful assistant", config=config
)

# create_strands_app publishes the AG-UI endpoint at /invocations and a health
# check at /ping, matching the AgentCore Runtime HTTP service contract on 8080.
app = create_strands_app(agui_agent, path="/invocations", ping_path="/ping")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
