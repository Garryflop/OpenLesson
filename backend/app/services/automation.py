"""Автоматический цикл работы платформы (раздел 11 ТЗ).

``run_cycle`` is idempotent: it inspects every active lesson and performs the
steps that are due at ``now``. It is executed periodically by the scheduler and
can be triggered manually by the administrator.

| Когда                   | Действие                                                      |
|-------------------------|---------------------------------------------------------------|
| За 10 дней              | Предварительное напоминание о загрузке документов             |
| За 7 дней               | Уведомление преподавателю + окончательная проверка материалов |
| При нарушении дедлайна  | Аннулирование / нарушение / доп. срок (политика в настройках) |
| За 3 дня                | Генерация постера AITU и рассылка всем ППС                    |
| После занятия           | Статус «Проведено», напоминание внести посетителей по явочному листу |
| В течение 3 дней        | Напоминания о Feedback через 1 и 2 дня                        |
| По окончании срока      | Подсчёт результатов, AI-анализ, итоговое уведомление          |

All texts go through ``tr(ru, en, kk)``: notifications are stored in RU, KK and EN, e-mails use the recipient's language.
"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import clock
from app.i18n import tr
from app.models import FeedbackStatus, LessonStatus, OpenLesson, Trimester, TrimesterStatus, User
from app.services import ai, app_settings, lesson_logic, notify, poster
from app.services.notify import Message, lesson_fields
from app.utils import count, fmt_dt

log = logging.getLogger("openlesson.automation")
S = LessonStatus

ACTIVE = [S.scheduled, S.materials_ready, S.confirmed, S.violation, S.completed, S.feedback]
DAYS = ("день", "дня", "дней"), ("day", "days"), "күн"


def _missing(lesson: OpenLesson) -> str:
    return ", ".join(lesson_logic.missing_materials(lesson))


def _materials_line(lesson: OpenLesson) -> str:
    if lesson.has_all_materials:
        return tr("Все обязательные материалы загружены.", "All required materials are uploaded.", "Барлық міндетті материалдар жүктелді.")
    return tr("Не загружено: ", "Missing: ", "Жүктелмеген құжаттар: ") + _missing(lesson) + "."


def _pre_reminder(db: Session, lesson: OpenLesson, days_left: int) -> None:
    notify.send(
        db,
        lesson.teacher,
        lambda: Message(
            kind="pre_reminder",
            category=tr("Предварительное напоминание", "Early reminder", "Алдын ала еске салу"),
            title=tr("Загрузите материалы открытого занятия", "Upload the materials for your open lesson", "Ашық сабақтың материалдарын жүктеңіз"),
            intro=[
                tr(
                    f"Через {count(days_left, *DAYS)} состоится ваше открытое занятие.", f"Your open lesson takes place in {count(days_left, *DAYS)}.",
                    f"Ашық сабағыңыздың өтуіне {count(days_left, *DAYS)} қалды.",
                ),
                tr(
                    f"Напоминаем: презентацию и план занятия необходимо загрузить до {fmt_dt(lesson.effective_deadline)}.",
                    f"Reminder: the slides and the lesson plan must be uploaded by {fmt_dt(lesson.effective_deadline)}.",
                    f"Еске саламыз: презентация мен сабақ жоспарын жүктеудің соңғы мерзімі — {fmt_dt(lesson.effective_deadline)}.",
                ),
            ],
            fields=lesson_fields(lesson),
            outro=[_materials_line(lesson)],
            link=f"/lessons/{lesson.id}",
            link_label=tr("Загрузить материалы", "Upload materials", "Материалдарды жүктеу"),
        ),
        lesson,
    )


def _reminder(db: Session, lesson: OpenLesson, days_left: int) -> None:
    notify.send(
        db,
        lesson.teacher,
        lambda: Message(
            kind="reminder",
            category=tr("Напоминание", "Reminder", "Еске салу"),
            title=tr("Напоминание об открытом занятии", "Open lesson reminder", "Ашық сабақ туралы еске салу"),
            intro=[tr(
                f"Напоминаем, что через {count(days_left, *DAYS)} состоится ваше открытое занятие.",
                f"This is a reminder that your open lesson takes place in {count(days_left, *DAYS)}.",
                f"Ашық сабағыңыздың өтуіне {count(days_left, *DAYS)} қалғанын еске саламыз.",
            )],
            fields=lesson_fields(lesson),
            outro=[
                tr(
                    "Пожалуйста, убедитесь, что презентация и план открытого занятия загружены в OpenLesson "
                    f"до установленного срока ({fmt_dt(lesson.effective_deadline)}).",
                    "Please make sure the slides and the lesson plan are uploaded to OpenLesson "
                    f"before the deadline ({fmt_dt(lesson.effective_deadline)}).",
                    "Презентация мен ашық сабақ жоспары OpenLesson жүйесіне белгіленген мерзімге дейін "
                    f"({fmt_dt(lesson.effective_deadline)}) жүктелгеніне көз жеткізуіңізді сұраймыз.",
                ),
                _materials_line(lesson),
            ],
            link=f"/lessons/{lesson.id}",
        ),
        lesson,
    )


def _violation(db: Session, lesson: OpenLesson, now: datetime) -> None:
    lesson.status = S.violation.value
    lesson.violation_at = now
    lesson_logic.log_event(db, lesson, "violation", lambda: tr(
        f"Нарушен срок загрузки материалов. Не загружено: {_missing(lesson)}",
        f"Upload deadline missed. Missing: {_missing(lesson)}",
        f"Материалдарды жүктеу мерзімі бұзылды. Жүктелмеген құжаттар: {_missing(lesson)}",
    ))
    notify.send(
        db,
        lesson.teacher,
        lambda: Message(
            kind="violation",
            category=tr("Нарушение срока", "Missed deadline", "Мерзімнің бұзылуы"),
            title=tr("Нарушен срок загрузки материалов", "Upload deadline missed", "Материалдарды жүктеу мерзімі бұзылды"),
            intro=[
                tr(
                    "Истёк срок загрузки обязательных материалов открытого занятия.", "The deadline for uploading the required materials has passed.",
                    "Ашық сабақтың міндетті материалдарын жүктеу мерзімі аяқталды.",
                ),
                tr(f"Не загружено: {_missing(lesson)}.", f"Missing: {_missing(lesson)}.", f"Жүктелмеген құжаттар: {_missing(lesson)}."),
            ],
            fields=lesson_fields(lesson),
            outro=[tr(
                "Решение о проведении занятия примет администратор. Загрузите материалы как можно скорее.",
                "The administrator will decide whether the lesson takes place. Please upload the materials as soon as possible.",
                "Сабақты өткізу туралы шешімді әкімші қабылдайды. Материалдарды мүмкіндігінше тезірек жүктеуіңізді сұраймыз.",
            )],
            link=f"/lessons/{lesson.id}",
        ),
        lesson,
    )
    notify.send_many(
        db,
        lesson_logic.responsible(db, lesson),
        lambda: Message(
            kind="violation_admin",
            category=tr("Нарушение срока", "Missed deadline", "Мерзімнің бұзылуы"),
            title=tr(
                f"Требуется решение: {lesson.teacher.full_name}", f"Decision needed: {lesson.teacher.full_name}",
                f"Шешім қабылдау қажет: {lesson.teacher.full_name}",
            ),
            intro=[
                tr(
                    "Преподаватель не загрузил обязательные материалы в срок.", "The teacher did not upload the required materials on time.",
                    "Оқытушы міндетті материалдарды мерзімінде жүктемеді.",
                ),
                tr(f"Не загружено: {_missing(lesson)}.", f"Missing: {_missing(lesson)}.", f"Жүктелмеген құжаттар: {_missing(lesson)}."),
            ],
            fields=lesson_fields(lesson, with_teacher=True),
            outro=[tr(
                "Аннулируйте занятие, продлите срок или подтвердите проведение в карточке занятия.",
                "Annul the lesson, extend the deadline or confirm it on the lesson page.",
                "Сабақ карточкасында сабақтың күшін жойыңыз, мерзімді ұзартыңыз немесе сабақтың өткізілуін растаңыз.",
            )],
            link=f"/lessons/{lesson.id}",
        ),
        lesson,
    )


def _deadline_check(db: Session, lesson: OpenLesson, now: datetime, cfg: dict, report: dict) -> None:
    if lesson.has_all_materials:
        lesson_logic.confirm_lesson(db, lesson, None)
        report["confirmed"].append(lesson.id)
        return
    policy = cfg["annul_policy"]
    if policy == "admin_confirm":
        _violation(db, lesson, now)
        report["violations"].append(lesson.id)
    elif policy == "grace" and lesson.extended_deadline is None:
        until = lesson.effective_deadline + timedelta(hours=int(cfg["grace_hours"]))
        lesson_logic.extend_deadline(
            db, lesson, until, lambda: tr(
                "Дополнительный срок по политике платформы.", "Extra time under the platform policy.",
                "Қосымша мерзім платформа саясатына сәйкес берілді.",
            ), None
        )
        notify.send_many(
            db,
            lesson_logic.responsible(db, lesson),
            lambda: Message(
                kind="grace_admin",
                category=tr("Нарушение срока", "Missed deadline", "Мерзімнің бұзылуы"),
                title=tr(
                    f"Дополнительный срок: {lesson.teacher.full_name}", f"Extra time given: {lesson.teacher.full_name}",
                    f"Қосымша мерзім: {lesson.teacher.full_name}",
                ),
                intro=[
                    tr(
                        f"Материалы не загружены вовремя (не загружено: {_missing(lesson)}).",
                        f"Materials were not uploaded on time (missing: {_missing(lesson)}).",
                        f"Материалдар уақытында жүктелмеді (жүктелмеген құжаттар: {_missing(lesson)}).",
                    ),
                    tr(
                        f"Предоставлен дополнительный срок до {fmt_dt(until)}.", f"Extra time has been given until {fmt_dt(until)}.",
                        f"Қосымша мерзім берілді, жаңа мерзім: {fmt_dt(until)}.",
                    ),
                ],
                fields=lesson_fields(lesson, with_teacher=True),
                link=f"/lessons/{lesson.id}",
            ),
            lesson,
            email=False,
        )
        report["extended"].append(lesson.id)
    else:
        lesson_logic.annul(db, lesson, lambda: tr(
            f"Не загружены обязательные материалы до установленного срока ({_missing(lesson)})",
            f"The required materials were not uploaded by the deadline ({_missing(lesson)})",
            f"Міндетті материалдар белгіленген мерзімге дейін жүктелмеді ({_missing(lesson)})",
        ))
        report["annulled"].append(lesson.id)


def faculty_recipients(db: Session) -> list[User]:
    return list(db.scalars(select(User).where(User.is_active.is_(True), User.is_faculty.is_(True))).all())


def publish_poster(db: Session, lesson: OpenLesson, actor: User | None = None, regenerate_text: bool = False) -> int:
    """Generate the poster (AI invitation text + template) and mail it to all faculty."""
    if regenerate_text or not lesson.invitation_text:
        ai.generate_invitation(db, lesson)
    poster.generate(db, lesson)
    recipients = faculty_recipients(db)

    def msg() -> Message:
        return Message(
            kind="poster",
            category=tr("Приглашение", "Invitation", "Шақыру"),
            title=tr(
                f"Приглашение на открытое занятие · {lesson.teacher.full_name}", f"Invitation to an open lesson · {lesson.teacher.full_name}",
                f"Ашық сабаққа шақыру · {lesson.teacher.full_name}",
            ),
            intro=[lesson.invitation_text or tr(
                "Приглашаем вас на открытое занятие!", "You are invited to an open lesson!", "Сізді ашық сабаққа шақырамыз!"
            )],
            fields=lesson_fields(lesson, with_teacher=True),
            outro=[tr("Постер-приглашение во вложении.", "The invitation poster is attached.", "Шақыру постері хатқа тіркелген.")],
            link=f"/lessons/{lesson.id}",
            link_label=tr("Карточка занятия", "Lesson page", "Сабақ карточкасы"),
            attachments=[{"path": lesson.poster_png, "name": f"OpenLesson_{lesson.id}.png", "mime": "image/png"}],
        )

    sent = notify.send_many(db, recipients, msg, lesson)
    lesson.poster_sent_at = clock.now()
    to_teachers = ("преподавателю", "преподавателям", "преподавателям"), ("teacher", "teachers"), "оқытушыға"
    lesson_logic.log_event(db, lesson, "poster_sent", lambda: tr(
        f"Постер опубликован и разослан {count(sent, *to_teachers)}",
        f"The poster was published and sent to {count(sent, *to_teachers)}",
        f"Постер жарияланып, {count(sent, *to_teachers)} жіберілді",
    ), actor)
    db.commit()
    return sent


def _completed(db: Session, lesson: OpenLesson, report: dict) -> None:
    lesson.status = S.completed.value
    lesson.completed_notified_at = clock.now()
    lesson_logic.log_event(db, lesson, "completed", lambda: tr(
        "Занятие проведено. Ожидается подтверждение списка посетителей",
        "The lesson has been held. Waiting for the attendee list",
        "Сабақ өткізілді. Қатысушылар тізімін растау күтілуде",
    ))
    notify.send_many(
        db,
        notify.managers(db),
        lambda: Message(
            kind="register_attendance",
            category=tr("Регистрация посетителей", "Attendee registration", "Қатысушыларды тіркеу"),
            title=tr(
                f"Внесите посетителей: {lesson.teacher.full_name}", f"Enter the attendees: {lesson.teacher.full_name}",
                f"Қатысушыларды енгізіңіз: {lesson.teacher.full_name}",
            ),
            intro=[tr(
                "Открытое занятие проведено. Внесите преподавателей из явочного листа и подтвердите список — "
                "после этого посетителям откроются формы Feedback.",
                "The open lesson has been held. Enter the teachers from the attendance sheet and confirm the list — "
                "the attendees will then receive their feedback forms.",
                "Ашық сабақ өткізілді. Қатысу парағындағы оқытушыларды енгізіп, тізімді растаңыз — "
                "осыдан кейін қатысушыларға Feedback формалары ашылады.",
            )],
            fields=lesson_fields(lesson, with_teacher=True),
            link=f"/lessons/{lesson.id}#attendance",
        ),
        lesson,
        email=False,
    )
    report["completed"].append(lesson.id)


def _feedback_reminders(db: Session, lesson: OpenLesson, now: datetime, cfg: dict, report: dict) -> None:
    offsets = list(cfg.get("feedback_reminder_days") or [1, 2])
    for fb in lesson.feedbacks:
        if fb.status not in (FeedbackStatus.pending.value, FeedbackStatus.draft.value) or now >= fb.due_at:
            continue
        due_steps = [i for i, d in enumerate(offsets) if now >= fb.opened_at + timedelta(days=d)]
        if due_steps and fb.reminders_sent <= due_steps[-1]:
            fb.reminders_sent = due_steps[-1] + 1
            notify.send(
                db,
                fb.author,
                lambda fb=fb: Message(
                    kind="feedback_reminder",
                    category=tr("Напоминание о Feedback", "Feedback reminder", "Feedback туралы еске салу"),
                    title=tr("Напоминание: заполните Feedback", "Reminder: please fill in the feedback form", "Еске салу: Feedback формасын толтырыңыз"),
                    intro=[tr(
                        f"Вы ещё не отправили отзыв об открытом занятии. Форма доступна до {fmt_dt(fb.due_at)}.",
                        f"You have not sent your review of the open lesson yet. The form is open until {fmt_dt(fb.due_at)}.",
                        f"Сіз ашық сабақ туралы пікіріңізді әлі жібермедіңіз. Форманы толтыру мерзімі: {fmt_dt(fb.due_at)}.",
                    )],
                    fields=lesson_fields(lesson, with_teacher=True),
                    link=f"/feedback/{fb.id}",
                    link_label=tr("Заполнить Feedback", "Fill in feedback", "Feedback толтыру"),
                ),
                lesson,
            )
            report["feedback_reminders"].append(fb.id)


def process_lesson(db: Session, lesson: OpenLesson, now: datetime, cfg: dict, report: dict) -> None:
    start, end = lesson.start_dt, lesson.end_dt
    status = lesson.status

    if status in lesson_logic.PRE_DEADLINE:
        reminder_at = start - timedelta(days=int(cfg["reminder_days"]))
        pre_at = start - timedelta(days=int(cfg["pre_reminder_days"]))
        if lesson.pre_reminder_sent_at is None and now >= pre_at:
            lesson.pre_reminder_sent_at = now
            deadline = lesson.effective_deadline
            if now < reminder_at and not lesson.has_all_materials and deadline and now < deadline:
                _pre_reminder(db, lesson, max((start.date() - now.date()).days, 1))
                report["pre_reminders"].append(lesson.id)
        if lesson.reminder_sent_at is None and now >= reminder_at and now < start:
            lesson.reminder_sent_at = now
            _reminder(db, lesson, max((start.date() - now.date()).days, 1))
            report["reminders"].append(lesson.id)
        deadline = lesson.effective_deadline
        if deadline and now >= deadline:
            _deadline_check(db, lesson, now, cfg, report)
        status = lesson.status

    if status == S.violation.value and now >= start:
        lesson_logic.annul(db, lesson, lambda: tr(
            "Материалы не загружены, решение о проведении не принято до начала занятия",
            "Materials were not uploaded and no decision was made before the lesson started",
            "Материалдар жүктелмеді, сабақ басталғанға дейін оны өткізу туралы шешім қабылданбады",
        ))
        report["annulled"].append(lesson.id)
        return

    if status == S.confirmed.value:
        poster_at = start - timedelta(days=int(cfg["poster_days"]))
        if lesson.poster_sent_at is None and poster_at <= now < start:
            try:
                publish_poster(db, lesson)
                report["posters"].append(lesson.id)
            except Exception as exc:  # noqa: BLE001 — poster failure must not stop the cycle
                db.rollback()
                log.exception("Poster for lesson %s failed", lesson.id)
                report["errors"].append(f"poster {lesson.id}: {exc}")
        if now >= end:
            _completed(db, lesson, report)

    if status == S.feedback.value:
        _feedback_reminders(db, lesson, now, cfg, report)
        if lesson.feedback_due_at and now >= lesson.feedback_due_at:
            lesson_logic.close_feedback(db, lesson)
            report["closed"].append(lesson.id)


def run_cycle(db: Session, now: datetime | None = None) -> dict:
    now = now or clock.now()
    cfg = app_settings.get_all(db)
    report: dict = defaultdict(list)
    lessons = db.scalars(
        select(OpenLesson)
        .join(Trimester)
        .where(
            Trimester.status == TrimesterStatus.approved.value,
            OpenLesson.status.in_([s.value for s in ACTIVE]),
        )
        .order_by(OpenLesson.date, OpenLesson.start_time)
    ).all()
    for lesson in lessons:
        try:
            process_lesson(db, lesson, now, cfg, report)
            db.commit()
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            log.exception("Automation failed for lesson %s", lesson.id)
            report["errors"].append(f"lesson {lesson.id}: {exc}")
    report["email"] = notify.process_outbox(db)
    report["checked"] = len(lessons)
    report["at"] = now.isoformat()
    return dict(report)
