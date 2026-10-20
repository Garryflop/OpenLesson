"""Модуль 1. Учебные годы, триместры и загрузка графика открытых занятий."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_manager
from app.i18n import tr
from app.models import AcademicYear, LessonStatus, Trimester, TrimesterStatus, User
from app.schemas import TrimesterIn, YearIn
from app.serializers import trimester_out, year_out
from app.services import excel_io, lesson_logic

router = APIRouter(prefix="/api", tags=["schedule"])


@router.get("/years")
def list_years(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    years = db.scalars(select(AcademicYear).order_by(AcademicYear.name.desc())).all()
    return [year_out(y) for y in years]


@router.post("/years", status_code=201)
def create_year(data: YearIn, db: Session = Depends(get_db), _: User = Depends(require_manager)):
    name = data.name.replace("-", "–")
    if db.scalar(select(AcademicYear).where(AcademicYear.name == name)):
        raise HTTPException(409, tr("Такой учебный год уже существует", "This academic year already exists", "Мұндай оқу жылы бұрыннан бар"))
    if data.is_current:
        for y in db.scalars(select(AcademicYear)).all():
            y.is_current = False
    year = AcademicYear(name=name, start_date=data.start_date, end_date=data.end_date, is_current=data.is_current)
    year.trimesters = [Trimester(number=n) for n in (1, 2, 3)]
    db.add(year)
    db.commit()
    return year_out(year)


@router.put("/years/{year_id}")
def update_year(year_id: int, data: YearIn, db: Session = Depends(get_db), _: User = Depends(require_manager)):
    year = db.get(AcademicYear, year_id)
    if not year:
        raise HTTPException(404)
    if data.is_current:
        for y in db.scalars(select(AcademicYear)).all():
            y.is_current = False
    year.name = data.name.replace("-", "–")
    year.start_date, year.end_date, year.is_current = data.start_date, data.end_date, data.is_current
    db.commit()
    return year_out(year)


@router.put("/trimesters/{trimester_id}")
def update_trimester(trimester_id: int, data: TrimesterIn, db: Session = Depends(get_db), _: User = Depends(require_manager)):
    t = db.get(Trimester, trimester_id)
    if not t:
        raise HTTPException(404)
    t.start_date, t.end_date = data.start_date, data.end_date
    db.commit()
    return trimester_out(t)


@router.get("/schedule/template")
def schedule_template(_: User = Depends(require_manager)):
    return Response(
        excel_io.schedule_template(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="openlesson_schedule_template.xlsx"'},
    )


@router.post("/trimesters/{trimester_id}/import")
async def import_schedule(
    trimester_id: int, file: UploadFile, db: Session = Depends(get_db), _: User = Depends(require_manager)
):
    t = db.get(Trimester, trimester_id)
    if not t:
        raise HTTPException(404, tr("Триместр не найден", "Trimester not found", "Триместр табылмады"))
    return excel_io.import_schedule(db, t, await file.read())


@router.post("/trimesters/{trimester_id}/approve")
def approve(trimester_id: int, db: Session = Depends(get_db), user: User = Depends(require_manager)):
    t = db.get(Trimester, trimester_id)
    if not t:
        raise HTTPException(404, tr("Триместр не найден", "Trimester not found", "Триместр табылмады"))
    if not t.lessons:
        raise HTTPException(400, tr("В графике нет занятий", "The schedule has no lessons", "Кестеде сабақ жоқ"))
    count = lesson_logic.approve_trimester(db, t, user)
    return {"approved": count, "trimester": trimester_out(t)}


@router.delete("/trimesters/{trimester_id}/drafts")
def clear_drafts(trimester_id: int, db: Session = Depends(get_db), _: User = Depends(require_manager)):
    """Удалить черновые занятия (например, перед повторной загрузкой графика)."""
    t = db.get(Trimester, trimester_id)
    if not t:
        raise HTTPException(404)
    if t.status == TrimesterStatus.approved.value:
        raise HTTPException(400, tr("График утверждён", "The schedule is already approved", "Кесте бекітіліп қойған"))
    removed = 0
    for lesson in list(t.lessons):
        if lesson.status == LessonStatus.draft.value:
            db.delete(lesson)
            removed += 1
    db.commit()
    return {"removed": removed}
