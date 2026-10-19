"""Default reference data shared by the seed script and start-up backfill."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FeedbackCriterion

# (title, description, title_en, description_en)
CRITERIA: list[tuple[str, str, str, str]] = [
    ("Соответствие темы и достижение целей", "Цели занятия сформулированы и достигнуты",
     "Relevance of the topic and achievement of goals", "Lesson goals are stated and achieved"),
    ("Структура и логика изложения", "Последовательность этапов, связность материала",
     "Structure and logic", "Sequence of stages, coherence of the material"),
    ("Интерактивные и активные методы", "Работа в группах, дискуссии, кейсы, игровые методы",
     "Interactive and active methods", "Group work, discussions, case studies, games"),
    ("Цифровые инструменты и наглядность", "Использование LMS, онлайн-сервисов, презентации",
     "Digital tools and visual aids", "Use of the LMS, online services, slides"),
    ("Вовлечённость студентов", "Активность и мотивация студентов на занятии",
     "Student engagement", "Students' activity and motivation during the lesson"),
    ("Обратная связь и рефлексия", "Проверка понимания, подведение итогов",
     "Feedback and reflection", "Checking understanding, summing up"),
    ("Управление временем", "Соблюдение регламента и темпа занятия",
     "Time management", "Keeping to the timing and pace of the lesson"),
    ("Общее впечатление", "Итоговая оценка открытого занятия",
     "Overall impression", "Overall assessment of the open lesson"),
]


# Russian title → (Kazakh title, Kazakh description)
CRITERIA_KK: dict[str, tuple[str, str]] = {
    "Соответствие темы и достижение целей": (
        "Тақырыптың сәйкестігі және мақсаттарға қол жеткізу", "Сабақтың мақсаттары нақты қойылып, оларға қол жеткізілді"),
    "Структура и логика изложения": ("Құрылымы және баяндау логикасы", "Кезеңдердің реттілігі, материалдың байланыстылығы"),
    "Интерактивные и активные методы": ("Интерактивті және белсенді әдістер", "Топтық жұмыс, пікірталас, кейстер, ойын әдістері"),
    "Цифровые инструменты и наглядность": ("Цифрлық құралдар және көрнекілік", "LMS, онлайн-сервистер мен презентацияларды пайдалану"),
    "Вовлечённость студентов": ("Студенттердің тартылуы", "Сабақтағы студенттердің белсенділігі мен уәжі"),
    "Обратная связь и рефлексия": ("Кері байланыс және рефлексия", "Түсінуді тексеру, қорытынды шығару"),
    "Управление временем": ("Уақытты басқару", "Сабақтың регламенті мен қарқынын сақтау"),
    "Общее впечатление": ("Жалпы әсер", "Ашық сабақтың қорытынды бағасы"),
}


def backfill_translations(db: Session) -> None:
    """Add English / Kazakh titles to default criteria created before those languages existed."""
    by_title = {ru: (en, desc_en) for ru, _, en, desc_en in CRITERIA}
    changed = False
    for c in db.scalars(select(FeedbackCriterion)).all():
        if c.title_en is None and c.title in by_title:
            c.title_en, c.description_en = by_title[c.title]
            changed = True
        if c.title_kk is None and c.title in CRITERIA_KK:
            c.title_kk, c.description_kk = CRITERIA_KK[c.title]
            changed = True
    if changed:
        db.commit()
