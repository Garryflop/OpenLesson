"""Модуль 6. Электронная форма обратной связи, просмотр отзывов и ответы преподавателя."""

from statistics import mean

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import clock
from app.db import get_db
from app.deps import can_view_lesson_details, ensure, get_current_user, require_admin, require_manager
from app.i18n import pick, tr
from app.models import AIAnalysis, Feedback, FeedbackCriterion, FeedbackReply, FeedbackStatus, OpenLesson, User
from app.schemas import CriterionIn, FeedbackIn, ReplyIn
from app.serializers import analysis_out, feedback_out, lesson_out, user_brief
from app.services import lesson_logic, notify, reports
from app.services.notify import Message

router = APIRouter(prefix="/api", tags=["feedback"])
OPEN = (FeedbackStatus.pending.value, FeedbackStatus.draft.value)


def criteria_list(db: Session, active_only: bool = True) -> list[FeedbackCriterion]:
    stmt = select(FeedbackCriterion).order_by(FeedbackCriterion.order, FeedbackCriterion.id)
    if active_only:
        stmt = stmt.where(FeedbackCriterion.is_active.is_(True))
    return list(db.scalars(stmt).all())


def criterion_out(c: FeedbackCriterion) -> dict:
    """``title``/``description`` for display in the request language + raw values for the admin editor."""
    return {
        "id": c.id,
        "title": pick(c.title, c.title_en, c.title_kk),
        "description": pick(c.description, c.description_en, c.description_kk),
        "title_ru": c.title,
        "title_en": c.title_en,
        "title_kk": c.title_kk,
        "description_ru": c.description,
        "description_en": c.description_en,
        "description_kk": c.description_kk,
        "order": c.order,
        "is_active": c.is_active,
    }


@router.get("/feedback/criteria")
def get_criteria(all: bool = False, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [criterion_out(c) for c in criteria_list(db, active_only=not all)]


def _criterion_values(data: CriterionIn, only_sent: bool = False) -> dict:
    """Clean input; on update, fields the client did not send (e.g. ``title_en``/``title_kk``) are left untouched."""
    values = data.model_dump(exclude_unset=only_sent)
    for key in ("description", "title_en", "description_en", "title_kk", "description_kk"):
        if key in values:
            values[key] = (values[key] or "").strip() or None  # blank translation → fall back to Russian
    values["title"] = values["title"].strip()
    return values


@router.post("/feedback/criteria", status_code=201)
def add_criterion(data: CriterionIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    c = FeedbackCriterion(**_criterion_values(data))
    db.add(c)
    db.commit()
    return criterion_out(c)


@router.put("/feedback/criteria/{criterion_id}")
def update_criterion(criterion_id: int, data: CriterionIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    c = db.get(FeedbackCriterion, criterion_id)
    if c is None:
        raise HTTPException(404)
    for k, v in _criterion_values(data, only_sent=True).items():
        setattr(c, k, v)
    db.commit()
    return criterion_out(c)


@router.get("/feedback/my")
def my_feedback(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = db.scalars(select(Feedback).where(Feedback.author_id == user.id).order_by(Feedback.due_at.desc())).all()
    return [feedback_out(f, include_author=False) | {"lesson": lesson_out(f.lesson, user)} for f in items]


def _get(db: Session, feedback_id: int) -> Feedback:
    fb = db.get(Feedback, feedback_id)
    if fb is None:
        raise HTTPException(404, tr("Форма не найдена", "Form not found", "Форма табылмады"))
    return fb


@router.get("/feedback/{feedback_id}")
def get_feedback(feedback_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fb = _get(db, feedback_id)
    is_author = fb.author_id == user.id
    ensure(
        is_author or (fb.status == FeedbackStatus.submitted.value and can_view_lesson_details(user, fb.lesson)),
        tr("Форма доступна только зарегистрированному посетителю занятия", "The form is available only to a registered attendee of the lesson",
           "Форма тек сабаққа тіркелген қатысушыға қолжетімді"),
    )
    return feedback_out(fb) | {
        "lesson": lesson_out(fb.lesson, user),
        "criteria": [criterion_out(c) for c in criteria_list(db)],
        "is_author": is_author,
        "editable": is_author and fb.status in OPEN and clock.now() < fb.due_at,
    }


def _apply(fb: Feedback, data: FeedbackIn) -> None:
    fb.scores = {k: v for k, v in data.scores.items()}
    fb.strengths, fb.improvements, fb.comment = data.strengths, data.improvements, data.comment


def _editable(fb: Feedback, user: User) -> None:
    ensure(fb.author_id == user.id, tr("Редактировать отзыв может только его автор", "Only the author can edit the review",
                                           "Пікірді тек оның авторы өңдей алады"))
    if fb.status == FeedbackStatus.submitted.value:
        raise HTTPException(409, tr("Отзыв уже отправлен — повторная отправка невозможна",
                                    "The review has already been submitted and cannot be submitted again",
                                    "Пікір жіберіліп қойған — қайта жіберу мүмкін емес"))
    if fb.status == FeedbackStatus.expired.value or clock.now() >= fb.due_at:
        raise HTTPException(400, tr("Срок заполнения формы истёк", "The deadline for filling in the form has passed",
                                    "Форманы толтыру мерзімі өтіп кетті"))


@router.put("/feedback/{feedback_id}")
def save_draft(feedback_id: int, data: FeedbackIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fb = _get(db, feedback_id)
    _editable(fb, user)
    _apply(fb, data)
    fb.status = FeedbackStatus.draft.value
    db.commit()
    return feedback_out(fb, include_author=False)


@router.post("/feedback/{feedback_id}/submit")
def submit(feedback_id: int, data: FeedbackIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fb = _get(db, feedback_id)
    _editable(fb, user)
    _apply(fb, data)
    missing = [pick(c.title, c.title_en, c.title_kk) for c in criteria_list(db) if not fb.scores.get(str(c.id))]
    if missing:
        raise HTTPException(400, tr("Оцените все критерии: ", "Rate all criteria: ", "Барлық критерийлерді бағалаңыз: ") + ", ".join(missing))
    if not (data.strengths or "").strip() and not (data.improvements or "").strip():
        raise HTTPException(400, tr("Заполните хотя бы одно текстовое поле (сильные стороны или рекомендации)",
                                    "Fill in at least one text field (strengths or recommendations)",
                                    "Кемінде бір мәтіндік өрісті толтырыңыз (күшті жақтары немесе ұсыныстар)"))
    fb.status = FeedbackStatus.submitted.value
    fb.submitted_at = clock.now()
    lesson = fb.lesson
    author, topic = user.full_name, lesson.topic
    lesson_logic.log_event(
        db, lesson, "feedback_submitted", lambda: tr(
            f"Получен отзыв от {author}", f"Review received from {author}", f"{author} пікір қалдырды"
        ), user
    )
    notify.send(
        db,
        lesson.teacher,
        lambda: Message(
            kind="feedback_received",
            category="Feedback",
            title=tr("Получен новый отзыв о вашем открытом занятии", "New review of your open lesson",
                     "Ашық сабағыңыз туралы жаңа пікір келді"),
            intro=[tr(f"{author} оставил(а) отзыв о вашем открытом занятии «{topic}».",
                      f"{author} left a review of your open lesson “{topic}”.",
                      f"{author} сіздің «{topic}» ашық сабағыңыз туралы пікір қалдырды.")],
            link=f"/lessons/{lesson.id}#feedback",
            link_label=tr("Посмотреть отзыв", "View the review", "Пікірді қарау"),
        ),
        lesson,
        email=False,
    )
    db.commit()
    return feedback_out(fb, include_author=False)


@router.post("/feedback/{feedback_id}/replies", status_code=201)
def reply(feedback_id: int, data: ReplyIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fb = _get(db, feedback_id)
    ensure(fb.lesson.teacher_id == user.id, tr("Ответить может только преподаватель, проводивший занятие",
                                                "Only the teacher who gave the lesson can reply",
                                                "Сабақты өткізген оқытушы ғана жауап бере алады"))
    if fb.status != FeedbackStatus.submitted.value:
        raise HTTPException(400, tr("Отзыв ещё не отправлен", "The review has not been submitted yet", "Пікір әлі жіберілмеген"))
    text = data.text.strip()
    r = FeedbackReply(feedback_id=fb.id, author_id=user.id, text=text)
    db.add(r)
    teacher, topic = user.full_name, fb.lesson.topic
    notify.send(
        db,
        fb.author,
        lambda: Message(
            kind="feedback_reply",
            category="Feedback",
            title=tr("Ответ на ваш отзыв", "Reply to your review", "Пікіріңізге жауап"),
            intro=[tr(f"{teacher} ответил(а) на ваш отзыв об открытом занятии «{topic}»:",
                      f"{teacher} replied to your review of the open lesson “{topic}”:",
                      f"{teacher} «{topic}» ашық сабағы туралы пікіріңізге жауап берді:"), text],
            link=f"/feedback/{fb.id}",
        ),
        fb.lesson,
        email=False,
    )
    db.commit()
    return {"id": r.id, "text": r.text, "created_at": r.created_at, "author": user_brief(user)}


def lesson_feedback_stats(db: Session, lesson: OpenLesson) -> dict:
    criteria = criteria_list(db, active_only=False)
    submitted = [f for f in lesson.feedbacks if f.status == FeedbackStatus.submitted.value]
    per = []
    for c in criteria:
        vals = [int(f.scores[str(c.id)]) for f in submitted if f.scores.get(str(c.id))]
        if vals or c.is_active:
            per.append({"id": c.id, "title": pick(c.title, c.title_en, c.title_kk), "average": round(mean(vals), 2) if vals else None,
                        "count": len(vals)})
    overall = [f.average for f in submitted if f.average is not None]
    return {
        "criteria": per,
        "overall": round(mean(overall), 2) if overall else None,
        "submitted": len(submitted),
        "total": len(lesson.feedbacks),
        "pending": [user_brief(f.author) | {"status": f.status, "due_at": f.due_at} for f in lesson.feedbacks if f.status != FeedbackStatus.submitted.value],
    }


@router.get("/lessons/{lesson_id}/feedback")
def lesson_feedback(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lesson = db.get(OpenLesson, lesson_id)
    if lesson is None:
        raise HTTPException(404)
    ensure(can_view_lesson_details(user, lesson))
    submitted = sorted(
        (f for f in lesson.feedbacks if f.status == FeedbackStatus.submitted.value), key=lambda f: f.submitted_at
    )
    summary = db.scalars(
        select(AIAnalysis)
        .where(AIAnalysis.lesson_id == lesson.id, AIAnalysis.kind == "feedback")
        .order_by(AIAnalysis.created_at.desc())
    ).first()
    stats = lesson_feedback_stats(db, lesson)
    if not user.is_manager:
        stats["pending"] = []
    return {
        "items": [feedback_out(f) for f in submitted],
        "stats": stats,
        "ai_summary": analysis_out(summary),
        "can_reply": lesson.teacher_id == user.id,
    }


@router.get("/lessons/{lesson_id}/feedback/pdf")
def lesson_feedback_pdf(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lesson = db.get(OpenLesson, lesson_id)
    if lesson is None:
        raise HTTPException(404)
    ensure(can_view_lesson_details(user, lesson))
    summary = db.scalars(
        select(AIAnalysis)
        .where(AIAnalysis.lesson_id == lesson.id, AIAnalysis.kind == "feedback")
        .order_by(AIAnalysis.created_at.desc())
    ).first()
    pdf = reports.feedback_pdf(lesson, lesson_feedback_stats(db, lesson), criteria_list(db, active_only=False), summary)
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="feedback_lesson_{lesson.id}.pdf"'},
    )


@router.get("/feedback-control")
def feedback_control(db: Session = Depends(get_db), _: User = Depends(require_manager)):
    """Список неотправленных отзывов (контроль трёхдневного срока)."""
    rows = db.scalars(
        select(Feedback)
        .where(Feedback.status.in_([*OPEN, FeedbackStatus.expired.value]))
        .order_by(Feedback.due_at.desc())
    ).all()
    now = clock.now()
    return [
        {
            "id": f.id,
            "status": f.status,
            "due_at": f.due_at,
            "overdue": f.status == FeedbackStatus.expired.value or now >= f.due_at,
            "reminders_sent": f.reminders_sent,
            "author": user_brief(f.author),
            "lesson": {"id": f.lesson.id, "topic": f.lesson.topic, "teacher": f.lesson.teacher.full_name, "date": f.lesson.date},
        }
        for f in rows
    ]
