import re
from fastapi import HTTPException

BLOCKED_PATTERNS = [
    r"ignore (all )?previous instructions",
    r"reveal your system prompt",
    r"drop table",
    r"bypass security",
]

PII_PATTERNS = {
    "EMAIL": r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+",
    "API_KEY": r"sk-[a-zA-Z0-9]{20,}",
    "PHONE": r"\b\d{10}\b",
}

def validate_input_guardrails(user_text: str) -> str:
    """Block prompt injection attempts and redact PII before sending to LLM."""
    lowered = user_text.lower()
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, lowered):
            raise HTTPException(
                status_code=400,
                detail="Security Guardrail Triggered: Potential prompt injection detected.",
            )

    sanitized = user_text
    for label, regex in PII_PATTERNS.items():
        sanitized = re.sub(regex, f"[REDACTED_{label}]", sanitized)
    return sanitized