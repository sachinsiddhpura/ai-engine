import secrets

# Static dummy users for now — replace with a real identity provider later.
DUMMY_USERS: dict[str, str] = {
    "alice": "alice123",
    "bob": "bob123",
    "admin": "admin123",
}

class AuthService:
    def __init__(self):
        self._tokens: dict[str, str] = {}  # token -> username, in-memory only

    def login(self, username: str, password: str) -> str | None:
        if DUMMY_USERS.get(username) != password:
            return None
        token = secrets.token_hex(16)
        self._tokens[token] = username
        return token

    def logout(self, token: str) -> None:
        self._tokens.pop(token, None)

    def resolve(self, token: str) -> str | None:
        return self._tokens.get(token)


auth_service = AuthService()
