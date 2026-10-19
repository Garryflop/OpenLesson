from __future__ import annotations

import enum
import secrets
from datetime import date, datetime, time

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app import clock
from app.db import Base


class Role(str, enum.Enum):
    admin = "admin"  # администратор
    methodist = "methodist"  # методист
    teacher = "teacher"  # преподаватель (ППС)
    dean = "dean"  # декан / зам. декана
    leadership = "leadership"  # руководство университета


class LessonStatus(str, enum.Enum):
    draft = "draft"  # график ещё не утверждён
    scheduled = "scheduled"  # ожидаются материалы
    materials_ready = "materials_ready"  # материалы загружены
    confirmed = "confirmed"  # проверка пройдена, занятие подтверждено
    violation = "violation"  # нарушен срок, ждёт решения администратора
    annulled = "annulled"  # аннулировано
    completed = "completed"  # проведено, ожидается регистрация посетителей
    feedback = "feedback"  # идёт сбор обратной связи
    closed = "closed"  # завершено, результаты подведены


class TrimesterStatus(str, enum.Enum):
    draft = "draft"
    approved = "approved"


class MaterialKind(str, enum.Enum):
    presentation = "presentation"
    plan = "plan"


class AttendanceStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"


class FeedbackStatus(str, enum.Enum):
    pending = "pending"  # форма открыта, не начата
    draft = "draft"
    submitted = "submitted"
    expired = "expired"


class EmailStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"


def _now() -> datetime:
    return clock.now()


class School(Base):
    __tablename__ = "schools"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    short_name: Mapped[str | None] = mapped_column(String(64))
    name_kz: Mapped[str | None] = mapped_column(String(255))
    name_en: Mapped[str | None] = mapped_column(String(255))
    external_id: Mapped[str | None] = mapped_column(String(64), unique=True)  # ID в базе университета

    departments: Mapped[list[Department]] = relationship(back_populates="school", order_by="Department.name")


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"))

    school: Mapped[School | None] = relationship(back_populates="departments")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # e-mail can be unknown for staff imported from the university directory;
    # it is filled on the first Microsoft sign-in or by the administrator
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    external_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)  # User ID в базе университета
    full_name: Mapped[str] = mapped_column(String(255), index=True)
    position: Mapped[str | None] = mapped_column(String(255))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    # school managed by a dean / deputy dean (analytics scope)
    managed_school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"))
    roles: Mapped[list[str]] = mapped_column(JSON, default=lambda: [Role.teacher.value])
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_faculty: Mapped[bool] = mapped_column(Boolean, default=True)  # входит в список рассылки ППС
    language: Mapped[str | None] = mapped_column(String(2))  # kk | ru | en — язык интерфейса и писем; None — ещё не выбран
    oidc_subject: Mapped[str | None] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)

    department: Mapped[Department | None] = relationship(foreign_keys=[department_id])
    managed_school: Mapped[School | None] = relationship(foreign_keys=[managed_school_id])

    def has_role(self, *roles: Role | str) -> bool:
        values = {r.value if isinstance(r, Role) else r for r in roles}
        return any(r in values for r in (self.roles or []))

    @property
    def is_manager(self) -> bool:
        """Администратор или методист — управляет графиком и занятиями."""
        return self.has_role(Role.admin, Role.methodist)

    @property
    def school_id(self) -> int | None:
        return self.department.school_id if self.department else None


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)  # C1.2.243K
    map_key: Mapped[str | None] = mapped_column(String(255))  # data-name on the SVG map
    building: Mapped[str] = mapped_column(String(32), default="C1")
    block: Mapped[str | None] = mapped_column(String(32))
    floor: Mapped[int | None] = mapped_column(Integer)
    room: Mapped[str | None] = mapped_column(String(32))
    title: Mapped[str | None] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(32), default="classroom")
    capacity: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    @property
    def display_name(self) -> str:
        if self.title:
            return f"{self.title} ({self.block or self.building})"
        from app.i18n import tr

        return tr(
            f"Корпус {self.building}, блок {self.block}, ауд. {self.room}",
            f"Building {self.building}, block {self.block}, room {self.room}",
            f"{self.building} корпусы, {self.block} блогы, {self.room} аудиториясы",
        )


class AcademicYear(Base):
    __tablename__ = "academic_years"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(32), unique=True)  # 2026–2027
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)

    trimesters: Mapped[list[Trimester]] = relationship(
        back_populates="year", order_by="Trimester.number", cascade="all, delete-orphan"
    )


class Trimester(Base):
    __tablename__ = "trimesters"
    __table_args__ = (UniqueConstraint("year_id", "number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    year_id: Mapped[int] = mapped_column(ForeignKey("academic_years.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)  # 1, 2, 3
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default=TrimesterStatus.draft.value)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    year: Mapped[AcademicYear] = relationship(back_populates="trimesters")
    lessons: Mapped[list[OpenLesson]] = relationship(back_populates="trimester")

    @property
    def roman(self) -> str:
        return {1: "I", 2: "II", 3: "III"}.get(self.number, str(self.number))


def _token() -> str:
    return secrets.token_urlsafe(16)


class OpenLesson(Base):
    __tablename__ = "open_lessons"

    id: Mapped[int] = mapped_column(primary_key=True)
    trimester_id: Mapped[int] = mapped_column(ForeignKey("trimesters.id"), index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # snapshot of the schedule row (the approved schedule is an official document)
    teacher_position: Mapped[str | None] = mapped_column(String(255))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    topic: Mapped[str] = mapped_column(String(500))
    discipline: Mapped[str] = mapped_column(String(255))
    date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"))
    location_text: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default=LessonStatus.draft.value, index=True)

    materials_deadline: Mapped[datetime | None] = mapped_column(DateTime)
    extended_deadline: Mapped[datetime | None] = mapped_column(DateTime)
    pre_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime)
    violation_at: Mapped[datetime | None] = mapped_column(DateTime)
    annulled_at: Mapped[datetime | None] = mapped_column(DateTime)
    annul_reason: Mapped[str | None] = mapped_column(Text)
    annul_reason_en: Mapped[str | None] = mapped_column(Text)  # English / Kazakh text of a system-generated reason
    annul_reason_kk: Mapped[str | None] = mapped_column(Text)

    invitation_text: Mapped[str | None] = mapped_column(Text)
    poster_png: Mapped[str | None] = mapped_column(String(255))
    poster_pdf: Mapped[str | None] = mapped_column(String(255))
    poster_generated_at: Mapped[datetime | None] = mapped_column(DateTime)
    poster_sent_at: Mapped[datetime | None] = mapped_column(DateTime)

    qr_token: Mapped[str] = mapped_column(String(64), unique=True, default=_token)
    completed_notified_at: Mapped[datetime | None] = mapped_column(DateTime)
    attendance_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)
    attendance_confirmed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    feedback_opened_at: Mapped[datetime | None] = mapped_column(DateTime)
    feedback_due_at: Mapped[datetime | None] = mapped_column(DateTime)
    feedback_closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    trimester: Mapped[Trimester] = relationship(back_populates="lessons")
    teacher: Mapped[User] = relationship(foreign_keys=[teacher_id])
    department: Mapped[Department | None] = relationship()
    location: Mapped[Location | None] = relationship()
    materials: Mapped[list[LessonMaterial]] = relationship(back_populates="lesson", cascade="all, delete-orphan")
    attendances: Mapped[list[Attendance]] = relationship(back_populates="lesson", cascade="all, delete-orphan")
    feedbacks: Mapped[list[Feedback]] = relationship(back_populates="lesson", cascade="all, delete-orphan")
    events: Mapped[list[LessonEvent]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan", order_by="LessonEvent.created_at"
    )

    @property
    def start_dt(self) -> datetime:
        return datetime.combine(self.date, self.start_time)

    @property
    def end_dt(self) -> datetime:
        return datetime.combine(self.date, self.end_time)

    @property
    def effective_deadline(self) -> datetime | None:
        return self.extended_deadline or self.materials_deadline

    def material(self, kind: MaterialKind | str) -> LessonMaterial | None:
        k = kind.value if isinstance(kind, MaterialKind) else kind
        return next((m for m in self.materials if m.kind == k), None)

    @property
    def has_all_materials(self) -> bool:
        return all(self.material(k) is not None for k in MaterialKind)

    @property
    def place(self) -> str:
        if self.location:
            return self.location.display_name
        return self.location_text or "—"


class LessonMaterial(Base):
    __tablename__ = "lesson_materials"
    __table_args__ = (UniqueConstraint("lesson_id", "kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("open_lessons.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32))
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str | None] = mapped_column(String(128))
    size: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    on_time: Mapped[bool] = mapped_column(Boolean, default=True)

    lesson: Mapped[OpenLesson] = relationship(back_populates="materials")
    uploaded_by: Mapped[User | None] = relationship()


class LessonEvent(Base):
    """История занятия (аудит всех действий и автоматических шагов)."""

    __tablename__ = "lesson_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("open_lessons.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(Text)
    message_en: Mapped[str | None] = mapped_column(Text)
    message_kk: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    lesson: Mapped[OpenLesson] = relationship(back_populates="events")
    actor: Mapped[User | None] = relationship()


class Attendance(Base):
    __tablename__ = "attendances"
    __table_args__ = (UniqueConstraint("lesson_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("open_lessons.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    source: Mapped[str] = mapped_column(String(16), default="manual")  # manual | qr
    status: Mapped[str] = mapped_column(String(16), default=AttendanceStatus.pending.value)
    # snapshot required by the spec: ФИО, должность, кафедра, дата посещения
    full_name: Mapped[str] = mapped_column(String(255))
    position: Mapped[str | None] = mapped_column(String(255))
    department_name: Mapped[str | None] = mapped_column(String(255))
    visit_date: Mapped[date] = mapped_column(Date)
    registered_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    registered_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)
    confirmed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    lesson: Mapped[OpenLesson] = relationship(back_populates="attendances")
    user: Mapped[User] = relationship(foreign_keys=[user_id])


class FeedbackCriterion(Base):
    __tablename__ = "feedback_criteria"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    title_en: Mapped[str | None] = mapped_column(String(255))
    description_en: Mapped[str | None] = mapped_column(Text)
    title_kk: Mapped[str | None] = mapped_column(String(255))
    description_kk: Mapped[str | None] = mapped_column(Text)
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Feedback(Base):
    __tablename__ = "feedbacks"
    __table_args__ = (UniqueConstraint("lesson_id", "author_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("open_lessons.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default=FeedbackStatus.pending.value)
    scores: Mapped[dict] = mapped_column(JSON, default=dict)  # {criterion_id: 1..5}
    strengths: Mapped[str | None] = mapped_column(Text)
    improvements: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(Text)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    due_at: Mapped[datetime] = mapped_column(DateTime)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
    reminders_sent: Mapped[int] = mapped_column(Integer, default=0)

    lesson: Mapped[OpenLesson] = relationship(back_populates="feedbacks")
    author: Mapped[User] = relationship()
    replies: Mapped[list[FeedbackReply]] = relationship(
        back_populates="feedback", cascade="all, delete-orphan", order_by="FeedbackReply.created_at"
    )

    @property
    def average(self) -> float | None:
        vals = [int(v) for v in (self.scores or {}).values() if v]
        return round(sum(vals) / len(vals), 2) if vals else None


class FeedbackReply(Base):
    __tablename__ = "feedback_replies"

    id: Mapped[int] = mapped_column(primary_key=True)
    feedback_id: Mapped[int] = mapped_column(ForeignKey("feedbacks.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    feedback: Mapped[Feedback] = relationship(back_populates="replies")
    author: Mapped[User] = relationship()


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("open_lessons.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32))  # plan | feedback | invitation
    provider: Mapped[str] = mapped_column(String(32))  # openai | local_llm | local (rule-based)
    model: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="ok")  # ok | error
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    title_en: Mapped[str | None] = mapped_column(String(255))
    body_en: Mapped[str | None] = mapped_column(Text)
    title_kk: Mapped[str | None] = mapped_column(String(255))
    body_kk: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(255))
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("open_lessons.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime)


class EmailMessage(Base):
    """Исходящая почта (outbox) с историей отправки и повторными попытками."""

    __tablename__ = "email_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    to_email: Mapped[str] = mapped_column(String(255), index=True)
    to_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    subject: Mapped[str] = mapped_column(String(255))
    html: Mapped[str] = mapped_column(Text)
    text: Mapped[str | None] = mapped_column(Text)
    attachments: Mapped[list] = mapped_column(JSON, default=list)  # [{"path","name","mime"}]
    kind: Mapped[str] = mapped_column(String(64))
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("open_lessons.id", ondelete="SET NULL"), index=True)
    status: Mapped[str] = mapped_column(String(16), default=EmailStatus.pending.value, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[object] = mapped_column(JSON)
