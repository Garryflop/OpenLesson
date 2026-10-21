"""Модуль 3. Загрузка презентации и плана открытого занятия."""

import logging
import mimetypes

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import clock
from app.config import settings
from app.db import SessionLocal, get_db
from app.deps import can_view_lesson_details, ensure, get_current_user, require_manager
from app.i18n import tr
from app.models import LessonMaterial, LessonStatus, MaterialKind, OpenLesson, User
from app.serializers import analysis_out, material_out
from app.services import ai, lesson_logic, notify, storage
from app.services.notify import Message, lesson_fields

log = logging.getLogger("openlesson.materials")
router = APIRouter(prefix="/api", tags=["materials"])


def _analyze_plan_job(lesson_id: int) -> None:
    with SessionLocal() as db:
        lesson = db.get(OpenLesson, lesson_id)
        if lesson:
            try:
                ai.analyze_plan(db, lesson)
            except Exception:  # noqa: BLE001
                log.exception("Plan analysis failed for lesson %s", lesson_id)


@router.post("/lessons/{lesson_id}/materials/{kind}")
def upload_material(
    lesson_id: int,
    kind: MaterialKind,
    file: UploadFile,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lesson = db.get(OpenLesson, lesson_id)
    if lesson is None:
        raise HTTPException(404, tr("Занятие не найдено", "Lesson not found", "Сабақ табылмады"))
    ensure(
        user.id == lesson.teacher_id or user.is_manager,
        tr("Загружать материалы может только преподаватель занятия", "Only the lesson's teacher can upload materials",
           "Материалдарды тек сабақтың оқытушысы жүктей алады"),
    )
    if lesson.status not in lesson_logic.UPLOAD_ALLOWED:
        status = lesson_logic.status_label(lesson.status)
        raise HTTPException(400, tr(f"Загрузка недоступна в статусе «{status}»", f"Upload is not available in the “{status}” status",
                                    f"«{status}» күйінде жүктеу қолжетімсіз"))

    stored, size = storage.save_upload(file, "materials", storage.ALLOWED[kind.value])
    now = clock.now()
    existing = lesson.material(kind)
    if existing:
        storage.remove(f"materials/{existing.stored_name}")
        lesson.materials.remove(existing)  # delete-orphan
        db.flush()
    deadline = lesson.effective_deadline
    material = LessonMaterial(
        lesson_id=lesson.id,
        kind=kind.value,
        original_name=(file.filename or stored)[:255],
        stored_name=stored,
        content_type=file.content_type or mimetypes.guess_type(stored)[0],
        size=size,
        uploaded_at=now,
        uploaded_by_id=user.id,
        on_time=deadline is None or now <= deadline,
    )
    lesson.materials.append(material)
    lesson_logic.sync_materials_status(lesson)
    kind_value, file_name, replaced = kind.value, material.original_name, existing is not None
    lesson_logic.log_event(
        db,
        lesson,
        "material_uploaded",
        lambda: tr(
            f"{lesson_logic.material_title(kind_value)}: файл «{file_name}» {'заменён' if replaced else 'загружен'}",
            f"{lesson_logic.material_title(kind_value)}: file “{file_name}” {'replaced' if replaced else 'uploaded'}",
            f"{lesson_logic.material_title(kind_value)}: «{file_name}» файлы {'ауыстырылды' if replaced else 'жүктелді'}",
        ),
        user,
    )
    if lesson.status == LessonStatus.violation.value and lesson.has_all_materials:
        teacher_name = lesson.teacher.full_name
        notify.send_many(
            db,
            lesson_logic.responsible(db, lesson),
            lambda: Message(
                kind="materials_after_deadline",
                category=tr("Материалы", "Materials", "Материалдар"),
                title=tr(f"Материалы загружены после срока: {teacher_name}", f"Materials uploaded after the deadline: {teacher_name}",
                         f"Материалдар мерзімнен кейін жүктелді: {teacher_name}"),
                intro=[tr(
                    "Преподаватель загрузил все обязательные материалы после истечения срока. Требуется решение.",
                    "The teacher uploaded all required materials after the deadline. A decision is required.",
                    "Оқытушы барлық міндетті материалдарды мерзім өткеннен кейін жүктеді. Шешім қабылдау қажет.",
                )],
                fields=lesson_fields(lesson, with_teacher=True),
                link=f"/lessons/{lesson.id}",
            ),
            lesson,
            email=False,
        )
    db.commit()
    if kind == MaterialKind.plan:
        background.add_task(_analyze_plan_job, lesson.id)
    return material_out(material)


@router.get("/materials/{material_id}/download")
def download_material(material_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    material = db.get(LessonMaterial, material_id)
    if material is None:
        raise HTTPException(404)
    ensure(can_view_lesson_details(user, material.lesson))
    path = storage.material_path(material)
    if not path.exists():
        raise HTTPException(404, tr("Файл отсутствует в хранилище", "The file is missing from the storage", "Файл қоймада жоқ"))
    return FileResponse(path, filename=material.original_name, media_type=material.content_type)


@router.delete("/materials/{material_id}", status_code=204)
def delete_material(material_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    material = db.get(LessonMaterial, material_id)
    if material is None:
        raise HTTPException(404)
    lesson = material.lesson
    ensure(user.id == lesson.teacher_id or user.is_manager)
    if lesson.status not in (LessonStatus.scheduled.value, LessonStatus.materials_ready.value, LessonStatus.draft.value):
        raise HTTPException(400, tr("После проверки материалы нельзя удалить — загрузите новую версию",
                                    "Materials cannot be deleted after the check — upload a new version",
                                    "Тексерілгеннен кейін материалдарды жоюға болмайды — жаңа нұсқасын жүктеңіз"))
    file_name = material.original_name
    storage.remove(f"materials/{material.stored_name}")
    lesson.materials.remove(material)  # delete-orphan
    lesson_logic.sync_materials_status(lesson)
    lesson_logic.log_event(
        db, lesson, "material_deleted", lambda: tr(f"Удалён файл «{file_name}»", f"File “{file_name}” deleted",
                                                   f"«{file_name}» файлы жойылды"), user
    )
    db.commit()


@router.get("/files/{folder}/{name}")
def get_file(folder: str, name: str, _: User = Depends(get_current_user)):
    """Публичные для сотрудников файлы: постеры и элементы брендинга."""
    if folder not in ("posters", "branding") or "/" in name or "\\" in name or ".." in name:
        raise HTTPException(404)
    path = storage.root() / folder / name
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path)


@router.post("/lessons/{lesson_id}/ai/plan")
def run_plan_analysis(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lesson = db.get(OpenLesson, lesson_id)
    if lesson is None:
        raise HTTPException(404)
    ensure(user.id == lesson.teacher_id or user.is_manager)
    result = ai.analyze_plan(db, lesson)
    if result is None:
        raise HTTPException(400, tr("План занятия ещё не загружен", "The lesson plan has not been uploaded yet", "Сабақ жоспары әлі жүктелмеген"))
    return analysis_out(result)


@router.post("/lessons/{lesson_id}/ai/feedback")
def run_feedback_summary(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lesson = db.get(OpenLesson, lesson_id)
    if lesson is None:
        raise HTTPException(404)
    ensure(user.id == lesson.teacher_id or user.is_manager)
    result = ai.summarize_feedback(db, lesson)
    if result is None:
        raise HTTPException(400, tr("Пока нет отправленных отзывов", "No reviews have been submitted yet", "Әзірге жіберілген пікір жоқ"))
    return analysis_out(result)


@router.post("/lessons/{lesson_id}/ai/invitation")
def run_invitation(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    lesson = db.get(OpenLesson, lesson_id)
    if lesson is None:
        raise HTTPException(404)
    return analysis_out(ai.generate_invitation(db, lesson))


@router.get("/ai/status")
def ai_status(_: User = Depends(get_current_user)):
    return {"provider": ai.provider(), "model": ai.model_name()}
