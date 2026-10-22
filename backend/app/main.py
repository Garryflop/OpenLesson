import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app import defaults, i18n
from app.config import BASE_DIR, DEV_SECRET, settings
from app.db import SessionLocal, init_db
from app.routers import admin, analytics, attendance, auth, feedback, lessons, materials, notifications, users, years
from app.services import app_settings, scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.is_production and (settings.secret_key == DEV_SECRET or settings.dev_login_enabled):
        raise RuntimeError("Production: set SECRET_KEY and disable DEV_LOGIN_ENABLED")
    init_db()
    with SessionLocal() as db:
        app_settings.load_clock(db)
        defaults.backfill_translations(db)
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(
    title="OpenLesson API",
    description="Платформа планирования, мониторинга и анализа открытых занятий преподавателей (Astana IT University)",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(SessionMiddleware, secret_key=settings.secret_key, same_site="lax", https_only=settings.cookie_secure)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.middleware("http")
async def request_language(request: Request, call_next):
    """X-Lang (set by the frontend) or Accept-Language → language of API messages."""
    token = i18n.set_lang(i18n.normalize(request.headers.get("x-lang") or request.headers.get("accept-language")))
    try:
        return await call_next(request)
    finally:
        i18n.reset_lang(token)


for module in (auth, users, years, lessons, materials, attendance, feedback, notifications, analytics, admin):
    app.include_router(module.router)


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok"}


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


# Production: serve the built React app from the same origin.
if FRONTEND_DIST.exists():

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        candidate = (FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_file() and FRONTEND_DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(Path(FRONTEND_DIST / "index.html"))
