from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from app.config import settings
from app.schemas.agent import AgentRunResponse, ToolStep


class AgentService:
    def __init__(self):
        self.llm = ChatOpenAI(
            model=settings.model_name,
            base_url=settings.ollama_base_url,
            api_key=settings.ollama_api_key,
            temperature=0.0,
        )

    async def run_agent(self, goal: str) -> AgentRunResponse:
        # 1. Connect to the external MCP Server over SSE
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

        # 3. Build a cyclic LangGraph ReAct Agent with those tools
        agent = create_react_agent(self.llm, tools)

        # 4. Execute the multi-step reasoning + tool loop
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

        # 5. Parse the execution trace into structured steps
        steps: list[ToolStep] = []
        tool_outputs: dict[str, str] = {}

        for msg in result["messages"]:
            if msg.type == "tool":
                tool_outputs[msg.tool_call_id] = str(msg.content)

        for msg in result["messages"]:
            if msg.type == "ai" and getattr(msg, "tool_calls", None):
                for tc in msg.tool_calls:
                    steps.append(
                        ToolStep(
                            tool_name=tc["name"],
                            arguments=tc["args"],
                            output=tool_outputs.get(tc["id"], ""),
                        )
                    )

        final_answer = str(result["messages"][-1].content)
        return AgentRunResponse(
            goal=goal,
            final_answer=final_answer,
            steps_taken=steps,
        )


agent_service = AgentService()