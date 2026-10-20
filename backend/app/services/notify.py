"""In-platform notifications + e-mail outbox with retries."""

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import timedelta
from functools import lru_cache

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import clock
from app.config import BASE_DIR, settings
from app.i18n import both, get_lang, tr, use_lang
from app.models import EmailMessage, EmailStatus, Notification, OpenLesson, Role, User
from app.services import app_settings
from app.services.email_backends import get_backend
from app.utils import fmt_date, fmt_range, greeting

log = logging.getLogger("openlesson.notify")

RETRY_MINUTES = [5, 15, 60, 180, 720]


@dataclass
class Message:
    kind: str
    category: str  # e.g. «Напоминание» / "Reminder"
    title: str  # subject / notification title
    intro: list[str]
    fields: list[tuple[str, str]] = field(default_factory=list)
    outro: list[str] = field(default_factory=list)
    link: str | None = None  # frontend path, e.g. /lessons/5
    link_label: str | None = None  # default: «Открыть в OpenLesson»
    attachments: list[dict] = field(default_factory=list)

    def plain(self) -> str:
        parts = list(self.intro)
        parts += [f"{k}: {v}" for k, v in self.fields]
        parts += self.outro
        return "\n".join(parts)


def lesson_fields(lesson: OpenLesson, with_teacher: bool = False) -> list[tuple[str, str]]:
    fields = []
    if with_teacher:
        fields.append((tr("Преподаватель", "Teacher", "Оқытушы"), lesson.teacher.full_name))
    fields += [
        (tr("Тема", "Topic", "Тақырыбы"), lesson.topic),
        (tr("Дисциплина", "Course", "Пән"), lesson.discipline),
        (tr("Дата", "Date", "Күні"), fmt_date(lesson.date)),
        (tr("Время", "Time", "Уақыты"), fmt_range(lesson.start_time, lesson.end_time)),
        (tr("Место", "Location", "Орны"), lesson.place),
    ]
    return fields


@lru_cache
def _env() -> Environment:
    return Environment(loader=FileSystemLoader(BASE_DIR / "app" / "templates"), autoescape=select_autoescape())


def render_email(db: Session, user: User, msg: Message) -> str:
    primary = app_settings.get(db, "poster_primary_color") or "#12344F"
    return _env().get_template("email.html").render(
        subject=msg.title,
        category=msg.category,
        greeting=greeting(user.full_name),
        intro=msg.intro,
        fields=msg.fields,
        outro=msg.outro,
        link=f"{settings.frontend_url.rstrip('/')}{msg.link}" if msg.link else None,
        link_label=msg.link_label or tr("Открыть в OpenLesson", "Open in OpenLesson", "OpenLesson жүйесінде ашу"),
        primary=primary,
        logo_url=f"{settings.frontend_url.rstrip('/')}/aitu-logo.png",
        university=app_settings.get(db, "university_name"),
        lang=get_lang(),
        footer=tr(
            f"Автоматическое уведомление платформы OpenLesson · {app_settings.get(db, 'university_name')}. Не отвечайте на это письмо.",
            f"Automatic notification from OpenLesson · {app_settings.get(db, 'university_name')}. Please do not reply to this e-mail.",
            f"OpenLesson платформасының автоматты хабарландыруы · {app_settings.get(db, 'university_name')}. "
            "Бұл хатқа жауап бермеуіңізді сұраймыз.",
        ),
    )


MessageSource = Message | Callable[[], Message]


def send(
    db: Session,
    user: User,
    msg: MessageSource,
    lesson: OpenLesson | None = None,
    in_app: bool = True,
    email: bool = True,
) -> None:
    """Create an in-app notification and queue an e-mail (committed by the caller).

    Pass a builder (``lambda: Message(...)`` using ``tr()``) to get the notification in every language
    (RU / KK / EN) and the e-mail in the recipient's language.
    """
    build: Callable[[], Message] = msg if callable(msg) else (lambda: msg)
    if in_app:
        texts = both(build)
        ru, en, kk = texts["ru"], texts["en"], texts["kk"]
        db.add(
            Notification(
                user_id=user.id,
                kind=ru.kind,
                title=ru.title,
                body=ru.plain(),
                title_en=en.title,
                body_en=en.plain(),
                title_kk=kk.title,
                body_kk=kk.plain(),
                link=ru.link,
                lesson_id=lesson.id if lesson else None,
            )
        )
    if email and user.email and app_settings.get(db, "mailing_enabled"):
        with use_lang(user.language or "ru"):
            m = build()
            db.add(
                EmailMessage(
                    to_email=user.email,
                    to_user_id=user.id,
                    subject=f"OpenLesson · {m.title}",
                    html=render_email(db, user, m),
                    text=m.plain(),
                    attachments=m.attachments,
                    kind=m.kind,
                    lesson_id=lesson.id if lesson else None,
                    next_attempt_at=clock.now(),
                )
            )


def managers(db: Session) -> list[User]:
    users = db.scalars(select(User).where(User.is_active.is_(True))).all()
    return [u for u in users if u.has_role(Role.admin, Role.methodist)]


def deans_for(db: Session, lesson: OpenLesson) -> list[User]:
    school_id = lesson.department.school_id if lesson.department else None
    if not school_id:
        return []
    users = db.scalars(
        select(User).where(User.is_active.is_(True), User.managed_school_id == school_id)
    ).all()
    return [u for u in users if u.has_role(Role.dean)]


def send_many(db: Session, users: list[User], msg: MessageSource, lesson: OpenLesson | None = None, **kw) -> int:
    seen: set[int] = set()
    for u in users:
        if u.id in seen:
            continue
        seen.add(u.id)
        send(db, u, msg, lesson, **kw)
    return len(seen)


def process_outbox(db: Session, limit: int = 100) -> dict:
    """Deliver queued e-mails; failed attempts are retried with back-off."""
    now = clock.now()
    backend = get_backend()
    batch = db.scalars(
        select(EmailMessage)
        .where(
            EmailMessage.status == EmailStatus.pending.value,
            or_(EmailMessage.next_attempt_at.is_(None), EmailMessage.next_attempt_at <= now),
        )
        .order_by(EmailMessage.id)
        .limit(limit)
    ).all()
    sent = failed = 0
    for m in batch:
        m.attempts += 1
        try:
            backend.send(m)
        except Exception as exc:  # noqa: BLE001 — any delivery problem must be recorded
            m.last_error = str(exc)[:2000]
            if m.attempts >= settings.email_max_attempts:
                m.status = EmailStatus.failed.value
                m.next_attempt_at = None
            else:
                delay = RETRY_MINUTES[min(m.attempts - 1, len(RETRY_MINUTES) - 1)]
                m.next_attempt_at = now + timedelta(minutes=delay)
            failed += 1
            log.warning("E-mail %s to %s failed (attempt %s): %s", m.id, m.to_email, m.attempts, exc)
        else:
            m.status = EmailStatus.sent.value
            m.sent_at = now
            m.last_error = None
            sent += 1
        db.commit()
    return {"sent": sent, "failed": failed}


def retry_email(db: Session, msg: EmailMessage) -> None:
    msg.status = EmailStatus.pending.value
    msg.next_attempt_at = clock.now()
    msg.attempts = 0 if msg.attempts >= settings.email_max_attempts else msg.attempts
    db.commit()
