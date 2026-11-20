from pydantic import BaseModel, ValidationError
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")

class IncidentPayload(BaseModel):
    severity: str
    team: str
    service: str
    action: str
    auto_page: bool

test_cases = [
    {
        "alert": "HikariPool-1 timeout after 30000ms on payment-service prod-db-01",
        "expected_severity": "P1",
        "expected_team": "DBA_TEAM",
    },
    {
        "alert": "Pod auth-service restarted 6 times due to Exit Code 137 OOMKilled",
        "expected_severity": "P2",
        "expected_team": "AUTH_CORE",
    },
    {
        "alert": "Disk usage on analytics-worker-04 reached 85% on /var/log",
        "expected_severity": "P3",
        "expected_team": "PLATFORM_INFRA",
    },
]

def evaluate_model(model_name: str):
    valid_json = 0
    exact_route = 0

    for tc in test_cases:
        resp = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": "Convert raw production alerts into strict IncidentPayload JSON."},
                {"role": "user", "content": tc["alert"]},
            ],
            temperature=0.0,
        )
        raw = resp.choices[0].message.content or ""
        try:
            parsed = IncidentPayload.model_validate_json(raw)
            valid_json += 1
            if parsed.severity == tc["expected_severity"] and parsed.team == tc["expected_team"]:
                exact_route += 1
        except ValidationError:
            pass

    total = len(test_cases)
    print(f"Model: {model_name}")
    print(f"  JSON Schema Validity: {valid_json}/{total} ({valid_json/total*100:.0f}%)")
    print(f"  Routing Accuracy:     {exact_route}/{total} ({exact_route/total*100:.0f}%)\n")

if __name__ == "__main__":
    evaluate_model("incident-router")
