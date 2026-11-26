import json
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path("chat_history.db")

class ChatHistoryService:
    def __init__(self):
        with closing(sqlite3.connect(DB_PATH)) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    extra_json TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def create_conversation(self, username: str, title: str = "New chat") -> str:
        conversation_id = uuid.uuid4().hex
        now = self._now()
        with closing(sqlite3.connect(DB_PATH)) as conn:
            conn.execute(
                "INSERT INTO conversations (id, username, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (conversation_id, username, title, now, now),
            )
            conn.commit()
        return conversation_id

    def owns_conversation(self, conversation_id: str, username: str) -> bool:
        with closing(sqlite3.connect(DB_PATH)) as conn:
            row = conn.execute(
                "SELECT 1 FROM conversations WHERE id = ? AND username = ?",
                (conversation_id, username),
            ).fetchone()
        return row is not None

    def list_conversations(self, username: str) -> list[dict]:
        with closing(sqlite3.connect(DB_PATH)) as conn:
            rows = conn.execute(
                "SELECT id, title, updated_at FROM conversations WHERE username = ? ORDER BY updated_at DESC",
                (username,),
            ).fetchall()
        return [{"id": r[0], "title": r[1], "updated_at": r[2]} for r in rows]

    def get_messages(self, conversation_id: str) -> list[dict]:
        with closing(sqlite3.connect(DB_PATH)) as conn:
            rows = conn.execute(
                "SELECT role, content, extra_json, created_at FROM messages "
                "WHERE conversation_id = ? ORDER BY id ASC",
                (conversation_id,),
            ).fetchall()
        return [
            {
                "role": r[0],
                "content": r[1],
                "extra": json.loads(r[2]) if r[2] else None,
                "created_at": r[3],
            }
            for r in rows
        ]

    def add_message(
        self, conversation_id: str, role: str, content: str, extra: dict | None = None
    ) -> None:
        now = self._now()
        with closing(sqlite3.connect(DB_PATH)) as conn:
            conn.execute(
                "INSERT INTO messages (conversation_id, role, content, extra_json, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (conversation_id, role, content, json.dumps(extra) if extra else None, now),
            )
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conversation_id),
            )
            conn.commit()

    def maybe_set_title(self, conversation_id: str, first_message: str) -> None:
        title = (first_message.strip()[:48] + "…") if len(first_message.strip()) > 48 else first_message.strip()
        if not title:
            return
        with closing(sqlite3.connect(DB_PATH)) as conn:
            row = conn.execute(
                "SELECT title FROM conversations WHERE id = ?", (conversation_id,)
            ).fetchone()
            if row and row[0] == "New chat":
                conn.execute(
                    "UPDATE conversations SET title = ? WHERE id = ?", (title, conversation_id)
                )
                conn.commit()

    def chat_messages_for_llm(self, conversation_id: str) -> list[dict]:
        """Prior turns as {role, content} dicts, ready to feed straight to the LLM."""
        return [
            {"role": m["role"], "content": m["content"]}
            for m in self.get_messages(conversation_id)
            if m["role"] in ("user", "assistant")
        ]

chat_history_service = ChatHistoryService()