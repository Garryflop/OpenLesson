from datetime import date, datetime, time

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.i18n import tr


class UserIn(BaseModel):
    email: EmailStr | None = None
    full_name: str = Field(min_length=3, max_length=255)
    position: str | None = None
    department_id: int | None = None
    managed_school_id: int | None = None
    roles: list[str] = ["teacher"]
    is_active: bool = True
    is_faculty: bool = True

    @field_validator("roles")
    @classmethod
    def _roles(cls, v: list[str]) -> list[str]:
        allowed = {"admin", "methodist", "teacher", "dean", "leadership"}
        bad = set(v) - allowed
        if bad:
            raise ValueError(tr(
                f"Неизвестные роли: {', '.join(bad)}", f"Unknown roles: {', '.join(bad)}", f"Белгісіз рөлдер: {', '.join(bad)}"
            ))
        return sorted(set(v))


class SchoolIn(BaseModel):
    name: str
    short_name: str | None = None


class DepartmentIn(BaseModel):
    name: str
    school_id: int | None = None


class YearIn(BaseModel):
    name: str = Field(pattern=r"^\d{4}[–-]\d{4}$", description="Например, 2026–2027")
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool = False


class TrimesterIn(BaseModel):
    start_date: date | None = None
    end_date: date | None = None


class LessonIn(BaseModel):
    trimester_id: int
    teacher_id: int
    teacher_position: str | None = None
    topic: str = Field(min_length=3, max_length=500)
    discipline: str = Field(min_length=2, max_length=255)
    date: date
    start_time: time
    end_time: time
    location_id: int | None = None
    location_text: str | None = None


class LessonUpdate(BaseModel):
    teacher_position: str | None = None
    topic: str | None = None
    discipline: str | None = None
    location_id: int | None = None
    location_text: str | None = None


class RescheduleIn(BaseModel):
    date: date
    start_time: time
    end_time: time
    location_id: int | None = None
    location_text: str | None = None
    reason: str = Field(min_length=3)


class ReasonIn(BaseModel):
    reason: str = Field(min_length=3)


class RestoreIn(ReasonIn):
    new_deadline: datetime | None = None


class ExtendIn(ReasonIn):
    until: datetime


class AttendanceAddIn(BaseModel):
    user_ids: list[int] = Field(min_length=1)


class AttendanceConfirmIn(BaseModel):
    attendance_ids: list[int] | None = None


class FeedbackIn(BaseModel):
    scores: dict[str, int] = {}
    strengths: str | None = None
    improvements: str | None = None
    comment: str | None = None

    @field_validator("scores")
    @classmethod
    def _scores(cls, v: dict[str, int]) -> dict[str, int]:
        for value in v.values():
            if value is not None and not 1 <= int(value) <= 5:
                raise ValueError(tr("Оценка должна быть от 1 до 5", "A score must be between 1 and 5", "Баға 1-ден 5-ке дейін болуы керек"))
        return {k: int(val) for k, val in v.items() if val}


class ReplyIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class CriterionIn(BaseModel):
    title: str = Field(min_length=3)  # Russian wording (required)
    description: str | None = None
    title_en: str | None = None
    description_en: str | None = None
    title_kk: str | None = None
    description_kk: str | None = None
    order: int = 0
    is_active: bool = True


class InvitationIn(BaseModel):
    invitation_text: str = Field(min_length=10, max_length=400)


class LocationUpdate(BaseModel):
    title: str | None = None
    kind: str | None = None
    capacity: int | None = None
    is_active: bool | None = None


class LanguageIn(BaseModel):
    language: str


class DevLoginIn(BaseModel):
    user_id: int | None = None
    email: EmailStr | None = None


class ClockIn(BaseModel):
    offset_minutes: int = Field(ge=-60 * 24 * 400, le=60 * 24 * 400)
