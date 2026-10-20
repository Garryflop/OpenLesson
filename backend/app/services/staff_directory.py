"""Справочник ППС из базы университета (выгрузка teachers JSON / CSV).

Expected record fields (JSON keys / CSV headers):

| JSON           | CSV                 | meaning                                  |
|----------------|---------------------|------------------------------------------|
| userId         | User ID             | stable ID of the person in the university |
| fullName       | ФИО                 | full name                                 |
| surname/name/patronymic | Фамилия/Имя/Отчество |                                  |
| departmentId   | —                   | ID of the school (null = not specified)   |
| departmentRu   | Департамент (RU)    | school name (Russian)                     |
| departmentKz   | Департамент (KZ)    |                                           |
| departmentEn   | Департамент (EN)    |                                           |

In AITU the "department" of a teacher is a *school*. A matching department
record with the same name is created so that lessons, analytics and the dean's
scope keep working; real кафедры can still be added later.

The import is idempotent: people are matched by ``external_id`` (User ID),
so re-uploading a fresh export updates names and schools without touching
roles, e-mails or the lesson history.
"""

import csv
import io
import json
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.i18n import tr
from app.models import Department, Role, School, User

NOT_SPECIFIED = {"", "не указан", "not specified", "көрсетілмеген"}

CSV_FIELDS = {
    "user id": "userId",
    "фио": "fullName",
    "фамилия": "surname",
    "имя": "name",
    "отчество": "patronymic",
    "департамент (ru)": "departmentRu",
    "департамент (kz)": "departmentKz",
    "департамент (en)": "departmentEn",
    # English export headers
    "full name": "fullName",
    "department (ru)": "departmentRu",
    "department (kz)": "departmentKz",
    "department (en)": "departmentEn",
}


@dataclass
class Person:
    external_id: str
    full_name: str
    school_ru: str | None
    school_kz: str | None
    school_en: str | None
    school_id: str | None


def _clean(value) -> str:
    return " ".join(str(value or "").replace("\xa0", " ").split())


def _school(value) -> str | None:
    v = _clean(value)
    return None if v.lower() in NOT_SPECIFIED else v


def _person(raw: dict) -> Person | None:
    external_id = _clean(raw.get("userId") or raw.get("id"))
    full_name = _clean(raw.get("fullName")) or " ".join(
        p for p in (_clean(raw.get("surname")), _clean(raw.get("name")), _clean(raw.get("patronymic"))) if p
    )
    if not external_id or not full_name:
        return None
    dep_id = raw.get("departmentId")
    return Person(
        external_id=external_id,
        full_name=full_name,
        school_ru=_school(raw.get("departmentRu")),
        school_kz=_school(raw.get("departmentKz")),
        school_en=_school(raw.get("departmentEn")),
        school_id=str(dep_id) if dep_id not in (None, "") else None,
    )


def parse(content: bytes, filename: str) -> list[Person]:
    text = content.decode("utf-8-sig", errors="replace")
    name = filename.lower()
    if name.endswith(".json"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise HTTPException(400, tr(f"Некорректный JSON: {exc}", f"Invalid JSON: {exc}", f"JSON файлы қате: {exc}")) from exc
        if isinstance(data, dict):
            data = data.get("teachers") or data.get("items") or []
        rows = data
    elif name.endswith(".csv"):
        dialect = csv.Sniffer().sniff(text.splitlines()[0], delimiters=";,\t")
        reader = csv.DictReader(io.StringIO(text), dialect=dialect)
        rows = [{CSV_FIELDS.get((k or "").strip().lower(), k): v for k, v in r.items()} for r in reader]
    else:
        raise HTTPException(400, tr("Поддерживаются файлы .json и .csv из выгрузки преподавателей",
                                    "Only .json and .csv files from the teachers export are supported",
                                    "Оқытушылар тізімінің экспортынан алынған .json және .csv файлдары ғана қабылданады"))
    people = [p for p in (_person(r) for r in rows if isinstance(r, dict)) if p]
    if not people:
        raise HTTPException(400, tr("В файле не найдено ни одного преподавателя (ожидаются поля userId/User ID и ФИО)",
                                    "No teachers found in the file (expected the fields userId/User ID and full name)",
                                    "Файлдан бірде-бір оқытушы табылмады (userId/User ID және ТАӘ өрістері болуы керек)"))
    return people


def _short(name_en: str | None) -> str | None:
    if not name_en:
        return None
    words = [w for w in name_en.replace("-", " ").split() if w.lower() not in {"of", "and", "the"}]
    return "".join(w[0] for w in words).upper()[:8] or None


def import_people(db: Session, people: list[Person]) -> dict:
    schools: dict[str, School] = {s.name: s for s in db.scalars(select(School)).all()}
    departments: dict[int, Department] = {}
    for d in db.scalars(select(Department)).all():
        if d.school_id and d.school and d.name == d.school.name:
            departments[d.school_id] = d

    def department_for(p: Person) -> Department | None:
        if not p.school_ru:
            return None
        school = schools.get(p.school_ru)
        if school is None:
            school = School(name=p.school_ru, name_kz=p.school_kz, name_en=p.school_en, short_name=_short(p.school_en),
                            external_id=p.school_id)
            db.add(school)
            db.flush()
            schools[school.name] = school
        else:
            school.name_kz = school.name_kz or p.school_kz
            school.name_en = school.name_en or p.school_en
        dept = departments.get(school.id)
        if dept is None:
            dept = Department(name=school.name, school_id=school.id)
            db.add(dept)
            db.flush()
            departments[school.id] = dept
        return dept

    existing = {u.external_id: u for u in db.scalars(select(User).where(User.external_id.is_not(None))).all()}
    created = updated = 0
    seen: set[str] = set()
    for p in people:
        if p.external_id in seen:
            continue
        seen.add(p.external_id)
        dept = department_for(p)
        user = existing.get(p.external_id)
        if user is None:
            user = User(external_id=p.external_id, full_name=p.full_name, roles=[Role.teacher.value], is_faculty=True)
            db.add(user)
            created += 1
        else:
            updated += 1
            if Role.teacher.value not in (user.roles or []):
                user.roles = sorted(set(user.roles or []) | {Role.teacher.value})
        user.full_name = p.full_name
        user.is_faculty = True
        if dept is not None:
            user.department_id = dept.id
    db.commit()
    return {
        "created": created,
        "updated": updated,
        "total": len(seen),
        "without_school": sum(1 for p in people if not p.school_ru),
        "schools": len(schools),
    }
