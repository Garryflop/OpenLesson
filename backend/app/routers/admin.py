"""Настройки платформы, журнал рассылок, запуск автоматического цикла, локации."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import clock
from app.config import settings
from app.db import get_db
from app.deps import get_current_user, require_admin, require_manager
from app.i18n import LANGS, tr
from app.models import EmailMessage, Location, User
from app.schemas import ClockIn, LocationUpdate
from app.serializers import location_out
from app.services import ai, app_settings, automation, notify, storage

router = APIRouter(prefix="/api", tags=["admin"])


@router.get("/system")
def system_info(_: User = Depends(get_current_user)):
    return {
        "now": clock.now(),
        "real_now": clock.real_now(),
        "clock_offset_minutes": clock.get_offset_minutes(),
        "environment": settings.environment,
        "timezone": settings.timezone,
        "email_backend": settings.email_backend,
        "ai_provider": ai.provider(),
        "ai_model": ai.model_name(),
        "oidc_enabled": settings.oidc_enabled,
        "scheduler_enabled": settings.scheduler_enabled,
    }


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _: User = Depends(require_manager)):
    return app_settings.get_all(db)


@router.put("/settings")
def put_settings(data: dict, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if "annul_policy" in data and data["annul_policy"] not in app_settings.ANNUL_POLICIES:
        raise HTTPException(400, tr("Неизвестная политика аннулирования", "Unknown annulment policy", "Күшін жою саясаты белгісіз"))
    if "poster_language" in data and data["poster_language"] not in LANGS:
        raise HTTPException(400, tr("Язык постера: ru, kk или en", "Poster language: ru, kk or en", "Постер тілі: ru, kk немесе en"))
    for key in ("pre_reminder_days", "reminder_days", "deadline_days", "poster_days", "feedback_days", "grace_hours"):
        if key in data and (not isinstance(data[key], int) or data[key] < 0):
            raise HTTPException(400, tr(f"Некорректное значение {key}", f"Invalid value of {key}", f"{key} мәні қате"))
    if "deadline_time" in data:
        try:
            hh, mm = (int(x) for x in str(data["deadline_time"]).split(":"))
            assert 0 <= hh < 24 and 0 <= mm < 60
        except (ValueError, AssertionError) as exc:
            raise HTTPException(400, tr("Время дедлайна в формате ЧЧ:ММ", "Deadline time must be in HH:MM format",
                                         "Мерзім уақыты СС:ММ форматында болуы керек")) from exc
    data.pop("demo_clock_offset_minutes", None)
    data.pop("poster_logo", None)
    app_settings.set_many(db, data)
    return app_settings.get_all(db)


@router.post("/settings/logo")
def upload_logo(file: UploadFile, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    stored, _size = storage.save_upload(file, "branding", {".png", ".jpg", ".jpeg"})
    old = app_settings.get(db, "poster_logo")
    if old:
        storage.remove(f"branding/{old}")
    app_settings.set_many(db, {"poster_logo": stored})
    return {"poster_logo": stored, "url": f"/api/files/branding/{stored}"}


@router.delete("/settings/logo")
def delete_logo(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    old = app_settings.get(db, "poster_logo")
    if old:
        storage.remove(f"branding/{old}")
    app_settings.set_many(db, {"poster_logo": None})
    return {"poster_logo": None}


@router.put("/settings/clock")
def set_clock(data: ClockIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Демо-режим: сдвиг «текущего времени» платформы (недоступен в production)."""
    if settings.is_production:
        raise HTTPException(403, tr("Недоступно в production", "Not available in production", "Production ортасында қолжетімсіз"))
    app_settings.set_many(db, {"demo_clock_offset_minutes": data.offset_minutes})
    clock.set_offset(data.offset_minutes)
    return {"now": clock.now(), "offset_minutes": clock.get_offset_minutes()}


@router.post("/automation/run")
def run_automation(db: Session = Depends(get_db), _: User = Depends(require_manager)):
    return automation.run_cycle(db)


# ------------------------------------------------------------------ e-mail log


def _email_out(m: EmailMessage, with_html: bool = False) -> dict:
    data = {
        "id": m.id,
        "to_email": m.to_email,
        "subject": m.subject,
        "kind": m.kind,
        "lesson_id": m.lesson_id,
        "status": m.status,
        "attempts": m.attempts,
        "last_error": m.last_error,
        "next_attempt_at": m.next_attempt_at,
        "sent_at": m.sent_at,
        "created_at": m.created_at,
        "attachments": [a["name"] for a in m.attachments or []],
    }
    if with_html:
        data["html"] = m.html
    return data


@router.get("/emails")
def list_emails(
    status: str | None = None,
    q: str | None = None,
    lesson_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    stmt = select(EmailMessage)
    if status:
        stmt = stmt.where(EmailMessage.status == status)
    if lesson_id:
        stmt = stmt.where(EmailMessage.lesson_id == lesson_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(EmailMessage.to_email).like(like), func.lower(EmailMessage.subject).like(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    counts = dict(db.execute(select(EmailMessage.status, func.count()).group_by(EmailMessage.status)).all())
    items = db.scalars(stmt.order_by(EmailMessage.id.desc()).limit(min(limit, 500)).offset(offset)).all()
    return {"total": total, "counts": counts, "items": [_email_out(m) for m in items]}


@router.get("/emails/{email_id}", response_class=HTMLResponse)
def email_preview(email_id: int, db: Session = Depends(get_db), _: User = Depends(require_manager)):
    m = db.get(EmailMessage, email_id)
    if m is None:
        raise HTTPException(404)
    return HTMLResponse(m.html)


@router.post("/emails/{email_id}/retry")
def retry_email(email_id: int, db: Session = Depends(get_db), _: User = Depends(require_manager)):
    m = db.get(EmailMessage, email_id)
    if m is None:
        raise HTTPException(404)
    notify.retry_email(db, m)
    notify.process_outbox(db)
    db.refresh(m)
    return _email_out(m)


@router.post("/emails/process")
def process_emails(db: Session = Depends(get_db), _: User = Depends(require_manager)):
    return notify.process_outbox(db)


# ------------------------------------------------------------------ locations (campus map)


@router.get("/locations")
def list_locations(active: bool | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = select(Location)
    if active is not None:
        stmt = stmt.where(Location.is_active.is_(active))
    return [location_out(loc) for loc in db.scalars(stmt.order_by(Location.floor, Location.code)).all()]


@router.put("/locations/{location_id}")
def update_location(location_id: int, data: LocationUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    loc = db.get(Location, location_id)
    if loc is None:
        raise HTTPException(404)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(loc, k, v)
    db.commit()
    return location_out(loc)

