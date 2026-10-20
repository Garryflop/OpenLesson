"""State transitions of an open lesson and the notifications attached to them.

Notifications and history entries are built with ``lambda: ...`` + ``tr(ru, en, kk)`` so they are stored in
every interface language (RU / KK / EN); e-mails go out in the recipient's language (see services/notify.py).
"""

from collections.abc import Callable
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import clock
from app.i18n import both, get_lang, tr
from app.models import (
    Attendance,
    AttendanceStatus,
    Feedback,
    FeedbackStatus,
    LessonEvent,
    LessonStatus,
    Location,
    MaterialKind,
    OpenLesson,
    Trimester,
    TrimesterStatus,
    User,
)
from app.services import app_settings, notify
from app.services.notify import Message, lesson_fields
from app.utils import count, fmt_dt

S = LessonStatus

STATUS_LABELS = {
    S.draft.value: "Черновик графика",
    S.scheduled.value: "Ожидаются материалы",
    S.materials_ready.value: "Материалы загружены",
    S.confirmed.value: "Подтверждено",
    S.violation.value: "Нарушение срока",
    S.annulled.value: "Аннулировано",
    S.completed.value: "Проведено",
    S.feedback.value: "Сбор отзывов",
    S.closed.value: "Завершено",
}
STATUS_LABELS_KK = {
    S.draft.value: "Кесте жобасы",
    S.scheduled.value: "Материалдар күтілуде",
    S.materials_ready.value: "Материалдар жүктелді",
    S.confirmed.value: "Расталды",
    S.violation.value: "Мерзім бұзылды",
    S.annulled.value: "Күші жойылды",
    S.completed.value: "Өткізілді",
    S.feedback.value: "Пікір жинау",
    S.closed.value: "Аяқталды",
}
STATUS_LABELS_EN = {
    S.draft.value: "Draft schedule",
    S.scheduled.value: "Awaiting materials",
    S.materials_ready.value: "Materials uploaded",
    S.confirmed.value: "Confirmed",
    S.violation.value: "Deadline missed",
    S.annulled.value: "Annulled",
    S.completed.value: "Held",
    S.feedback.value: "Collecting feedback",
    S.closed.value: "Closed",
}
PRE_DEADLINE = {S.scheduled.value, S.materials_ready.value}
UPLOAD_ALLOWED = {S.draft.value, S.scheduled.value, S.materials_ready.value, S.violation.value}
MATERIAL_TITLES = {MaterialKind.presentation.value: "Презентация (PPT/PPTX)", MaterialKind.plan.value: "План занятия (DOC/DOCX/PDF)"}
MATERIAL_TITLES_EN = {MaterialKind.presentation.value: "Slides (PPT/PPTX)", MaterialKind.plan.value: "Lesson plan (DOC/DOCX/PDF)"}
MATERIAL_TITLES_KK = {MaterialKind.presentation.value: "Презентация (PPT/PPTX)", MaterialKind.plan.value: "Сабақ жоспары (DOC/DOCX/PDF)"}

# Free text typed by a user, or a bilingual builder for system-generated text.
Text = str | Callable[[], str]


def status_label(status: str) -> str:
    return tr(STATUS_LABELS.get(status, status), STATUS_LABELS_EN.get(status, status), STATUS_LABELS_KK.get(status))


def material_title(kind: str) -> str:
    return tr(MATERIAL_TITLES[kind], MATERIAL_TITLES_EN[kind], MATERIAL_TITLES_KK[kind])


def _text(value: Text) -> Callable[[], str]:
    return value if callable(value) else (lambda: value)


def log_event(db: Session, lesson: OpenLesson, kind: str, message: Text, actor: User | None = None) -> None:
    """Add a history entry; pass a callable using ``tr()`` to store it in every language."""
    texts = both(message) if callable(message) else {"ru": message, "en": None, "kk": None}
    db.add(
        LessonEvent(
            lesson_id=lesson.id,
            kind=kind,
            message=texts["ru"],
            message_en=texts["en"],
            message_kk=texts["kk"],
            actor_id=actor.id if actor else None,
        )
    )


def compute_deadline(db: Session, lesson_date: date) -> datetime:
    days = int(app_settings.get(db, "deadline_days"))
    hh, mm = (int(x) for x in str(app_settings.get(db, "deadline_time") or "18:00").split(":"))
    return datetime.combine(lesson_date - timedelta(days=days), time(hh, mm))


def missing_materials(lesson: OpenLesson) -> list[str]:
    """Titles of the missing documents in the current language."""
    return [material_title(k.value) for k in MaterialKind if lesson.material(k) is None]


def sync_materials_status(lesson: OpenLesson) -> None:
    if lesson.status in PRE_DEADLINE:
        lesson.status = S.materials_ready.value if lesson.has_all_materials else S.scheduled.value


def _link(lesson: OpenLesson) -> str:
    return f"/lessons/{lesson.id}"


def responsible(db: Session, lesson: OpenLesson) -> list[User]:
    return notify.managers(db) + notify.deans_for(db, lesson)


# ---------------------------------------------------------------- schedule approval


def activate_lesson(db: Session, lesson: OpenLesson, actor: User | None = None) -> None:
    lesson.materials_deadline = compute_deadline(db, lesson.date)
    lesson.status = S.scheduled.value
    sync_materials_status(lesson)
    log_event(db, lesson, "approved", lambda: tr(
        "Занятие включено в утверждённый график", "The lesson was added to the approved schedule",
        "Сабақ бекітілген кестеге енгізілді",
    ), actor)
    notify.send(
        db,
        lesson.teacher,
        lambda: Message(
            kind="lesson_scheduled",
            category=tr("График", "Schedule", "Кесте"),
            title=tr("Ваше открытое занятие включено в график", "Your open lesson is in the schedule", "Ашық сабағыңыз кестеге енгізілді"),
            intro=[tr(
                "Ваше открытое занятие включено в утверждённый график открытых занятий.",
                "Your open lesson has been added to the approved schedule of open lessons.",
                "Ашық сабағыңыз ашық сабақтардың бекітілген кестесіне енгізілді.",
            )],
            fields=lesson_fields(lesson),
            outro=[tr(
                f"Загрузите презентацию и план занятия до {fmt_dt(lesson.materials_deadline)}. "
                "Без обоих документов занятие не будет подтверждено.",
                f"Please upload the slides and the lesson plan by {fmt_dt(lesson.materials_deadline)}. "
                "Without both documents the lesson will not be confirmed.",
                f"Презентация мен сабақ жоспарын жүктеуіңізді сұраймыз, жүктеу мерзімі: {fmt_dt(lesson.materials_deadline)}. "
                "Екі құжат та жүктелмейінше сабақ расталмайды.",
            )],
            link=_link(lesson),
        ),
        lesson,
    )


def approve_trimester(db: Session, trimester: Trimester, actor: User) -> int:
    if trimester.status == TrimesterStatus.approved.value:
        raise HTTPException(400, tr("График уже утверждён", "The schedule is already approved", "Кесте бекітіліп қойған"))
    trimester.status = TrimesterStatus.approved.value
    trimester.approved_at = clock.now()
    trimester.approved_by_id = actor.id
    activated = 0
    for lesson in trimester.lessons:
        if lesson.status == S.draft.value:
            activate_lesson(db, lesson, actor)
            activated += 1
    db.commit()
    return activated


# ---------------------------------------------------------------- annulment / restore


def annul(db: Session, lesson: OpenLesson, reason: Text, actor: User | None = None) -> None:
    """Annul a lesson. ``reason`` is the user's text or, for system decisions, a bilingual builder."""
    if lesson.status in (S.annulled.value, S.closed.value):
        raise HTTPException(400, tr(
            "Занятие нельзя аннулировать в текущем статусе", "The lesson cannot be annulled in its current status",
            "Ағымдағы мәртебеде сабақтың күшін жою мүмкін емес",
        ))
    reasons = both(_text(reason))
    lesson.status = S.annulled.value
    lesson.annulled_at = clock.now()
    lesson.annul_reason = reasons["ru"]
    lesson.annul_reason_en = reasons["en"] if callable(reason) else None
    lesson.annul_reason_kk = reasons["kk"] if callable(reason) else None
    actor_name = actor.full_name if actor else None

    def why() -> str:
        return reasons[get_lang()]

    def who() -> str:
        if actor_name is None:
            return tr("автоматически", "automatically", "автоматты түрде")
        return tr(f"пользователем {actor_name}", f"by {actor_name}", f"{actor_name} тарапынан")

    log_event(db, lesson, "annulled", lambda: tr(
        f"Занятие аннулировано {who()}. Причина: {why()}", f"The lesson was annulled {who()}. Reason: {why()}",
        f"Сабақтың күші {who()} жойылды. Себебі: {why()}",
    ), actor)
    notify.send(
        db,
        lesson.teacher,
        lambda: Message(
            kind="lesson_annulled",
            category=tr("Аннулирование", "Annulment", "Күшін жою"),
            title=tr("Открытое занятие аннулировано", "Open lesson annulled", "Ашық сабақтың күші жойылды"),
            intro=[
                tr("Ваше открытое занятие аннулировано.", "Your open lesson has been annulled.", "Ашық сабағыңыздың күші жойылды."),
                tr(f"Причина: {why()}", f"Reason: {why()}", f"Себебі: {why()}"),
            ],
            fields=lesson_fields(lesson),
            outro=[tr(
                "Для восстановления или переноса занятия обратитесь к методисту.",
                "To restore or reschedule the lesson, please contact the methodologist.",
                "Сабақты қалпына келтіру немесе ауыстыру үшін әдіскерге хабарласуыңызды сұраймыз.",
            )],
            link=_link(lesson),
        ),
        lesson,
    )
    notify.send_many(
        db,
        [u for u in responsible(db, lesson) if u.id != lesson.teacher_id],
        lambda: Message(
            kind="lesson_annulled_admin",
            category=tr("Аннулирование", "Annulment", "Күшін жою"),
            title=tr(
                f"Аннулировано занятие: {lesson.teacher.full_name}", f"Lesson annulled: {lesson.teacher.full_name}",
                f"Сабақтың күші жойылды: {lesson.teacher.full_name}",
            ),
            intro=[
                tr(f"Открытое занятие аннулировано ({who()}).", f"The open lesson was annulled ({who()}).", f"Ашық сабақтың күші жойылды ({who()})."),
                tr(f"Причина: {why()}", f"Reason: {why()}", f"Себебі: {why()}"),
            ],
            fields=lesson_fields(lesson, with_teacher=True),
            outro=[tr(
                "Публикация постера отменена. Занятие сохранено в истории системы.",
                "The poster will not be published. The lesson stays in the system history.",
                "Постер жарияланбайды. Сабақ жүйе тарихында сақталады.",
            )],
            link=_link(lesson),
        ),
        lesson,
    )


def restore(db: Session, lesson: OpenLesson, reason: str, actor: User, new_deadline: datetime | None) -> None:
    if lesson.status not in (S.annulled.value, S.violation.value):
        raise HTTPException(400, tr(
            "Восстановить можно только аннулированное занятие или занятие с нарушением",
            "Only an annulled lesson or a lesson with a missed deadline can be restored",
            "Тек күші жойылған немесе мерзімі бұзылған сабақты қалпына келтіруге болады",
        ))
    if lesson.end_dt <= clock.now():
        raise HTTPException(400, tr(
            "Дата занятия прошла — используйте перенос занятия", "The lesson date has passed — reschedule the lesson instead",
            "Сабақ күні өтіп кетті — сабақты басқа күнге ауыстырыңыз",
        ))
    if lesson.has_all_materials:
        deadline = new_deadline or lesson.effective_deadline
        if deadline is None or deadline <= clock.now():
            lesson.status = S.confirmed.value
            lesson.checked_at = clock.now()
        else:
            lesson.status = S.materials_ready.value
    else:
        if new_deadline is None or new_deadline <= clock.now():
            raise HTTPException(400, tr(
                "Материалы не загружены — укажите новый срок загрузки", "Materials are missing — set a new upload deadline",
                "Материалдар жүктелмеген — жаңа жүктеу мерзімін көрсетіңіз",
            ))
        lesson.status = S.scheduled.value
    if new_deadline:
        lesson.extended_deadline = new_deadline
    lesson.annulled_at = None
    lesson.annul_reason = lesson.annul_reason_en = lesson.annul_reason_kk = None
    lesson.violation_at = None

    def extra() -> str:
        if not new_deadline:
            return ""
        return tr(
            f" Новый срок загрузки: {fmt_dt(new_deadline)}.", f" New upload deadline: {fmt_dt(new_deadline)}.",
            f" Жаңа жүктеу мерзімі: {fmt_dt(new_deadline)}.",
        )

    log_event(db, lesson, "restored", lambda: tr(
        f"Занятие восстановлено. Причина: {reason}.{extra()}", f"The lesson was restored. Reason: {reason}.{extra()}",
        f"Сабақ қалпына келтірілді. Себебі: {reason}.{extra()}",
    ), actor)
    notify.send(
        db,
        lesson.teacher,
        lambda: Message(
            kind="lesson_restored",
            category=tr("График", "Schedule", "Кесте"),
            title=tr("Открытое занятие восстановлено", "Open lesson restored", "Ашық сабақ қалпына келтірілді"),
            intro=[
                tr(
                    "Ваше открытое занятие восстановлено администратором.", "Your open lesson has been restored by the administrator.",
                    "Ашық сабағыңызды әкімші қалпына келтірді.",
                ),
                tr(f"Комментарий: {reason}", f"Comment: {reason}", f"Түсініктеме: {reason}"),
            ],
            fields=lesson_fields(lesson),
            outro=[tr(
                f"Новый срок загрузки материалов: {fmt_dt(new_deadline)}.", f"New upload deadline for the materials: {fmt_dt(new_deadline)}.",
                f"Материалдарды жүктеудің жаңа мерзімі: {fmt_dt(new_deadline)}.",
            )] if new_deadline else [],
            link=_link(lesson),
        ),
        lesson,
    )


def reschedule(
    db: Session,
    lesson: OpenLesson,
    *,
    new_date: date,
    start: time,
    end: time,
    location: Location | None,
    location_text: str | None,
    reason: str,
    actor: User,
) -> None:
    if lesson.status in (S.completed.value, S.feedback.value, S.closed.value):
        raise HTTPException(400, tr(
            "Проведённое занятие нельзя перенести", "A lesson that has been held cannot be rescheduled",
            "Өткізілген сабақты ауыстыруға болмайды",
        ))
    if end <= start:
        raise HTTPException(400, tr(
            "Время окончания должно быть позже начала", "The end time must be later than the start time",
            "Аяқталу уақыты басталу уақытынан кейін болуы тиіс",
        ))
    old_when = f"{lesson.date.strftime('%d.%m.%Y')} {lesson.start_time.strftime('%H:%M')}"
    old_place = both(lambda: lesson.place)
    lesson.date, lesson.start_time, lesson.end_time = new_date, start, end
    lesson.location = location
    lesson.location_text = location.code if location else location_text
    lesson.materials_deadline = compute_deadline(db, new_date)
    lesson.extended_deadline = None
    lesson.pre_reminder_sent_at = lesson.reminder_sent_at = lesson.checked_at = None
    lesson.violation_at = lesson.annulled_at = None
    lesson.annul_reason = lesson.annul_reason_en = lesson.annul_reason_kk = None
    lesson.poster_sent_at = None
    lesson.poster_generated_at = None
    if lesson.trimester.status == TrimesterStatus.approved.value:
        lesson.status = S.scheduled.value
        sync_materials_status(lesson)
    else:
        lesson.status = S.draft.value
    log_event(db, lesson, "rescheduled", lambda: tr(
        f"Занятие перенесено (было: {old_when}, {old_place['ru']}). Причина: {reason}",
        f"The lesson was rescheduled (was: {old_when}, {old_place['en']}). Reason: {reason}",
        f"Сабақ ауыстырылды (бұрынғы уақыты мен орны: {old_when}, {old_place['kk']}). Себебі: {reason}",
    ), actor)
    notify.send(
        db,
        lesson.teacher,
        lambda: Message(
            kind="lesson_rescheduled",
            category=tr("Перенос", "Rescheduling", "Ауыстыру"),
            title=tr("Открытое занятие перенесено", "Open lesson rescheduled", "Ашық сабақ ауыстырылды"),
            intro=[
                tr("Ваше открытое занятие перенесено.", "Your open lesson has been rescheduled.", "Ашық сабағыңыз ауыстырылды."),
                tr(f"Причина: {reason}", f"Reason: {reason}", f"Себебі: {reason}"),
            ],
            fields=lesson_fields(lesson),
            outro=[tr(
                f"Срок загрузки материалов: {fmt_dt(lesson.materials_deadline)}.",
                f"Upload deadline for the materials: {fmt_dt(lesson.materials_deadline)}.",
                f"Материалдарды жүктеу мерзімі: {fmt_dt(lesson.materials_deadline)}.",
            )],
            link=_link(lesson),
        ),
        lesson,
    )


def extend_deadline(db: Session, lesson: OpenLesson, until: datetime, reason: Text, actor: User | None) -> None:
    lesson.extended_deadline = until
    if lesson.status == S.violation.value:
        lesson.status = S.scheduled.value
        sync_materials_status(lesson)
        lesson.violation_at = None
    why = _text(reason)
    log_event(db, lesson, "deadline_extended", lambda: tr(
        f"Срок загрузки продлён до {fmt_dt(until)}. {why()}", f"Upload deadline extended to {fmt_dt(until)}. {why()}",
        f"Жүктеу мерзімі ұзартылды, жаңа мерзім: {fmt_dt(until)}. {why()}",
    ), actor)
    notify.send(
        db,
        lesson.teacher,
        lambda: Message(
            kind="deadline_extended",
            category=tr("Последнее предупреждение", "Final warning", "Соңғы ескерту"),
            title=tr("Продлён срок загрузки материалов", "Upload deadline extended", "Материалдарды жүктеу мерзімі ұзартылды"),
            intro=[
                tr(
                    "Обязательные материалы открытого занятия не были загружены вовремя.",
                    "The required materials for your open lesson were not uploaded on time.",
                    "Ашық сабағыңыздың міндетті материалдары уақытында жүктелмеді.",
                ),
                tr(
                    f"Вам предоставлен дополнительный срок — до {fmt_dt(until)}.", f"You have been given extra time — until {fmt_dt(until)}.",
                    f"Сізге қосымша мерзім берілді, жаңа мерзім: {fmt_dt(until)}.",
                ),
            ],
            fields=lesson_fields(lesson),
            outro=[
                tr("Не загружено: ", "Missing: ", "Жүктелмеген құжаттар: ") + ", ".join(missing_materials(lesson)) + ".",
                tr(
                    "Если документы не будут загружены, занятие будет аннулировано.", "If the documents are not uploaded, the lesson will be annulled.",
                    "Құжаттар жүктелмеген жағдайда сабақтың күші жойылады.",
                ),
            ],
            link=_link(lesson),
        ),
        lesson,
    )


def confirm_lesson(db: Session, lesson: OpenLesson, actor: User | None, note: Text = "") -> None:
    lesson.status = S.confirmed.value
    lesson.checked_at = clock.now()
    lesson.violation_at = None
    extra = _text(note)
    log_event(db, lesson, "confirmed", lambda: tr(
        f"Проверка материалов пройдена, занятие подтверждено. {extra()}", f"Materials check passed, the lesson is confirmed. {extra()}",
        f"Материалдар тексерістен өтті, сабақ расталды. {extra()}",
    ).strip(), actor)
    notify.send(
        db,
        lesson.teacher,
        lambda: Message(
            kind="lesson_confirmed",
            category=tr("Подтверждение", "Confirmation", "Растау"),
            title=tr("Открытое занятие подтверждено", "Open lesson confirmed", "Ашық сабақ расталды"),
            intro=[tr(
                "Обязательные материалы получены — ваше открытое занятие подтверждено.",
                "The required materials have been received — your open lesson is confirmed.",
                "Міндетті материалдар алынды — ашық сабағыңыз расталды.",
            )],
            fields=lesson_fields(lesson),
            outro=[tr(
                "За 3 дня до занятия всем преподавателям будет разослан постер-приглашение.",
                "Three days before the lesson an invitation poster will be sent to all teachers.",
                "Сабаққа 3 күн қалғанда барлық оқытушыларға шақыру постері жіберіледі.",
            )],
            link=_link(lesson),
        ),
        lesson,
    )


# ---------------------------------------------------------------- attendance & feedback


def _snapshot(attendance: Attendance, user: User, lesson: OpenLesson) -> None:
    attendance.full_name = user.full_name
    attendance.position = user.position
    attendance.department_name = user.department.name if user.department else None
    attendance.visit_date = lesson.date


def register_attendance(
    db: Session, lesson: OpenLesson, user: User, *, source: str, actor: User | None, confirmed: bool
) -> Attendance:
    if user.id == lesson.teacher_id:
        raise HTTPException(400, tr(
            "Преподаватель, проводящий занятие, не может быть посетителем", "The teacher giving the lesson cannot be an attendee",
            "Сабақты өткізетін оқытушы қатысушы бола алмайды",
        ))
    if any(a.user_id == user.id for a in lesson.attendances):
        raise HTTPException(409, tr(
            f"{user.full_name} уже зарегистрирован(а) на это занятие", f"{user.full_name} is already registered for this lesson",
            f"{user.full_name} бұл сабаққа тіркеліп қойған",
        ))
    attendance = Attendance(
        lesson_id=lesson.id,
        user_id=user.id,
        source=source,
        status=AttendanceStatus.confirmed.value if confirmed else AttendanceStatus.pending.value,
        registered_by_id=actor.id if actor else user.id,
        confirmed_at=clock.now() if confirmed else None,
        confirmed_by_id=actor.id if (confirmed and actor) else None,
    )
    _snapshot(attendance, user, lesson)
    lesson.attendances.append(attendance)
    db.flush()
    if confirmed and lesson.status in (S.feedback.value,):
        open_feedback(db, lesson, attendance)
    return attendance


def feedback_due(db: Session, lesson: OpenLesson) -> datetime:
    days = int(app_settings.get(db, "feedback_days"))
    due = lesson.end_dt + timedelta(days=days)
    return max(due, clock.now() + timedelta(hours=24))


def open_feedback(db: Session, lesson: OpenLesson, attendance: Attendance) -> Feedback | None:
    if any(f.author_id == attendance.user_id for f in lesson.feedbacks):
        return None
    due = lesson.feedback_due_at or feedback_due(db, lesson)
    fb = Feedback(lesson_id=lesson.id, author_id=attendance.user_id, due_at=due, opened_at=clock.now())
    lesson.feedbacks.append(fb)
    db.flush()
    notify.send(
        db,
        attendance.user,
        lambda: Message(
            kind="feedback_invite",
            category="Feedback",
            title=tr("Заполните форму обратной связи", "Please fill in the feedback form", "Кері байланыс формасын толтырыңыз"),
            intro=[
                tr(
                    "Спасибо за посещение открытого занятия коллеги!", "Thank you for attending your colleague's open lesson!",
                    "Әріптесіңіздің ашық сабағына қатысқаныңыз үшін алғыс білдіреміз!",
                ),
                tr(
                    f"Пожалуйста, заполните форму обратной связи до {fmt_dt(due)}.", f"Please fill in the feedback form by {fmt_dt(due)}.",
                    f"Кері байланыс формасын толтыруыңызды сұраймыз, толтыру мерзімі: {fmt_dt(due)}.",
                ),
            ],
            fields=lesson_fields(lesson, with_teacher=True),
            link=f"/feedback/{fb.id}",
            link_label=tr("Заполнить Feedback", "Fill in feedback", "Feedback толтыру"),
        ),
        lesson,
    )
    return fb


def confirm_attendance(db: Session, lesson: OpenLesson, actor: User, attendance_ids: list[int] | None) -> int:
    if lesson.status not in (S.completed.value, S.feedback.value):
        raise HTTPException(400, tr(
            "Список посетителей подтверждается после проведения занятия", "The attendee list can be confirmed after the lesson has been held",
            "Қатысушылар тізімі сабақ өткізілгеннен кейін расталады",
        ))
    now = clock.now()
    confirmed_now = 0
    for a in lesson.attendances:
        if attendance_ids is not None and a.id not in attendance_ids:
            continue
        if a.status == AttendanceStatus.pending.value:
            a.status = AttendanceStatus.confirmed.value
            a.confirmed_at, a.confirmed_by_id = now, actor.id
            confirmed_now += 1
    if lesson.status == S.completed.value:
        lesson.status = S.feedback.value
        lesson.attendance_confirmed_at = now
        lesson.attendance_confirmed_by_id = actor.id
        lesson.feedback_opened_at = now
        lesson.feedback_due_at = feedback_due(db, lesson)
        n = len([a for a in lesson.attendances if a.status == AttendanceStatus.confirmed.value])

        def people() -> str:
            return count(n, ("преподаватель", "преподавателя", "преподавателей"), ("teacher", "teachers"), "оқытушы")

        log_event(db, lesson, "attendance_confirmed", lambda: tr(
            f"Список посетителей подтверждён ({people()}). Формы Feedback открыты до {fmt_dt(lesson.feedback_due_at)}",
            f"Attendee list confirmed ({people()}). Feedback forms are open until {fmt_dt(lesson.feedback_due_at)}",
            f"Қатысушылар тізімі расталды ({people()}). Feedback формалары ашылды, толтыру мерзімі: {fmt_dt(lesson.feedback_due_at)}",
        ), actor)
    for a in lesson.attendances:
        if a.status == AttendanceStatus.confirmed.value:
            open_feedback(db, lesson, a)
    db.commit()
    return confirmed_now


def close_feedback(db: Session, lesson: OpenLesson) -> dict:
    from app.services import ai

    now = clock.now()
    missing = []
    for fb in lesson.feedbacks:
        if fb.status in (FeedbackStatus.pending.value, FeedbackStatus.draft.value):
            fb.status = FeedbackStatus.expired.value
            missing.append(fb.author.full_name)
    lesson.status = S.closed.value
    lesson.feedback_closed_at = now
    submitted = [f for f in lesson.feedbacks if f.status == FeedbackStatus.submitted.value]
    n_sub, n_miss = len(submitted), len(missing)
    log_event(db, lesson, "feedback_closed", lambda: tr(
        f"Срок сбора Feedback истёк. Получено отзывов: {n_sub}, не заполнено: {n_miss}",
        f"The feedback window has closed. Reviews received: {n_sub}, not filled in: {n_miss}",
        f"Feedback жинау мерзімі аяқталды. Алынған пікірлер: {n_sub}, толтырылмағаны: {n_miss}",
    ))
    db.commit()
    if submitted:
        ai.summarize_feedback(db, lesson)
    notify.send(
        db,
        lesson.teacher,
        lambda: Message(
            kind="feedback_results",
            category=tr("Результаты", "Results", "Нәтижелер"),
            title=tr("Результаты обратной связи готовы", "Feedback results are ready", "Кері байланыс нәтижелері дайын"),
            intro=[
                tr(
                    f"Сбор обратной связи по вашему открытому занятию завершён. Получено отзывов: {n_sub}.",
                    f"Feedback collection for your open lesson is complete. Reviews received: {n_sub}.",
                    f"Ашық сабағыңыз бойынша кері байланыс жинау аяқталды. Алынған пікірлер саны: {n_sub}.",
                ),
                tr(
                    "Вы можете просмотреть оценки, комментарии коллег и AI-анализ, а также написать ответ.",
                    "You can view the scores, your colleagues' comments and the AI analysis, and write a reply.",
                    "Сіз бағаларды, әріптестеріңіздің пікірлерін және ЖИ талдауын қарап, жауап жаза аласыз.",
                ),
            ],
            fields=lesson_fields(lesson),
            link=_link(lesson),
            link_label=tr("Посмотреть отзывы", "View reviews", "Пікірлерді қарау"),
        ),
        lesson,
    )
    if missing:
        notify.send_many(
            db,
            notify.managers(db),
            lambda: Message(
                kind="feedback_missing",
                category="Feedback",
                title=tr(
                    f"Не заполнены отзывы: {lesson.teacher.full_name}", f"Missing reviews: {lesson.teacher.full_name}",
                    f"Толтырылмаған пікірлер: {lesson.teacher.full_name}",
                ),
                intro=[tr(
                    "Истёк срок заполнения Feedback. Не отправили отзыв:", "The feedback window has closed. No review from:",
                    "Feedback толтыру мерзімі аяқталды. Пікір жібермегендер:",
                )]
                + [f"• {name}" for name in missing],
                fields=lesson_fields(lesson, with_teacher=True),
                link=_link(lesson),
            ),
            lesson,
            email=False,
        )
    db.commit()
    return {"submitted": n_sub, "missing": missing}
