from datetime import date, datetime, timedelta

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app import clock
from app.config import settings
from app.db import get_db
from app.deps import can_view_lesson_details, ensure, get_current_user, require_manager
from app.models import (
    AIAnalysis,
    Department,
    LessonStatus,
    Location,
    OpenLesson,
    Role,
    Trimester,
    TrimesterStatus,
    User,
)
from app.schemas import ExtendIn, InvitationIn, LessonIn, LessonUpdate, ReasonIn, RescheduleIn, RestoreIn
from app.i18n import tr
from app.serializers import lesson_detail, lesson_out
from app.services import app_settings, automation, lesson_logic, poster

router = APIRouter(prefix="/api/lessons", tags=["lessons"])
S = LessonStatus


def _load(db: Session, lesson_id: int, user: User) -> OpenLesson:
    lesson = db.get(OpenLesson, lesson_id)
    if lesson is None:
        raise HTTPException(404, tr("Занятие не найдено", "Lesson not found", "Сабақ табылмады"))
    if lesson.status == S.draft.value and not (user.is_manager or user.has_role(Role.leadership)):
        raise HTTPException(404, tr("Занятие не найдено", "Lesson not found", "Сабақ табылмады"))
    return lesson


def _detail(db: Session, lesson: OpenLesson, user: User) -> dict:
    analyses = db.scalars(
        select(AIAnalysis).where(AIAnalysis.lesson_id == lesson.id).order_by(AIAnalysis.created_at.desc())
    ).all()
    return lesson_detail(lesson, user, list(analyses))


def _location(db: Session, location_id: int | None) -> Location | None:
    if location_id is None:
        return None
    loc = db.get(Location, location_id)
    if loc is None:
        raise HTTPException(400, tr("Локация не найдена", "Location not found", "Орын табылмады"))
    return loc


@router.get("")
def list_lessons(
    year_id: int | None = None,
    trimester_id: int | None = None,
    status: list[str] | None = Query(None),
    teacher_id: int | None = None,
    department_id: int | None = None,
    school_id: int | None = None,
    location_id: int | None = None,
    mine: bool = False,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(OpenLesson)
        .join(Trimester)
        .options(
            selectinload(OpenLesson.materials),
            selectinload(OpenLesson.attendances),
            selectinload(OpenLesson.feedbacks),
        )
    )
    if year_id:
        stmt = stmt.where(Trimester.year_id == year_id)
    if trimester_id:
        stmt = stmt.where(OpenLesson.trimester_id == trimester_id)
    if status:
        stmt = stmt.where(OpenLesson.status.in_(status))
    if not (user.is_manager or user.has_role(Role.leadership)):
        stmt = stmt.where(OpenLesson.status != S.draft.value)
    if teacher_id:
        stmt = stmt.where(OpenLesson.teacher_id == teacher_id)
    if mine:
        stmt = stmt.where(OpenLesson.teacher_id == user.id)
    if department_id:
        stmt = stmt.where(OpenLesson.department_id == department_id)
    if school_id:
        stmt = stmt.join(Department, OpenLesson.department_id == Department.id).where(Department.school_id == school_id)
    if location_id:
        stmt = stmt.where(OpenLesson.location_id == location_id)
    if date_from:
        stmt = stmt.where(OpenLesson.date >= date_from)
    if date_to:
        stmt = stmt.where(OpenLesson.date <= date_to)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.join(User, OpenLesson.teacher_id == User.id).where(
            or_(
                func.lower(OpenLesson.topic).like(like),
                func.lower(OpenLesson.discipline).like(like),
                func.lower(User.full_name).like(like),
            )
        )
    lessons = db.scalars(stmt.order_by(OpenLesson.date, OpenLesson.start_time)).unique().all()
    return [lesson_out(lesson, user) for lesson in lessons]


@router.get("/{lesson_id}")
def get_lesson(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _detail(db, _load(db, lesson_id, user), user)


@router.post("", status_code=201)
def create_lesson(data: LessonIn, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    trimester = db.get(Trimester, data.trimester_id)
    teacher = db.get(User, data.teacher_id)
    if trimester is None or teacher is None:
        raise HTTPException(400, tr("Неверный триместр или преподаватель", "Invalid trimester or teacher",
                                    "Триместр немесе оқытушы қате көрсетілген"))
    if data.end_time <= data.start_time:
        raise HTTPException(400, tr("Время окончания должно быть позже начала", "The end time must be later than the start time",
                                    "Аяқталу уақыты басталу уақытынан кейін болуы керек"))
    loc = _location(db, data.location_id)
    lesson = OpenLesson(
        trimester_id=trimester.id,
        teacher_id=teacher.id,
        teacher_position=data.teacher_position or teacher.position,
        department_id=teacher.department_id,
        topic=data.topic.strip(),
        discipline=data.discipline.strip(),
        date=data.date,
        start_time=data.start_time,
        end_time=data.end_time,
        location_id=loc.id if loc else None,
        location_text=loc.code if loc else data.location_text,
        status=S.draft.value,
        materials_deadline=lesson_logic.compute_deadline(db, data.date),
    )
    db.add(lesson)
    db.flush()
    lesson_logic.log_event(db, lesson, "created", lambda: tr(
        "Занятие добавлено в график", "Lesson added to the schedule", "Сабақ кестеге қосылды"
    ), user)
    if trimester.status == TrimesterStatus.approved.value:
        if lesson.start_dt <= clock.now():
            raise HTTPException(400, tr("Нельзя добавить занятие в прошедшую дату", "A lesson cannot be added on a past date",
                                        "Өткен күнге сабақ қосуға болмайды"))
        lesson_logic.activate_lesson(db, lesson, user)
    db.commit()
    return _detail(db, lesson, user)


@router.patch("/{lesson_id}")
def update_lesson(lesson_id: int, data: LessonUpdate, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    lesson = _load(db, lesson_id, user)
    changes = data.model_dump(exclude_unset=True)
    if "location_id" in changes:
        loc = _location(db, changes.pop("location_id"))
        lesson.location = loc
        lesson.location_text = loc.code if loc else changes.get("location_text", lesson.location_text)
        changes.pop("location_text", None)
    for key, value in changes.items():
        setattr(lesson, key, value)
    lesson_logic.log_event(db, lesson, "updated", lambda: tr(
        "Сведения о занятии изменены", "Lesson details changed", "Сабақ туралы мәліметтер өзгертілді"
    ), user)
    db.commit()
    return _detail(db, lesson, user)


@router.delete("/{lesson_id}", status_code=204)
def delete_lesson(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    lesson = _load(db, lesson_id, user)
    if lesson.status != S.draft.value:
        raise HTTPException(400, tr(
            "Удалить можно только занятие из неутверждённого графика. Используйте аннулирование",
            "Only lessons of an unapproved schedule can be deleted. Use annulment instead",
            "Бекітілмеген кестедегі сабақты ғана жоюға болады. Оның орнына сабақтың күшін жойыңыз",
        ))
    db.delete(lesson)
    db.commit()


@router.post("/{lesson_id}/reschedule")
def reschedule(lesson_id: int, data: RescheduleIn, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    lesson = _load(db, lesson_id, user)
    if datetime.combine(data.date, data.start_time) <= clock.now():
        raise HTTPException(400, tr("Новая дата должна быть в будущем", "The new date must be in the future",
                                    "Жаңа күн болашақта болуы керек"))
    lesson_logic.reschedule(
        db,
        lesson,
        new_date=data.date,
        start=data.start_time,
        end=data.end_time,
        location=_location(db, data.location_id),
        location_text=data.location_text,
        reason=data.reason,
        actor=user,
    )
    db.commit()
    return _detail(db, lesson, user)


@router.post("/{lesson_id}/annul")
def annul(lesson_id: int, data: ReasonIn, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    lesson = _load(db, lesson_id, user)
    if lesson.status in (S.completed.value, S.feedback.value):
        raise HTTPException(400, tr("Проведённое занятие нельзя аннулировать", "A held lesson cannot be annulled",
                                    "Өткізілген сабақтың күшін жоюға болмайды"))
    lesson_logic.annul(db, lesson, data.reason, user)
    db.commit()
    return _detail(db, lesson, user)


@router.post("/{lesson_id}/restore")
def restore(lesson_id: int, data: RestoreIn, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    lesson = _load(db, lesson_id, user)
    lesson_logic.restore(db, lesson, data.reason, user, data.new_deadline)
    db.commit()
    return _detail(db, lesson, user)


@router.post("/{lesson_id}/extend")
def extend(lesson_id: int, data: ExtendIn, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    lesson = _load(db, lesson_id, user)
    if lesson.status not in (S.scheduled.value, S.materials_ready.value, S.violation.value):
        raise HTTPException(400, tr("Продление срока возможно до подтверждения занятия",
                                    "The deadline can be extended only before the lesson is confirmed",
                                    "Мерзімді тек сабақ расталғанға дейін ұзартуға болады"))
    if data.until <= clock.now() or data.until >= lesson.start_dt:
        raise HTTPException(400, tr("Новый срок должен быть в будущем и раньше начала занятия",
                                    "The new deadline must be in the future and before the lesson starts",
                                    "Жаңа мерзім болашақта және сабақ басталғанға дейін болуы керек"))
    lesson_logic.extend_deadline(db, lesson, data.until, data.reason, user)
    db.commit()
    return _detail(db, lesson, user)


@router.post("/{lesson_id}/confirm")
def confirm(lesson_id: int, data: ReasonIn, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    """Решение администратора: подтвердить занятие (например, при нарушении срока)."""
    lesson = _load(db, lesson_id, user)
    if lesson.status not in (S.violation.value, S.materials_ready.value):
        raise HTTPException(400, tr("Подтвердить можно занятие с загруженными материалами или с нарушением срока",
                                    "Only a lesson with uploaded materials or a missed deadline can be confirmed",
                                    "Материалдары жүктелген немесе жүктеу мерзімі бұзылған сабақты ғана растауға болады"))
    reason = data.reason
    lesson_logic.confirm_lesson(
        db, lesson, user, lambda: tr(f"Решение администратора: {reason}", f"Administrator's decision: {reason}",
                                     f"Әкімші шешімі: {reason}")
    )
    db.commit()
    return _detail(db, lesson, user)


@router.put("/{lesson_id}/invitation")
def set_invitation(lesson_id: int, data: InvitationIn, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    lesson = _load(db, lesson_id, user)
    lesson.invitation_text = data.invitation_text.strip()
    lesson_logic.log_event(
        db, lesson, "invitation_updated", lambda: tr("Текст приглашения отредактирован", "Invitation text edited",
                                                     "Шақыру мәтіні өңделді"), user
    )
    db.commit()
    if lesson.poster_png:
        poster.generate(db, lesson)
    return _detail(db, lesson, user)


@router.post("/{lesson_id}/poster")
def generate_poster(
    lesson_id: int, regenerate_text: bool = False, db: Session = Depends(get_db), user: User = Depends(require_manager)
):
    """Сформировать (предпросмотр) постер без рассылки."""
    lesson = _load(db, lesson_id, user)
    if lesson.status in (S.annulled.value, S.draft.value):
        raise HTTPException(400, tr("Постер не формируется для черновых и аннулированных занятий",
                                    "No poster is generated for draft or annulled lessons",
                                    "Кесте жобасындағы және күші жойылған сабақтар үшін постер жасалмайды"))
    if regenerate_text or not lesson.invitation_text:
        from app.services import ai

        ai.generate_invitation(db, lesson)
    poster.generate(db, lesson)
    lesson_logic.log_event(db, lesson, "poster_generated", lambda: tr("Постер сформирован", "Poster generated", "Постер жасалды"), user)
    db.commit()
    return _detail(db, lesson, user)


@router.post("/{lesson_id}/poster/send")
def send_poster(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    lesson = _load(db, lesson_id, user)
    if lesson.status != S.confirmed.value:
        raise HTTPException(400, tr("Рассылка постера возможна только для подтверждённых занятий",
                                    "The poster can be sent only for confirmed lessons",
                                    "Постерді тек расталған сабақтар бойынша таратуға болады"))
    count = automation.publish_poster(db, lesson, user)
    return {"sent_to": count, "lesson": _detail(db, lesson, user)}


@router.get("/{lesson_id}/qr.svg")
def qr_code(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lesson = _load(db, lesson_id, user)
    ensure(user.is_manager or user.id == lesson.teacher_id)
    if not app_settings.get(db, "qr_checkin_enabled"):
        raise HTTPException(404, tr("QR-регистрация отключена", "QR check-in is turned off", "QR арқылы тіркелу өшірілген"))
    url = f"{settings.frontend_url.rstrip('/')}/checkin/{lesson.qr_token}"
    img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=12, border=2)
    return Response(img.to_string(encoding="unicode"), media_type="image/svg+xml")


@router.get("/{lesson_id}/attention")
def attention_flags(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Подсказки для карточки «Мое открытое занятие»."""
    lesson = _load(db, lesson_id, user)
    ensure(can_view_lesson_details(user, lesson))
    now = clock.now()
    deadline = lesson.effective_deadline
    return {
        "now": now,
        "deadline": deadline,
        "seconds_to_deadline": int((deadline - now).total_seconds()) if deadline else None,
        "missing": lesson_logic.missing_materials(lesson),
        "deadline_soon": bool(deadline and timedelta(0) < deadline - now < timedelta(days=3)),
    }
