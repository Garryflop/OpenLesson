import json

from conftest import World
from sqlalchemy import select

from app.models import Department, School, User

RECORDS = [
    {"id": 1, "userId": 501, "fullName": "Тестов Тест Тестович", "surname": "Тестов", "name": "Тест", "patronymic": "Тестович",
     "departmentId": 2, "departmentRu": "Школа программной инженерии", "departmentKz": "Бағдарламалық инженерия мектебі",
     "departmentEn": "School of Software Engineering"},
    {"id": 2, "userId": 502, "fullName": "Example Person", "surname": "Example", "name": "Person", "patronymic": "",
     "departmentId": None, "departmentRu": "Не указан", "departmentKz": "Көрсетілмеген", "departmentEn": "Not specified"},
]

CSV = (
    "﻿ID;User ID;ФИО;Фамилия;Имя;Отчество;Департамент (RU);Департамент (KZ);Департамент (EN)\n"
    '1;501;"Тестов Тест Тестович";"Тестов";"Тест";"Тестович";"Школа программной инженерии";"x";"School of Software Engineering"\n'
    '3;503;"Новая Персона";"Новая";"Персона";"";"Школа кибербезопасности";"y";"School of Cybersecurity"\n'
)


def test_import_json_then_csv_is_idempotent(client, db, world):
    admin = World.auth(world.admin)
    r = client.post("/api/users/import", headers=admin,
                    files={"file": ("teachers.json", json.dumps(RECORDS, ensure_ascii=False).encode(), "application/json")})
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 2 and r.json()["without_school"] == 1

    person = db.scalar(select(User).where(User.external_id == "501"))
    assert person.email is None and person.is_faculty and person.roles == ["teacher"]
    school = db.scalar(select(School).where(School.name == "Школа программной инженерии"))
    assert school.name_en == "School of Software Engineering"
    assert person.department.school_id == school.id

    # re-upload as CSV: 501 is updated, 503 is new, nobody is duplicated
    person.roles = ["teacher", "dean"]
    db.commit()
    r = client.post("/api/users/import", headers=admin, files={"file": ("teachers.csv", CSV.encode("utf-8"), "text/csv")})
    assert r.status_code == 200, r.text
    assert (r.json()["created"], r.json()["updated"]) == (1, 1)
    db.expire_all()
    assert len(db.scalars(select(User).where(User.external_id == "501")).all()) == 1
    assert "dean" in db.scalar(select(User).where(User.external_id == "501")).roles  # roles are preserved
    assert db.scalar(select(Department).where(Department.name == "Школа кибербезопасности")) is not None


def test_dev_login_by_id_for_directory_user_without_email(client, db, world):
    db.add(User(external_id="777", full_name="Без Почты Человек", roles=["teacher"]))
    db.commit()
    user = db.scalar(select(User).where(User.external_id == "777"))
    found = client.get("/api/auth/dev-users", params={"q": "без почты"}).json()
    assert [u["id"] for u in found] == [user.id]
    r = client.post("/api/auth/dev-login", json={"user_id": user.id})
    assert r.status_code == 200 and r.json()["email"] is None
    assert client.get("/api/auth/me").json()["id"] == user.id


def test_bad_directory_file(client, world):
    r = client.post("/api/users/import", headers=World.auth(world.admin),
                    files={"file": ("teachers.json", b'[{"foo": 1}]', "application/json")})
    assert r.status_code == 400
