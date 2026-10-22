from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_analytics
from app.i18n import tr
from app.models import AcademicYear, Department, Role, School, Trimester, User
from app.services import analytics, reports
from app.services.analytics import department_name, school_name

router = APIRouter(prefix="/api", tags=["analytics"])


def _filters(user: User, year_id, trimester_id, school_id, department_id) -> dict:
    # декан / зам. декана видит только свою школу
    if user.has_role(Role.dean) and not (user.is_manager or user.has_role(Role.leadership)):
        school_id = user.managed_school_id or -1
    return {"year_id": year_id, "trimester_id": trimester_id, "school_id": school_id, "department_id": department_id}


def _scope(db: Session, f: dict) -> dict:
    t = db.get(Trimester, f["trimester_id"]) if f["trimester_id"] else None
    y = db.get(AcademicYear, f["year_id"]) if f["year_id"] else (t.year if t else None)
    s = db.get(School, f["school_id"]) if f["school_id"] and f["school_id"] > 0 else None
    d = db.get(Department, f["department_id"]) if f["department_id"] else None
    dept = department_name(d) if d else ""
    return {
        "year": tr(f"Учебный год {y.name}", f"Academic year {y.name}", f"{y.name} оқу жылы") if y else "",
        "trimester": tr(f"{t.roman} триместр", f"Trimester {t.roman}", f"{t.roman} триместр") if t else "",
        "school": school_name(s) or "",
        "department": tr(f"Кафедра: {dept}", f"Department: {dept}", f"Кафедра: {dept}") if d else "",
    }


@router.get("/analytics")
def get_analytics(
    year_id: int | None = None,
    trimester_id: int | None = None,
    school_id: int | None = None,
    department_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_analytics),
):
    f = _filters(user, year_id, trimester_id, school_id, department_id)
    data = analytics.compute(db, **f)
    data["scope"] = _scope(db, f)
    data.pop("lessons")
    return data


@router.get("/reports/export")
def export_report(
    format: str = Query("xlsx", pattern="^(xlsx|pdf)$"),
    year_id: int | None = None,
    trimester_id: int | None = None,
    school_id: int | None = None,
    department_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_analytics),
):
    f = _filters(user, year_id, trimester_id, school_id, department_id)
    data = analytics.compute(db, **f)
    scope = _scope(db, f)
    stamp = data["generated_at"].strftime("%Y%m%d_%H%M")
    if format == "pdf":
        return Response(
            reports.analytics_pdf(data, scope),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="openlesson_report_{stamp}.pdf"'},
        )
    return Response(
        reports.analytics_xlsx(data, scope),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="openlesson_report_{stamp}.xlsx"'},
    )
