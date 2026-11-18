from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_api_key: str = "ollama"
    model_name: str = "qwen2.5:7b"
    default_num_ctx: int = 8192
    max_history_messages: int = 10

    # Step 2: RAG Settings
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "enterprise_docs"
    embed_model: str = "nomic-embed-text"
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Step 3: MCP Server Settings
    mcp_server_url: str = "http://127.0.0.1:8001/sse"

settings = Settings()