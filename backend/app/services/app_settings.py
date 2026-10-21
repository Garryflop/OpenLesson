"""Business rules configurable by the administrator at runtime."""

from typing import Any

from sqlalchemy.orm import Session

from app import clock
from app.models import AppSetting

ANNUL_POLICIES = ("auto", "admin_confirm", "grace")

DEFAULTS: dict[str, Any] = {
    # Модуль 2–3: напоминания и контроль сроков
    "pre_reminder_days": 10,  # предварительное напоминание о загрузке документов
    "reminder_days": 7,  # уведомление преподавателю
    "deadline_days": 7,  # материалы обязательны не позднее чем за N дней
    "deadline_time": "18:00",  # время дедлайна в день X
    "annul_policy": "auto",  # auto | admin_confirm | grace
    "grace_hours": 48,  # дополнительный срок для политики grace
    # Модуль 4: постер
    "poster_days": 3,
    "poster_primary_color": "#12344F",
    "poster_accent_color": "#2E9DCA",
    "poster_logo": None,  # загруженный логотип в storage/branding (по умолчанию — официальный логотип AITU)
    "university_name": "Astana IT University",
    "poster_language": "ru",  # ru | en
    # Модуль 5–6: посещение и обратная связь
    # Основной способ (п. 7.1 ТЗ): методист вносит посетителей по явочному листу.
    # QR-регистрация (п. 7.2) — дополнительная функция, по умолчанию выключена.
    "qr_checkin_enabled": False,
    "checkin_before_minutes": 30,
    "checkin_after_minutes": 120,
    "feedback_days": 3,
    "feedback_reminder_days": [1, 2],
    # Почта
    "mailing_enabled": True,
}


def get_all(db: Session) -> dict[str, Any]:
    values = dict(DEFAULTS)
    for row in db.query(AppSetting).all():
        values[row.key] = row.value
    values["demo_clock_offset_minutes"] = clock.get_offset_minutes()
    return values


def get(db: Session, key: str) -> Any:
    row = db.get(AppSetting, key)
    return row.value if row is not None else DEFAULTS.get(key)


def set_many(db: Session, data: dict[str, Any]) -> None:
    for key, value in data.items():
        if key not in DEFAULTS and key != "demo_clock_offset_minutes":
            continue
        row = db.get(AppSetting, key)
        if row is None:
            db.add(AppSetting(key=key, value=value))
        else:
            row.value = value
    db.commit()


def load_clock(db: Session) -> None:
    row = db.get(AppSetting, "demo_clock_offset_minutes")
    clock.set_offset(int(row.value) if row and row.value else 0)
