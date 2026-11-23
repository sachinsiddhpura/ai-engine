import json
import logging
from datetime import datetime, timezone
from openai import AsyncOpenAI
from app.config import settings
from app.schemas.chat import (
    Message,
    MultiTurnChatRequest,
    MultiTurnChatResponse,
    TicketExtraction,
    TokenUsage,
    ToolChatRequest,
    ToolChatResponse,
)

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.client = AsyncOpenAI(
            base_url=settings.ollama_base_url,
            api_key=settings.ollama_api_key,
        )
        # In-memory session store: {session_id: [Message, ...]}
        # (In production, swap this dict for Redis or PostgreSQL)
        self._sessions: dict[str, list[dict]] = {}

    # ---------------------------------------------------------
    # FEATURE 1 & 2: Multi-Turn Memory + Context/Token Tracking
    # ---------------------------------------------------------
    async def chat_with_memory(self, req: MultiTurnChatRequest) -> MultiTurnChatResponse:
        logger.debug("chat_with_memory | session_id=%s message=%r", req.session_id, req.message)

        is_new_session = req.session_id not in self._sessions
        if is_new_session:
            self._sessions[req.session_id] = [
                {"role": "system", "content": req.system_prompt}
            ]
            logger.debug("Step 1: new session created | session_id=%s", req.session_id)
        else:
            logger.debug("Step 1: existing session reused | session_id=%s", req.session_id)

        history = self._sessions[req.session_id]
        history.append({"role": "user", "content": req.message})

        # Sliding window: always keep system prompt [0] + last N messages
        if len(history) > settings.max_history_messages + 1:
            history = [history[0]] + history[-settings.max_history_messages :]
            self._sessions[req.session_id] = history
            logger.debug("Step 2: history trimmed to %d messages", len(history))

        logger.debug("Step 3: calling LLM | model=%s temperature=%s", settings.model_name, req.temperature)
        completion = await self.client.chat.completions.create(
            model=settings.model_name,
            messages=history,
            temperature=req.temperature,
            extra_body={"options": {"num_ctx": settings.default_num_ctx}},
        )

        assistant_reply = completion.choices[0].message.content or ""
        history.append({"role": "assistant", "content": assistant_reply})
        logger.debug("Step 4: assistant replied | reply=%r", assistant_reply)

        usage = TokenUsage(
            prompt_tokens=completion.usage.prompt_tokens if completion.usage else 0,
            completion_tokens=completion.usage.completion_tokens if completion.usage else 0,
            total_tokens=completion.usage.total_tokens if completion.usage else 0,
        )
        logger.debug("Step 5: token usage | %s", usage)

        return MultiTurnChatResponse(
            session_id=req.session_id,
            reply=assistant_reply,
            history_length=len(history),
            usage=usage,
        )

    # ---------------------------------------------------------
    # FEATURE 3: Guaranteed Structured Outputs (JSON Schema)
    # ---------------------------------------------------------
    async def extract_ticket(self, text: str) -> TicketExtraction:
        logger.debug("extract_ticket | Step 1: input text=%r", text)
        completion = await self.client.beta.chat.completions.parse(
            model=settings.model_name,
            messages=[
                {
                    "role": "system",
                    "content": "Extract structured support ticket metadata from the user text.",
                },
                {"role": "user", "content": text},
            ],
            response_format=TicketExtraction,
            temperature=0.0,  # Always 0.0 for deterministic data extraction
            extra_body={"options": {"num_ctx": settings.default_num_ctx}},
        )
        parsed = completion.choices[0].message.parsed
        logger.debug("extract_ticket | Step 2: parsed result=%s", parsed)
        return parsed

    # ---------------------------------------------------------
    # FEATURE 4: Native Tool Calling Loop
    # ---------------------------------------------------------
    def _check_service_health(self, service_name: str) -> str:
        """Actual Python function the LLM can choose to invoke."""
        mock_db = {
            "auth": {"status": "healthy", "latency_ms": 14},
            "payments": {"status": "degraded", "latency_ms": 890, "error_rate": "4.2%"},
            "notifications": {"status": "down", "last_seen": "10 mins ago"},
        }
        result = mock_db.get(
            service_name.lower(),
            {"status": "unknown", "note": f"Service '{service_name}' not found"},
        )
        result["checked_at"] = datetime.now(timezone.utc).isoformat()
        return json.dumps(result)

    async def chat_with_tools(self, req: ToolChatRequest) -> ToolChatResponse:
        logger.debug("chat_with_tools | prompt=%r", req.prompt)

        # 1. Define JSON Schema describing our Python function to the LLM
        tools_schema = [
            {
                "type": "function",
                "function": {
                    "name": "check_service_health",
                    "description": "Check real-time operational health and latency of a backend microservice (e.g., auth, payments, notifications).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "service_name": {
                                "type": "string",
                                "description": "Name of the microservice to check",
                            }
                        },
                        "required": ["service_name"],
                    },
                },
            }
        ]

        messages = [
            {
                "role": "system",
                "content": "You are a DevOps assistant. Use tools when asked about live system status.",
            },
            {"role": "user", "content": req.prompt},
        ]

        # 2. First LLM Call: Decide whether to answer directly or call a tool
        first_response = await self.client.chat.completions.create(
            model=settings.model_name,
            messages=messages,
            tools=tools_schema,
            temperature=0.0,
        )

        response_message = first_response.choices[0].message
        tool_calls = response_message.tool_calls
        executed_tools: list[str] = []
        logger.debug("Step 2: first LLM call | tool_calls_requested=%d", len(tool_calls or []))

        # 3. If the LLM requested tool execution, run the Python code locally
        if tool_calls:
            messages.append(response_message)  # Append the assistant's tool_call request

            for tool_call in tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)

                if fn_name == "check_service_health":
                    tool_output = self._check_service_health(**fn_args)
                    executed_tools.append(f"{fn_name}({fn_args})")
                    logger.debug("Step 3: executed %s(%s) -> %s", fn_name, fn_args, tool_output)

                    # 4. Append the tool's output back into conversation history
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": tool_output,
                        }
                    )

            # 5. Second LLM Call: Synthesize final human-readable answer from tool data
            logger.debug("Step 5: second LLM call to synthesize final answer")
            final_response = await self.client.chat.completions.create(
                model=settings.model_name,
                messages=messages,
                temperature=0.2,
            )
            final_text = final_response.choices[0].message.content or ""
            total_prompt = (first_response.usage.prompt_tokens or 0) + (
                final_response.usage.prompt_tokens or 0
            )
            total_comp = (first_response.usage.completion_tokens or 0) + (
                final_response.usage.completion_tokens or 0
            )
        else:
            logger.debug("Step 3-5: skipped, LLM answered directly without tools")
            final_text = response_message.content or ""
            total_prompt = first_response.usage.prompt_tokens or 0
            total_comp = first_response.usage.completion_tokens or 0

        logger.debug("chat_with_tools | final_text=%r tools_executed=%s", final_text, executed_tools)
        return ToolChatResponse(
            reply=final_text,
            tools_executed=executed_tools,
            usage=TokenUsage(
                prompt_tokens=total_prompt,
                completion_tokens=total_comp,
                total_tokens=total_prompt + total_comp,
            ),
        )

llm_service = LLMService()