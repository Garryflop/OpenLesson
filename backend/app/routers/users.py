from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_admin, require_analytics
from app.i18n import pick, tr
from app.models import Department, School, User
from app.schemas import DepartmentIn, SchoolIn, UserIn
from app.serializers import user_out
from app.services import excel_io, staff_directory

router = APIRouter(prefix="/api", tags=["users"])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/users")
def list_users(
    q: str | None = None,
    role: str | None = None,
    department_id: int | None = None,
    school_id: int | None = None,
    active: bool | None = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    _: User = Depends(require_analytics),
):
    stmt = select(User)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(User.full_name).like(like), func.lower(User.email).like(like)))
    if department_id:
        stmt = stmt.where(User.department_id == department_id)
    if school_id:
        stmt = stmt.join(Department, User.department_id == Department.id).where(Department.school_id == school_id)
    if active is not None:
        stmt = stmt.where(User.is_active.is_(active))
    users = db.scalars(stmt.order_by(User.full_name)).all()
    if role:
        users = [u for u in users if u.has_role(role)]
    return {"total": len(users), "items": [user_out(u) for u in users[offset : offset + limit]]}


@router.get("/users/import/template")
def staff_template(_: User = Depends(require_admin)):
    return Response(
        excel_io.staff_template(),
        media_type=XLSX,
        headers={"Content-Disposition": 'attachment; filename="staff_template.xlsx"'},
    )


@router.post("/users/import")
async def import_staff(file: UploadFile, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Excel-шаблон справочника или выгрузка преподавателей из базы университета (.json / .csv)."""
    content, name = await file.read(), (file.filename or "").lower()
    if name.endswith((".json", ".csv")):
        result = staff_directory.import_people(db, staff_directory.parse(content, name))
        return {"created": result["created"], "updated": result["updated"], "errors": [], **result}
    return excel_io.import_staff(db, content)


@router.get("/users/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_analytics)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, tr("Пользователь не найден", "User not found", "Пайдаланушы табылмады"))
    return user_out(user)


@router.post("/users", status_code=201)
def create_user(data: UserIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    email = data.email.lower() if data.email else None
    if email and db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(409, tr("Пользователь с таким e-mail уже существует", "A user with this e-mail already exists",
                                    "Бұл e-mail мекенжайы бар пайдаланушы бұрыннан тіркелген"))
    user = User(**data.model_dump() | {"email": email})
    db.add(user)
    db.commit()
    return user_out(user)


@router.put("/users/{user_id}")
def update_user(user_id: int, data: UserIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, tr("Пользователь не найден", "User not found", "Пайдаланушы табылмады"))
    if user.id == admin.id and "admin" not in data.roles:
        raise HTTPException(400, tr("Нельзя снять с себя роль администратора", "You cannot remove the administrator role from yourself",
                                    "Өзіңізден әкімші рөлін алып тастауға болмайды"))
    email = data.email.lower() if data.email else None
    if email and email != user.email and db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(409, tr("Этот e-mail уже привязан к другому сотруднику", "This e-mail is already linked to another staff member",
                                    "Бұл e-mail басқа қызметкерге тіркелген"))
    for key, value in data.model_dump().items():
        setattr(user, key, email if key == "email" else value)
    db.commit()
    return user_out(user)


@router.get("/structure")
def structure(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    schools = db.scalars(select(School).order_by(School.name)).all()
    orphan = db.scalars(select(Department).where(Department.school_id.is_(None)).order_by(Department.name)).all()
    return {
        "schools": [
            {
                "id": s.id,
                "name": pick(s.name, s.name_en, s.name_kz),
                "name_ru": s.name,
                "name_en": s.name_en,
                "name_kz": s.name_kz,
                "short_name": s.short_name,
                "departments": [
                    {"id": d.id, "name": pick(s.name, s.name_en, s.name_kz) if d.name == s.name else d.name, "school_id": s.id}
                    for d in s.departments
                ],
            }
            for s in schools
        ],
        "unassigned_departments": [{"id": d.id, "name": d.name, "school_id": None} for d in orphan],
    }


@router.post("/schools", status_code=201)
def create_school(data: SchoolIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    school = School(**data.model_dump())
    db.add(school)
    db.commit()
    return {"id": school.id, "name": pick(school.name, school.name_en, school.name_kz), "name_kz": school.name_kz}


@router.post("/departments", status_code=201)
def create_department(data: DepartmentIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    dept = Department(**data.model_dump())
    db.add(dept)
    db.commit()
    return {"id": dept.id, "name": dept.name, "school_id": dept.school_id}
