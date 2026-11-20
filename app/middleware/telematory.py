import json
import logging
import time
import uuid
from fastapi import Request

logger = logging.getLogger("llmops")
logging.basicConfig(level=logging.INFO, format="%(message)s")

async def llmops_tracing_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-Id", str(uuid.uuid4()))
    start = time.perf_counter()

    response = await call_next(request)

    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    log_record = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "trace_id": trace_id,
        "method": request.method,
        "path": request.url.path,
        "status_code": response.status_code,
        "latency_ms": duration_ms,
    }
    logger.info(json.dumps(log_record))
    response.headers["X-Trace-Id"] = trace_id
    return response