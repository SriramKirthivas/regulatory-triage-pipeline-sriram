import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import settings
from .database import engine
from .routers import action_items, anomalies, directives

log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.seed_on_startup:
        # Imported here rather than at module scope so the seed data is only
        # pulled in when it is actually going to be used.
        from seed import seed_if_empty

        try:
            log.info("SEED_ON_STARTUP is set; checking whether the database is empty")
            if seed_if_empty():
                log.info("Database was empty — schema created and seeded")
            else:
                log.info("Database already has data — left untouched")
        except Exception:
            # A failed seed must not stop the app from booting: /api/health stays
            # up, the data routes 500, and the cause is in the logs. Dying here
            # would put the service in a crash loop with nothing to inspect.
            log.exception("Startup seeding failed; continuing without it")
    yield


app = FastAPI(title="Artixio Regulatory Triage API", version="1.0.0", lifespan=lifespan)

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
