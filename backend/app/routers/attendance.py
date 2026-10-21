"""Модуль 5. Регистрация ППС, посетивших открытое занятие.

Основной способ (п. 7.1 ТЗ): ответственный методист вносит посетителей по явочному листу,
выбирая преподавателей из общего списка университета. QR-регистрация (п. 7.2) — дополнительная
функция, включается администратором в настройках.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import clock
from app.db import get_db
from app.deps import can_view_lesson_details, ensure, get_current_user, require_manager
from app.i18n import tr
from app.models import Attendance, AttendanceStatus, FeedbackStatus, LessonStatus, OpenLesson, User
from app.schemas import AttendanceAddIn, AttendanceConfirmIn
from app.serializers import attendance_out, lesson_out
from app.services import app_settings, lesson_logic
from app.utils import fmt_dt

router = APIRouter(prefix="/api", tags=["attendance"])
S = LessonStatus


def _lesson(db: Session, lesson_id: int) -> OpenLesson:
    lesson = db.get(OpenLesson, lesson_id)
    if lesson is None:
        raise HTTPException(404, tr("Занятие не найдено", "Lesson not found", "Сабақ табылмады"))
    return lesson


def qr_enabled(db: Session) -> bool:
    return bool(app_settings.get(db, "qr_checkin_enabled"))


def _registration_open(db: Session, lesson: OpenLesson) -> tuple[bool, str]:
    now = clock.now()
    before = int(app_settings.get(db, "checkin_before_minutes"))
    after = int(app_settings.get(db, "checkin_after_minutes"))
    opens, closes = lesson.start_dt - timedelta(minutes=before), lesson.end_dt + timedelta(minutes=after)
    if lesson.status not in (S.confirmed.value, S.completed.value, S.feedback.value):
        return False, tr(
            "Регистрация недоступна: занятие не подтверждено", "Check-in is unavailable: the lesson is not confirmed",
            "Тіркелу қолжетімсіз: сабақ расталмаған",
        )
    if now < opens:
        return False, tr(f"Регистрация откроется {fmt_dt(opens)}", f"Check-in opens on {fmt_dt(opens)}", f"Тіркелудің басталу уақыты: {fmt_dt(opens)}")
    if now > closes:
        return False, tr("Регистрация по QR-коду завершена", "QR check-in is closed", "QR-код арқылы тіркелу аяқталды")
    return True, ""


@router.get("/lessons/{lesson_id}/attendance")
def list_attendance(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lesson = _lesson(db, lesson_id)
    ensure(can_view_lesson_details(user, lesson))
    items = sorted(lesson.attendances, key=lambda a: a.full_name)
    return {
        "items": [attendance_out(a) for a in items],
        "confirmed_at": lesson.attendance_confirmed_at,
        "can_register": lesson.status in (S.confirmed.value, S.completed.value, S.feedback.value),
        "can_confirm": lesson.status in (S.completed.value, S.feedback.value),
        "qr_enabled": qr_enabled(db),
    }


@router.post("/lessons/{lesson_id}/attendance")
def add_attendance(lesson_id: int, data: AttendanceAddIn, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    """Внести посетителей по явочному листу (можно сразу нескольких)."""
    lesson = _lesson(db, lesson_id)
    if lesson.status not in (S.confirmed.value, S.completed.value, S.feedback.value):
        raise HTTPException(400, tr(
            "Регистрация посетителей доступна для подтверждённых и проведённых занятий",
            "Attendees can be registered only for confirmed or held lessons",
            "Қатысушыларды тек расталған немесе өткізілген сабақтарға тіркеуге болады",
        ))
    if lesson.status == S.confirmed.value and lesson.date > clock.now().date():
        raise HTTPException(400, tr(
            "Регистрация посетителей открывается в день занятия", "Attendee registration opens on the day of the lesson",
            "Қатысушыларды тіркеу сабақ өтетін күні ашылады",
        ))
    added, skipped = [], []
    for uid in dict.fromkeys(data.user_ids):
        person = db.get(User, uid)
        if person is None:
            skipped.append({"user_id": uid, "reason": tr("Пользователь не найден", "User not found", "Пайдаланушы табылмады")})
            continue
        try:
            a = lesson_logic.register_attendance(db, lesson, person, source="manual", actor=user, confirmed=True)
            added.append(a)
        except HTTPException as exc:
            skipped.append({"user_id": uid, "reason": exc.detail})
    if added:
        names = ", ".join(a.full_name for a in added)
        lesson_logic.log_event(db, lesson, "attendance_added", lambda: tr(
            f"Внесены посетители по явочному листу: {names}", f"Attendees entered from the attendance sheet: {names}",
            f"Қатысу парағы бойынша қатысушылар енгізілді: {names}",
        ), user)
    db.commit()
    return {"added": [attendance_out(a) for a in added], "skipped": skipped}


@router.post("/lessons/{lesson_id}/attendance/confirm")
def confirm_attendance(
    lesson_id: int, data: AttendanceConfirmIn, db: Session = Depends(get_db), user: User = Depends(require_manager)
):
    lesson = _lesson(db, lesson_id)
    count = lesson_logic.confirm_attendance(db, lesson, user, data.attendance_ids)
    return {"confirmed": count, "lesson": lesson_out(lesson, user)}


@router.post("/attendance/{attendance_id}/reject")
def reject_attendance(attendance_id: int, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    a = db.get(Attendance, attendance_id)
    if a is None:
        raise HTTPException(404)
    fb = next((f for f in a.lesson.feedbacks if f.author_id == a.user_id), None)
    if fb and fb.status == FeedbackStatus.submitted.value:
        raise HTTPException(400, tr(
            "Посетитель уже отправил отзыв", "This attendee has already submitted feedback", "Қатысушы пікірін жіберіп қойған"
        ))
    if fb:
        db.delete(fb)
    a.status = AttendanceStatus.rejected.value
    name = a.full_name
    lesson_logic.log_event(db, a.lesson, "attendance_rejected", lambda: tr(
        f"Регистрация отклонена: {name}", f"Registration rejected: {name}", f"Тіркеу қабылданбады: {name}"
    ), user)
    db.commit()
    return attendance_out(a)


@router.delete("/attendance/{attendance_id}", status_code=204)
def delete_attendance(attendance_id: int, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    a = db.get(Attendance, attendance_id)
    if a is None:
        raise HTTPException(404)
    fb = next((f for f in a.lesson.feedbacks if f.author_id == a.user_id), None)
    if fb and fb.status == FeedbackStatus.submitted.value:
        raise HTTPException(400, tr(
            "Посетитель уже отправил отзыв — удаление невозможно", "This attendee has already submitted feedback and cannot be removed",
            "Қатысушы пікірін жіберіп қойған — оны тізімнен жою мүмкін емес",
        ))
    if fb:
        db.delete(fb)
    name = a.full_name
    lesson_logic.log_event(db, a.lesson, "attendance_removed", lambda: tr(
        f"Удалён из списка посетителей: {name}", f"Removed from the attendee list: {name}",
        f"Қатысушылар тізімінен шығарылды: {name}",
    ), user)
    db.delete(a)
    db.commit()


# ------------------------------------------------------------------ QR check-in (optional, spec 7.2)


def _qr_lesson(db: Session, token: str) -> OpenLesson:
    if not qr_enabled(db):
        raise HTTPException(404, tr("QR-регистрация отключена", "QR check-in is turned off", "QR-код арқылы тіркелу өшірілген"))
    lesson = db.query(OpenLesson).filter(OpenLesson.qr_token == token).first()
    if lesson is None:
        raise HTTPException(404, tr("QR-код недействителен", "Invalid QR code", "QR-код жарамсыз"))
    return lesson


@router.get("/checkin/{token}")
def checkin_info(token: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lesson = _qr_lesson(db, token)
    is_open, message = _registration_open(db, lesson)
    mine = next((a for a in lesson.attendances if a.user_id == user.id), None)
    return {
        "lesson": lesson_out(lesson, user),
        "open": is_open,
        "message": message,
        "is_teacher": lesson.teacher_id == user.id,
        "attendance": attendance_out(mine) if mine else None,
    }


@router.post("/checkin/{token}")
def checkin(token: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lesson = _qr_lesson(db, token)
    is_open, message = _registration_open(db, lesson)
    if not is_open:
        raise HTTPException(400, message)
    confirmed_already = lesson.status == S.feedback.value
    a = lesson_logic.register_attendance(db, lesson, user, source="qr", actor=None, confirmed=False)
    name = user.full_name
    lesson_logic.log_event(db, lesson, "checkin", lambda: tr(f"Регистрация по QR-коду: {name}", f"QR check-in: {name}", f"QR-код арқылы тіркелу: {name}"), user)
    db.commit()
    return {"attendance": attendance_out(a), "needs_confirmation": True, "list_confirmed": confirmed_already}
