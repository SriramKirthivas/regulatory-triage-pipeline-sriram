from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import settings
from .database import engine
from .routers import action_items, anomalies, directives

app = FastAPI(title="Artixio Regulatory Triage API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    # Flatten Pydantic errors into something the UI can show inline.
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_failed",
            "issues": [{"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]} for e in exc.errors()],
        },
    )


@app.get("/api/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("select 1"))
    return {"ok": True}


app.include_router(directives.router)
app.include_router(action_items.router)
app.include_router(anomalies.router)
