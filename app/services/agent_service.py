import logging

from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from app.config import settings
from app.schemas.agent import AgentRunResponse, ToolStep

logger = logging.getLogger(__name__)


class AgentService:
    def __init__(self):
        self.llm = ChatOpenAI(
            model=settings.model_name,
            base_url=settings.ollama_base_url,
            api_key=settings.ollama_api_key,
            temperature=0.0,
        )

    async def run_agent(self, goal: str) -> AgentRunResponse:
        logger.debug("Agent run started | goal=%r", goal)

        # 1. Connect to the external MCP Server over SSE
        logger.debug("Step 1: connecting to MCP server at %s", settings.mcp_server_url)
        mcp_client = MultiServerMCPClient(
            {
                "enterprise_ops": {
                    "url": settings.mcp_server_url,
                    "transport": "sse",
                }
            }
        )

        # 2. Dynamically fetch all tools exposed by the MCP Server
        tools = await mcp_client.get_tools()
        logger.debug("Step 2: fetched %d tool(s): %s", len(tools), [t.name for t in tools])

        # 3. Build a cyclic LangGraph ReAct Agent with those tools
        agent = create_react_agent(self.llm, tools)
        logger.debug("Step 3: ReAct agent built")

        # 4. Execute the multi-step reasoning + tool loop
        logger.debug("Step 4: invoking agent")
        result = await agent.ainvoke(
            {
                "messages": [
                    (
                        "system",
                        "You are an autonomous Site Reliability Engineer. "
                        "Use your MCP tools to inspect services, search documentation, "
                        "and create incident tickets whenever a service is degraded or has >85% CPU.",
                    ),
                    ("user", goal),
                ]
            }
        )
        logger.debug("Step 4: agent returned %d message(s)", len(result["messages"]))

        # 5. Parse the execution trace into structured steps
        steps: list[ToolStep] = []
        tool_outputs: dict[str, str] = {}

        for msg in result["messages"]:
            if msg.type == "tool":
                tool_outputs[msg.tool_call_id] = str(msg.content)

        for msg in result["messages"]:
            if msg.type == "ai" and getattr(msg, "tool_calls", None):
                for tc in msg.tool_calls:
                    logger.debug(
                        "Step 5: tool call %s(%s) -> %s",
                        tc["name"],
                        tc["args"],
                        tool_outputs.get(tc["id"], ""),
                    )
                    steps.append(
                        ToolStep(
                            tool_name=tc["name"],
                            arguments=tc["args"],
                            output=tool_outputs.get(tc["id"], ""),
                        )
                    )

        final_answer = str(result["messages"][-1].content)
        logger.debug("Agent run finished | final_answer=%r", final_answer)
        return AgentRunResponse(
            goal=goal,
            final_answer=final_answer,
            steps_taken=steps,
        )


agent_service = AgentService()