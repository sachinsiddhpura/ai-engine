import sqlite3
from datetime import datetime, timezone
from mcp.server.fastmcp import FastMCP
from qdrant_client import QdrantClient
from openai import OpenAI

# Initialize FastMCP server on port 8001
mcp = FastMCP("EnterpriseOpsMCP", host="127.0.0.1", port=8001)

DB_PATH = "ops_data.db"


def init_db():
    """Seed a local SQLite database with realistic microservice & incident data."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS services (
            name TEXT PRIMARY KEY,
            owner_team TEXT,
            status TEXT,
            cpu_usage REAL,
            version TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_name TEXT,
            severity TEXT,
            description TEXT,
            created_at TEXT
        )
    """)
    cur.executemany(
        "INSERT OR IGNORE INTO services VALUES (?, ?, ?, ?, ?)",
        [
            ("auth-service", "Identity Team", "healthy", 24.5, "v2.4.1"),
            ("payment-gateway", "Checkout Team", "degraded", 91.8, "v3.1.0"),
            ("order-processor", "Fulfillment Team", "healthy", 42.0, "v1.9.3"),
        ],
    )
    conn.commit()
    conn.close()


@mcp.tool()
def get_service_metrics(service_name: str) -> str:
    """Fetch owner team, status, CPU usage, and deployed version for a microservice from SQLite."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT * FROM services WHERE name = ?", (service_name.lower(),))
    row = cur.fetchone()
    conn.close()
    if not row:
        return f"Service '{service_name}' not found in registry."
    return (
        f"Service: {row[0]} | Owner: {row[1]} | Status: {row[2]} | "
        f"CPU: {row[3]}% | Version: {row[4]}"
    )


@mcp.tool()
def create_incident_ticket(service_name: str, severity: str, description: str) -> str:
    """Create a new incident ticket in the SQLite database when a service is degraded or down."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    cur.execute(
        "INSERT INTO incidents (service_name, severity, description, created_at) VALUES (?, ?, ?, ?)",
        (service_name.lower(), severity.upper(), description, now),
    )
    ticket_id = cur.lastrowid
    conn.commit()
    conn.close()
    return f"Incident INC-{ticket_id} created for {service_name} (Severity: {severity.upper()}) at {now}."


@mcp.tool()
def search_knowledge_base(query: str) -> str:
    """Search uploaded PDF architecture/runbook documents in Qdrant vector database."""
    try:
        oai = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
        qdrant = QdrantClient(url="http://localhost:6333")
        emb = oai.embeddings.create(model="nomic-embed-text", input=query).data[0].embedding
        hits = qdrant.query_points(
            collection_name="enterprise_docs",
            query=emb,
            limit=3,
        ).points
        if not hits:
            return "No relevant documents found in Qdrant."
        return "\n---\n".join(
            [f"[{h.payload['source']} p.{h.payload['page']}]: {h.payload['text']}" for h in hits]
        )
    except Exception as e:
        return f"Knowledge base search failed: {str(e)}"


if __name__ == "__main__":
    init_db()
    # Runs MCP server over SSE transport at http://127.0.0.1:8001/sse
    mcp.run(transport="sse")