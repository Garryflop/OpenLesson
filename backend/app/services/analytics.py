"""Модуль 8. Аналитика по учебным годам, триместрам, кафедрам и преподавателям."""

from collections import Counter, defaultdict
from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import clock
from app.i18n import pick, tr
from app.models import (
    AttendanceStatus,
    Department,
    FeedbackCriterion,
    FeedbackStatus,
    LessonStatus,
    OpenLesson,
    Trimester,
)
from app.services.lesson_logic import STATUS_LABELS, status_label

S = LessonStatus
CONDUCTED = {S.completed.value, S.feedback.value, S.closed.value}
PLANNED = {S.scheduled.value, S.materials_ready.value, S.confirmed.value, S.violation.value}


def school_name(school) -> str | None:
    return pick(school.name, school.name_en, school.name_kz) if school else None


def department_name(dept: Department | None) -> str | None:
    """In AITU a teacher's «department» imported from the directory is a school → use its English name."""
    if dept is None:
        return None
    if dept.school and dept.name == dept.school.name:
        return school_name(dept.school)
    return dept.name


def _avg(values) -> float | None:
    values = [v for v in values if v is not None]
    return round(mean(values), 2) if values else None


def _rate(part: int, whole: int) -> float | None:
    return round(part / whole * 100, 1) if whole else None


def filtered_lessons(
    db: Session,
    year_id: int | None = None,
    trimester_id: int | None = None,
    school_id: int | None = None,
    department_id: int | None = None,
) -> list[OpenLesson]:
    stmt = (
        select(OpenLesson)
        .join(Trimester)
        .where(OpenLesson.status != S.draft.value)
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
    if department_id:
        stmt = stmt.where(OpenLesson.department_id == department_id)
    if school_id:
        stmt = stmt.join(Department, OpenLesson.department_id == Department.id).where(Department.school_id == school_id)
    return list(db.scalars(stmt.order_by(OpenLesson.date)).unique().all())


def lesson_metrics(lesson: OpenLesson, now) -> dict:
    submitted = [f for f in lesson.feedbacks if f.status == FeedbackStatus.submitted.value]
    deadline = lesson.materials_deadline
    deadline_passed = bool(deadline and (lesson.effective_deadline or deadline) <= now)
    on_time = lesson.has_all_materials and all(m.on_time for m in lesson.materials)
    return {
        "conducted": lesson.status in CONDUCTED,
        "annulled": lesson.status == S.annulled.value,
        "deadline_passed": deadline_passed,
        "materials_on_time": on_time,
        "visits": sum(a.status == AttendanceStatus.confirmed.value for a in lesson.attendances),
        "fb_expected": len(lesson.feedbacks),
        "fb_submitted": len(submitted),
        "fb_expired": sum(f.status == FeedbackStatus.expired.value for f in lesson.feedbacks),
        "avg": _avg(f.average for f in submitted),
    }


def _group(rows: list[tuple[OpenLesson, dict]]) -> dict:
    due = [m for _, m in rows if m["deadline_passed"]]
    conducted = [m for _, m in rows if m["conducted"]]
    expected = sum(m["fb_expected"] for _, m in rows)
    submitted = sum(m["fb_submitted"] for _, m in rows)
    return {
        "total": len(rows),
        "conducted": len(conducted),
        "annulled": sum(m["annulled"] for _, m in rows),
        "planned": sum(lesson.status in PLANNED for lesson, _ in rows),
        "materials_on_time_rate": _rate(sum(m["materials_on_time"] for m in due), len(due)),
        "visits": sum(m["visits"] for _, m in rows),
        "avg_visits": _avg(m["visits"] for m in conducted),
        "feedback_expected": expected,
        "feedback_submitted": submitted,
        "feedback_rate": _rate(submitted, expected),
        "avg_score": _avg(m["avg"] for _, m in rows),
    }


def compute(db: Session, **filters) -> dict:
    now = clock.now()
    lessons = filtered_lessons(db, **filters)
    rows = [(lesson, lesson_metrics(lesson, now)) for lesson in lessons]

    by_status = Counter(lesson.status for lesson in lessons)
    criteria = db.scalars(select(FeedbackCriterion).order_by(FeedbackCriterion.order)).all()
    submitted = [f for lesson in lessons for f in lesson.feedbacks if f.status == FeedbackStatus.submitted.value]
    per_criterion = []
    for c in criteria:
        vals = [int(f.scores[str(c.id)]) for f in submitted if f.scores.get(str(c.id))]
        if vals:
            per_criterion.append({"id": c.id, "title": pick(c.title, c.title_en, c.title_kk), "average": round(mean(vals), 2),
                                  "count": len(vals)})

    def grouped(key_fn, label_fn) -> list[dict]:
        groups: dict = defaultdict(list)
        for lesson, m in rows:
            groups[key_fn(lesson)].append((lesson, m))
        return [{"key": k, **label_fn(v[0][0]), **_group(v)} for k, v in groups.items()]

    by_department = grouped(
        lambda l: l.department_id or 0,
        lambda l: {
            "department": department_name(l.department) if l.department else tr("Без кафедры", "No department", "Кафедрасыз"),
            "school": school_name(l.department.school) if l.department else None,
        },
    )
    by_teacher = grouped(
        lambda l: l.teacher_id,
        lambda l: {
            "teacher": l.teacher.full_name,
            "teacher_id": l.teacher_id,
            "department": department_name(l.department),
        },
    )
    by_trimester = grouped(
        lambda l: l.trimester_id,
        lambda l: {
            "label": tr(f"{l.trimester.roman} триместр {l.trimester.year.name}", f"Trimester {l.trimester.roman} {l.trimester.year.name}",
                        f"{l.trimester.year.name} оқу жылы, {l.trimester.roman} триместр"),
            "order": (l.trimester.year.name, l.trimester.number),
        },
    )
    by_trimester.sort(key=lambda r: r.pop("order"))
    months: dict = defaultdict(lambda: Counter())
    for lesson, m in rows:
        key = lesson.date.strftime("%Y-%m")
        months[key]["total"] += 1
        months[key]["conducted"] += int(m["conducted"])
        months[key]["annulled"] += int(m["annulled"])
    observers = Counter()
    names = {}
    for lesson in lessons:
        for a in lesson.attendances:
            if a.status == AttendanceStatus.confirmed.value:
                observers[a.user_id] += 1
                names[a.user_id] = (a.full_name, a.department_name)
    top_lessons = sorted(
        ({"id": l.id, "topic": l.topic, "teacher": l.teacher.full_name, "date": l.date, "avg_score": m["avg"], "feedback": m["fb_submitted"]}
         for l, m in rows if m["avg"] is not None),
        key=lambda x: (-x["avg_score"], -x["feedback"]),
    )[:5]

    return {
        "generated_at": now,
        "summary": _group(rows),
        "by_status": [{"status": s, "label": status_label(s), "count": by_status.get(s, 0)} for s in STATUS_LABELS if s != S.draft.value],
        "criteria": per_criterion,
        "by_department": sorted(by_department, key=lambda r: -r["total"]),
        "by_teacher": sorted(by_teacher, key=lambda r: (-r["conducted"], r["teacher"])),
        "by_trimester": by_trimester,
        "by_month": [{"month": k, **v} for k, v in sorted(months.items())],
        "top_lessons": top_lessons,
        "top_observers": [
            {"user_id": uid, "full_name": names[uid][0], "department": names[uid][1], "visits": n}
            for uid, n in observers.most_common(8)
        ],
        "lessons": [
            {
                "id": l.id,
                "date": l.date,
                "time": f"{l.start_time:%H:%M}–{l.end_time:%H:%M}",
                "teacher": l.teacher.full_name,
                "position": l.teacher_position,
                "department": department_name(l.department),
                "topic": l.topic,
                "discipline": l.discipline,
                "place": l.place,
                "status": l.status,
                "status_label": status_label(l.status),
                "trimester": f"{l.trimester.roman} ({l.trimester.year.name})",
                "annul_reason": pick(l.annul_reason, l.annul_reason_en, l.annul_reason_kk),
                **m,
            }
            for l, m in rows
        ],
    }
