"""Model → JSON serialisation (permission-aware where needed)."""

from sqlalchemy.orm import object_session

from app import clock
from app.deps import can_view_lesson_details
from app.models import (
    AcademicYear,
    AIAnalysis,
    Attendance,
    AttendanceStatus,
    Feedback,
    FeedbackStatus,
    LessonMaterial,
    Location,
    Notification,
    OpenLesson,
    Role,
    Trimester,
    User,
)
from app.i18n import pick
from app.services.lesson_logic import material_title, status_label
from app.utils import short_name


def file_url(relative: str | None) -> str | None:
    return f"/api/files/{relative}" if relative else None


def user_brief(u: User | None) -> dict | None:
    if u is None:
        return None
    return {
        "id": u.id,
        "full_name": u.full_name,
        "short_name": short_name(u.full_name),
        "position": u.position,
        "department_name": u.department.name if u.department else None,
        "email": u.email,
    }


def user_out(u: User) -> dict:
    dept = u.department
    school = dept.school if dept else None
    return {
        **user_brief(u),
        "department_id": u.department_id,
        "school_id": school.id if school else None,
        "school_name": pick(school.name, school.name_en, school.name_kz) if school else None,
        "managed_school_id": u.managed_school_id,
        "managed_school_name": pick(u.managed_school.name, u.managed_school.name_en, u.managed_school.name_kz) if u.managed_school else None,
        "roles": u.roles or [],
        "is_active": u.is_active,
        "is_faculty": u.is_faculty,
        "language": u.language,
        "last_login_at": u.last_login_at,
        "created_at": u.created_at,
    }


def location_out(loc: Location | None) -> dict | None:
    if loc is None:
        return None
    return {
        "id": loc.id,
        "code": loc.code,
        "map_key": loc.map_key,
        "building": loc.building,
        "block": loc.block,
        "floor": loc.floor,
        "room": loc.room,
        "title": loc.title,
        "kind": loc.kind,
        "capacity": loc.capacity,
        "is_active": loc.is_active,
        "display_name": loc.display_name,
    }


def trimester_out(t: Trimester) -> dict:
    return {
        "id": t.id,
        "year_id": t.year_id,
        "year_name": t.year.name,
        "number": t.number,
        "roman": t.roman,
        "start_date": t.start_date,
        "end_date": t.end_date,
        "status": t.status,
        "approved_at": t.approved_at,
        "lesson_count": len(t.lessons),
    }


def year_out(y: AcademicYear) -> dict:
    return {
        "id": y.id,
        "name": y.name,
        "start_date": y.start_date,
        "end_date": y.end_date,
        "is_current": y.is_current,
        "trimesters": [trimester_out(t) for t in y.trimesters],
    }


def material_out(m: LessonMaterial) -> dict:
    return {
        "id": m.id,
        "kind": m.kind,
        "title": material_title(m.kind),
        "original_name": m.original_name,
        "size": m.size,
        "uploaded_at": m.uploaded_at,
        "uploaded_by": user_brief(m.uploaded_by),
        "on_time": m.on_time,
        "url": f"/api/materials/{m.id}/download",
    }


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def lesson_out(lesson: OpenLesson, viewer: User | None = None) -> dict:
    submitted = [f for f in lesson.feedbacks if f.status == FeedbackStatus.submitted.value]
    confirmed = [a for a in lesson.attendances if a.status == AttendanceStatus.confirmed.value]
    dept = lesson.department
    return {
        "id": lesson.id,
        "trimester_id": lesson.trimester_id,
        "trimester_number": lesson.trimester.number,
        "trimester_roman": lesson.trimester.roman,
        "year_name": lesson.trimester.year.name,
        "teacher": user_brief(lesson.teacher),
        "teacher_position": lesson.teacher_position,
        "department_id": lesson.department_id,
        "department_name": dept.name if dept else None,
        "school_name": pick(dept.school.name, dept.school.name_en, dept.school.name_kz) if dept and dept.school else None,
        "topic": lesson.topic,
        "discipline": lesson.discipline,
        "date": lesson.date,
        "start_time": lesson.start_time.strftime("%H:%M"),
        "end_time": lesson.end_time.strftime("%H:%M"),
        "location": location_out(lesson.location),
        "location_text": lesson.location_text,
        "place": lesson.place,
        "status": lesson.status,
        "status_label": status_label(lesson.status),
        "materials_deadline": lesson.effective_deadline,
        "materials": {
            "presentation": lesson.material("presentation") is not None,
            "plan": lesson.material("plan") is not None,
        },
        "poster_png": file_url(lesson.poster_png),
        "attendance_count": len(confirmed),
        "feedback_submitted": len(submitted),
        "feedback_total": len(lesson.feedbacks),
        "avg_score": _avg([f.average for f in submitted if f.average is not None]),
        "is_mine": bool(viewer and viewer.id == lesson.teacher_id),
    }


def event_out(e) -> dict:
    return {
        "id": e.id,
        "kind": e.kind,
        "message": pick(e.message, e.message_en, e.message_kk),
        "actor": user_brief(e.actor),
        "created_at": e.created_at,
    }


def attendance_out(a: Attendance) -> dict:
    return {
        "id": a.id,
        "user_id": a.user_id,
        "full_name": a.full_name,
        "position": a.position,
        "department_name": a.department_name,
        "visit_date": a.visit_date,
        "source": a.source,
        "status": a.status,
        "registered_at": a.registered_at,
        "confirmed_at": a.confirmed_at,
    }


def analysis_out(a: AIAnalysis | None) -> dict | None:
    if a is None:
        return None
    return {
        "id": a.id,
        "kind": a.kind,
        "provider": a.provider,
        "model": a.model,
        "status": a.status,
        "result": a.result,
        "error": a.error,
        "created_at": a.created_at,
    }


def _qr_enabled(lesson: OpenLesson) -> bool:
    """QR check-in is an optional feature (spec 7.2) switched on in the settings."""
    from app.services import app_settings

    db = object_session(lesson)
    return bool(db is not None and app_settings.get(db, "qr_checkin_enabled"))


def lesson_detail(lesson: OpenLesson, viewer: User, analyses: list[AIAnalysis]) -> dict:
    data = lesson_out(lesson, viewer)
    is_teacher = viewer.id == lesson.teacher_id
    details = can_view_lesson_details(viewer, lesson)
    my_att = next((a for a in lesson.attendances if a.user_id == viewer.id), None)
    my_fb = next((f for f in lesson.feedbacks if f.author_id == viewer.id), None)
    now = clock.now()
    data.update(
        {
            "poster_pdf": file_url(lesson.poster_pdf),
            "poster_generated_at": lesson.poster_generated_at,
            "poster_sent_at": lesson.poster_sent_at,
            "invitation_text": lesson.invitation_text,
            "original_deadline": lesson.materials_deadline,
            "extended_deadline": lesson.extended_deadline,
            "annul_reason": pick(lesson.annul_reason, lesson.annul_reason_en, lesson.annul_reason_kk),
            "annulled_at": lesson.annulled_at,
            "violation_at": lesson.violation_at,
            "checked_at": lesson.checked_at,
            "feedback_opened_at": lesson.feedback_opened_at,
            "feedback_due_at": lesson.feedback_due_at,
            "feedback_closed_at": lesson.feedback_closed_at,
            "attendance_confirmed_at": lesson.attendance_confirmed_at,
            "start_dt": lesson.start_dt,
            "end_dt": lesson.end_dt,
            "is_past": lesson.end_dt <= now,
            "permissions": {
                "manage": viewer.is_manager,
                "upload": (is_teacher or viewer.is_manager)
                and lesson.status in ("draft", "scheduled", "materials_ready", "violation"),
                "view_details": details,
                "is_teacher": is_teacher,
                "reply": is_teacher,
            },
            "materials_list": [material_out(m) for m in lesson.materials] if details else [],
            "events": [event_out(e) for e in lesson.events] if details else [],
            "qr_token": lesson.qr_token if (viewer.is_manager or is_teacher) and _qr_enabled(lesson) else None,
            "my_attendance": attendance_out(my_att) if my_att else None,
            "my_feedback": {"id": my_fb.id, "status": my_fb.status, "due_at": my_fb.due_at} if my_fb else None,
            "analyses": {
                kind: analysis_out(next((a for a in analyses if a.kind == kind), None))
                for kind in ("plan", "feedback", "invitation")
            }
            if details
            else {},
        }
    )
    return data


def feedback_out(fb: Feedback, include_author: bool = True) -> dict:
    return {
        "id": fb.id,
        "lesson_id": fb.lesson_id,
        "status": fb.status,
        "scores": fb.scores or {},
        "average": fb.average,
        "strengths": fb.strengths,
        "improvements": fb.improvements,
        "comment": fb.comment,
        "opened_at": fb.opened_at,
        "due_at": fb.due_at,
        "submitted_at": fb.submitted_at,
        "updated_at": fb.updated_at,
        "author": user_brief(fb.author) if include_author else None,
        "replies": [
            {"id": r.id, "text": r.text, "created_at": r.created_at, "author": user_brief(r.author)}
            for r in fb.replies
        ],
    }


def notification_out(n: Notification) -> dict:
    return {
        "id": n.id,
        "kind": n.kind,
        "title": pick(n.title, n.title_en, n.title_kk),
        "body": pick(n.body, n.body_en, n.body_kk),
        "link": n.link,
        "lesson_id": n.lesson_id,
        "created_at": n.created_at,
        "read_at": n.read_at,
    }


def roles_of(u: User) -> set[str]:
    return set(u.roles or [Role.teacher.value])
