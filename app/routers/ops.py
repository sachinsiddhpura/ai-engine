import sqlite3
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/ops", tags=["Operations & Incidents"])

DB_PATH = Path("ops_data.db")

class ServiceItem(BaseModel):
    name: str
    owner_team: str
    status: str
    cpu_usage: float
    version: str

class IncidentItem(BaseModel):
    id: int
    service_name: str
    severity: str
    description: str
    created_at: str

@router.get("/services", response_model=list[ServiceItem])
def list_services():
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT name, owner_team, status, cpu_usage, version FROM services")
        rows = cur.fetchall()
        conn.close()
        return [
            ServiceItem(
                name=row[0],
                owner_team=row[1],
                status=row[2],
                cpu_usage=row[3],
                version=row[4],
            )
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/incidents", response_model=list[IncidentItem])
def list_incidents():
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT id, service_name, severity, description, created_at FROM incidents ORDER BY id DESC")
        rows = cur.fetchall()
        conn.close()
        return [
            IncidentItem(
                id=row[0],
                service_name=row[1],
                severity=row[2],
                description=row[3],
                created_at=row[4],
            )
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
