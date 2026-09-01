"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text

from .config import settings
from .db import SessionLocal, engine
from .models import Base, ComplianceDirective
from .routers import action_items, directives, flags, meta
from .schemas import HealthOut, TableStat

logger = logging.getLogger("rtp")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create the schema and, if configured, seed on first boot.

    Auto-seeding exists so a reviewer's first command is `docker compose up` and
    nothing else. It is idempotent — an already-populated database is left alone.
    """
    Base.metadata.create_all(engine)

    if settings.seed_on_startup:
        with SessionLocal() as db:
            already_seeded = db.scalar(select(ComplianceDirective).limit(1)) is not None
        if already_seeded:
            logger.info("Database already contains directives; skipping seed.")
        else:
            from .seed.seed import seed

            logger.info("Empty database detected — running seed.")
            seed()

    yield


app = FastAPI(
    title="Regulatory Intelligence Triage API",
    version="1.0.0",
    description=(
        "Serves simulated regulatory updates to a compliance triage interface. "
        "Every record is normalised on ingest; defects are surfaced as data-quality "
        "flags rather than discarded."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last line of the 'never crash' contract.

    An unexpected failure returns a structured 500 instead of a bare connection
    reset, so the frontend can render an error state rather than a blank table.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "message": "An unexpected error occurred."},
    )


API_VERSION = "1.1.0"

_TABLES = [
    "regulatory_authority",
    "compliance_directive",
    "action_item",
    "data_quality_flag",
    "status_change",
]


@app.get("/health", tags=["meta"], response_model=HealthOut)
def health() -> HealthOut:
    """Liveness plus the diagnostics the API Health screen renders.

    Never raises: an unreachable database is a *reported* state, not a 500, because
    the whole point of this endpoint is to be answerable when things are broken.
    """
    checked_at = datetime.now(timezone.utc)
    started = time.perf_counter()

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            latency_ms = round((time.perf_counter() - started) * 1000, 2)

            tables = [
                TableStat(
                    table=name,
                    rows=conn.execute(
                        text(f"SELECT count(*) FROM {name}")  # noqa: S608 - fixed list
                    ).scalar_one(),
                )
                for name in _TABLES
            ]

            ingest = dict(
                conn.execute(
                    text(
                        "SELECT severity::text, count(*) FROM data_quality_flag "
                        "GROUP BY severity"
                    )
                ).all()
            )

        return HealthOut(
            status="ok",
            database="reachable",
            latency_ms=latency_ms,
            version=API_VERSION,
            checked_at=checked_at,
            tables=tables,
            ingest={k: int(v) for k, v in ingest.items()},
        )
    except Exception:
        logger.exception("Health check failed")
        return HealthOut(
            status="degraded",
            database="unreachable",
            latency_ms=None,
            version=API_VERSION,
            checked_at=checked_at,
        )


app.include_router(directives.router)
app.include_router(action_items.router)
app.include_router(flags.router)
app.include_router(meta.router)
