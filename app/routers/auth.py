from fastapi import APIRouter, Header, HTTPException
from app.schemas.auth import LoginRequest, LoginResponse
from app.services.auth_service import auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["Auth (dummy/static)"])

@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest):
    token = auth_service.login(request.username, request.password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return LoginResponse(token=token, username=request.username)

@router.post("/logout")
def logout(authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    auth_service.logout(token)
    return {"status": "ok"}

def get_current_user(authorization: str = Header(...)) -> str:
    token = authorization.removeprefix("Bearer ").strip()
    username = auth_service.resolve(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return username
