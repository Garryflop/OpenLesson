import os
import sys
import tempfile
from datetime import date, datetime, time, timedelta
from pathlib import Path

import pytest

_tmp = Path(tempfile.mkdtemp(prefix="openlesson_test_"))
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{(_tmp / 'test.db').as_posix()}",
        "STORAGE_DIR": str(_tmp / "storage"),
        "SCHEDULER_ENABLED": "false",
        "AI_ENABLED": "false",
        "EMAIL_BACKEND": "console",
        "DEV_LOGIN_ENABLED": "true",
        "ENVIRONMENT": "test",
    }
)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app import clock  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    AcademicYear,
    Department,
    FeedbackCriterion,
    OpenLesson,
    School,
    Trimester,
    User,
)
from app.security import create_session_token  # noqa: E402
from app.services import lesson_logic  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    clock.set_offset(0)
    yield
    clock.set_offset(0)


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def travel_to(moment: datetime) -> None:
    clock.set_offset(int((moment - clock.real_now()).total_seconds() // 60) + 1)


class World:
    """Small university: one school, admin, dean, three teachers, one trimester."""

    def __init__(self, db):
        self.db = db
        school = School(name="Школа ИТ")
        db.add(school)
        db.flush()
        dept = Department(name="Программная инженерия", school_id=school.id)
        db.add(dept)
        db.flush()

        def user(name, login, roles, **kw):
            u = User(email=f"{login}@astanait.edu.kz", full_name=name, position="Преподаватель",
                     department_id=dept.id, roles=roles, **kw)
            db.add(u)
            return u

        self.admin = user("Админов Админ Админович", "admin", ["admin"], is_faculty=False)
        self.dean = user("Деканова Дина Маратовна", "dean", ["dean"], is_faculty=False, managed_school_id=school.id)
        self.teacher = user("Ахметова Айгерим Сериковна", "teacher", ["teacher"])
        self.obs1 = user("Ким Виктор Александрович", "kim", ["teacher"])
        self.obs2 = user("Петров Алексей Игоревич", "petrov", ["teacher"])
        year = AcademicYear(name="2026–2027", is_current=True)
        year.trimesters = [Trimester(number=n) for n in (1, 2, 3)]
        db.add(year)
        for i, title in enumerate(["Цели", "Методы"], 1):
            db.add(FeedbackCriterion(title=title, order=i))
        db.commit()
        self.trimester = year.trimesters[0]
        self.criteria = db.query(FeedbackCriterion).all()

    def lesson(self, days_ahead: int, approve: bool = True) -> OpenLesson:
        d = clock.now().date() + timedelta(days=days_ahead)
        lesson = OpenLesson(
            trimester_id=self.trimester.id,
            teacher_id=self.teacher.id,
            teacher_position="Старший преподаватель",
            department_id=self.teacher.department_id,
            topic="Интерактивные методы обучения",
            discipline="Педагогика",
            date=d,
            start_time=time(10, 0),
            end_time=time(10, 50),
            location_text="C1.2.243K",
            materials_deadline=lesson_logic.compute_deadline(self.db, d),
        )
        self.db.add(lesson)
        self.db.commit()
        if approve:
            lesson_logic.activate_lesson(self.db, lesson)
            self.trimester.status = "approved"
            self.db.commit()
        return lesson

    @staticmethod
    def auth(user: User) -> dict:
        return {"Authorization": f"Bearer {create_session_token(user.id)}"}


@pytest.fixture
def world(db):
    return World(db)


def docx_bytes() -> bytes:
    import io

    import docx

    d = docx.Document()
    d.add_paragraph("Цель занятия: научить. Задачи: понять. Результаты обучения: студенты будут уметь.")
    d.add_paragraph("Ход занятия: этап 1 (5 мин), групповая дискуссия, кейс, Mentimeter, рефлексия.")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


__all__ = ["travel_to", "docx_bytes", "World", "date"]
