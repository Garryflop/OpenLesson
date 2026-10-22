"""Export: feedback results (PDF) and trimester reports (Excel / PDF).

Reports are generated in the language of the request (``app.i18n``): all labels go through
``tr()`` and dates through the language-aware formatters in ``app.utils``.
"""

import io
from functools import lru_cache

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app import clock
from app.i18n import pick, tr
from app.models import AIAnalysis, FeedbackCriterion, FeedbackStatus, OpenLesson
from app.services.fonts import font_path
from app.utils import fmt_date, fmt_dt, fmt_range

NAVY = colors.HexColor("#0B2A5B")
LIGHT = colors.HexColor("#F1F5FB")
GRID = colors.HexColor("#D9DEE7")


@lru_cache
def _fonts() -> tuple[str, str]:
    regular, bold = font_path("regular"), font_path("bold")
    if not regular:
        return "Helvetica", "Helvetica-Bold"
    pdfmetrics.registerFont(TTFont("OL-Regular", regular))
    pdfmetrics.registerFont(TTFont("OL-Bold", bold or regular))
    return "OL-Regular", "OL-Bold"


def _styles():
    reg, bold = _fonts()
    return {
        "h1": ParagraphStyle("h1", fontName=bold, fontSize=17, leading=21, textColor=NAVY, spaceAfter=6),
        "h2": ParagraphStyle("h2", fontName=bold, fontSize=12.5, leading=16, textColor=NAVY, spaceBefore=10, spaceAfter=5),
        "p": ParagraphStyle("p", fontName=reg, fontSize=9.5, leading=13, alignment=TA_LEFT),
        "small": ParagraphStyle("small", fontName=reg, fontSize=8, leading=10.5, textColor=colors.HexColor("#5A6373")),
        "cell": ParagraphStyle("cell", fontName=reg, fontSize=8.3, leading=10.5),
        "cellb": ParagraphStyle("cellb", fontName=bold, fontSize=8.3, leading=10.5, textColor=colors.white),
    }


def _esc(text) -> str:
    return (str(text) if text is not None else "—").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")


def _table(rows: list[list], widths: list[float], header: bool = True) -> Table:
    st = _styles()
    data = [
        [Paragraph(_esc(c), st["cellb"] if header and i == 0 else st["cell"]) for c in row]
        for i, row in enumerate(rows)
    ]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.4, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), NAVY)]
        style += [("BACKGROUND", (0, i), (-1, i), LIGHT) for i in range(2, len(rows), 2)]
    t.setStyle(TableStyle(style))
    return t


def _fmt(v, suffix: str = "") -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.2f}".rstrip("0").rstrip(".") + suffix
    return f"{v}{suffix}"


def _footer(canvas, doc):
    reg, _ = _fonts()
    canvas.saveState()
    canvas.setFont(reg, 7.5)
    canvas.setFillColor(colors.HexColor("#8A93A3"))
    generated = fmt_dt(clock.now())
    canvas.drawString(
        15 * mm, 9 * mm, tr(f"OpenLesson · Astana IT University · сформировано {generated}",
                            f"OpenLesson · Astana IT University · generated on {generated}",
                            f"OpenLesson · Astana IT University · қалыптастырылған уақыты: {generated}")
    )
    canvas.drawRightString(doc.pagesize[0] - 15 * mm, 9 * mm, tr(f"стр. {doc.page}", f"p. {doc.page}", f"{doc.page}-бет"))
    canvas.restoreState()


# ------------------------------------------------------------------ feedback PDF


def feedback_pdf(lesson: OpenLesson, stats: dict, criteria: list[FeedbackCriterion], summary: AIAnalysis | None) -> bytes:
    st = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=16 * mm,
                            title=f"Feedback — {lesson.topic}")
    submitted_n, total_n, overall = stats["submitted"], stats["total"], _fmt(stats["overall"])
    story = [
        Paragraph(tr("Результаты обратной связи по открытому занятию", "Open lesson feedback results",
                     "Ашық сабақ бойынша кері байланыс нәтижелері"), st["h1"]),
        _table(
            [
                [tr("Преподаватель", "Teacher", "Оқытушы"), f"{lesson.teacher.full_name}, {lesson.teacher_position or ''}"],
                [tr("Тема", "Topic", "Тақырыбы"), lesson.topic],
                [tr("Дисциплина", "Discipline", "Пән"), lesson.discipline],
                [tr("Дата и время", "Date and time", "Күні мен уақыты"), f"{fmt_date(lesson.date)}, {fmt_range(lesson.start_time, lesson.end_time)}"],
                [tr("Место", "Location", "Орны"), lesson.place],
                [tr("Отзывов получено", "Reviews received", "Алынған пікірлер"),
                 tr(f"{submitted_n} из {total_n}", f"{submitted_n} of {total_n}", f"{total_n} ішінен {submitted_n}")],
                [tr("Средняя оценка", "Average score", "Орташа баға"), tr(f"{overall} из 5", f"{overall} out of 5", f"{overall} / 5")],
            ],
            [45 * mm, 135 * mm],
            header=False,
        ),
        Paragraph(tr("Средние оценки по критериям", "Average scores by criterion", "Критерийлер бойынша орташа бағалар"), st["h2"]),
        _table(
            [[tr("Критерий", "Criterion", "Критерий"), tr("Средняя оценка", "Average score", "Орташа баға"),
              tr("Оценок", "Ratings", "Бағалар саны")]]
            + [[c["title"], _fmt(c["average"]), c["count"]] for c in stats["criteria"]],
            [120 * mm, 35 * mm, 25 * mm],
        ),
    ]
    if summary:
        r = summary.result
        story += [
            Paragraph(tr("AI-анализ отзывов (рекомендация)", "AI analysis of the reviews (recommendation)",
                         "Пікірлердің ЖИ талдауы (ұсынымдық сипатта)"), st["h2"]),
            Paragraph(_esc(r.get("summary")), st["p"]),
        ]
        for title, key in (
            (tr("Сильные стороны", "Strengths", "Күшті жақтары"), "strengths"),
            (tr("Что улучшить", "What to improve", "Жетілдіру қажет"), "improvements"),
            (tr("Рекомендации", "Recommendations", "Ұсыныстар"), "recommendations"),
        ):
            items = r.get(key) or []
            if items:
                story.append(Paragraph(f"<b>{title}:</b> " + "; ".join(_esc(i) for i in items), st["p"]))
        if summary.provider == "openai":
            source = f"OpenAI API ({summary.model or ''})"
        elif summary.provider == "local_llm":
            source = tr(f"локальная LLM ({summary.model or ''})", f"local LLM ({summary.model or ''})", f"жергілікті LLM ({summary.model or ''})")
        else:
            source = tr("локальный анализ", "local analysis", "жергілікті талдау")
        story.append(Paragraph(tr(f"Источник: {source}", f"Source: {source}", f"Дереккөз: {source}"), st["small"]))

    names = {str(c.id): pick(c.title, c.title_en, c.title_kk) for c in criteria}
    story.append(Paragraph(tr("Отзывы коллег", "Colleagues' reviews", "Әріптестердің пікірлері"), st["h2"]))
    submitted = sorted((f for f in lesson.feedbacks if f.status == FeedbackStatus.submitted.value), key=lambda f: f.submitted_at)
    if not submitted:
        story.append(Paragraph(tr("Отзывы отсутствуют.", "No reviews.", "Пікірлер жоқ."), st["p"]))
    for i, f in enumerate(submitted, 1):
        scores = ", ".join(f"{names.get(k, k)}: {v}" for k, v in f.scores.items())
        author, sent, avg = f.author.full_name, fmt_dt(f.submitted_at), _fmt(f.average)
        rows = [
            [tr(f"Отзыв {i}: {author}", f"Review {i}: {author}", f"{i}-пікір: {author}"),
             tr(f"отправлен {sent} · средняя {avg}", f"submitted {sent} · average {avg}",
                f"жіберілді: {sent} · орташа баға: {avg}")],
            [tr("Оценки", "Scores", "Бағалар"), scores],
            [tr("Сильные стороны", "Strengths", "Күшті жақтары"), f.strengths],
            [tr("Рекомендации", "Recommendations", "Ұсыныстар"), f.improvements],
            [tr("Комментарий", "Comment", "Түсініктеме"), f.comment],
        ]
        for reply in f.replies:
            when = fmt_dt(reply.created_at)
            rows.append([tr(f"Ответ преподавателя ({when})", f"Teacher's reply ({when})", f"Оқытушының жауабы ({when})"),
                         reply.text])
        story += [_table(rows, [50 * mm, 130 * mm]), Spacer(1, 6)]
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


# ------------------------------------------------------------------ analytics reports


def _scope_title(scope: dict) -> str:
    return " · ".join(v for v in scope.values() if v) or tr("Все учебные годы", "All academic years", "Барлық оқу жылдары")


def analytics_xlsx(data: dict, scope: dict) -> bytes:
    wb = Workbook()
    head_font, head_fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="0B2A5B")

    def sheet(title: str, columns: list[str], rows: list[list], widths: list[int] | None = None):
        ws = wb.create_sheet(title)
        ws.append(columns)
        for r in rows:
            ws.append(r)
        for i, _ in enumerate(columns, 1):
            c = ws.cell(row=1, column=i)
            c.font, c.fill = head_font, head_fill
            c.alignment = Alignment(wrap_text=True, vertical="center")
            ws.column_dimensions[get_column_letter(i)].width = (widths or [])[i - 1] if widths and i <= len(widths) else 18
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        return ws

    s = data["summary"]
    ws = wb.active
    ws.title = tr("Сводка", "Summary", "Жиынтық")
    ws.append([tr("Отчёт OpenLesson", "OpenLesson report", "OpenLesson есебі"), _scope_title(scope)])
    ws.append([tr("Сформирован", "Generated", "Қалыптастырылды"), fmt_dt(data["generated_at"])])
    ws.append([])
    for label, value in [
        (tr("Всего занятий в графике", "Lessons in the schedule", "Кестедегі сабақтардың жалпы саны"), s["total"]),
        (tr("Проведено", "Held", "Өткізілді"), s["conducted"]),
        (tr("Аннулировано", "Annulled", "Күші жойылды"), s["annulled"]),
        (tr("Запланировано", "Planned", "Жоспарланған"), s["planned"]),
        (tr("Своевременная загрузка материалов, %", "Materials uploaded on time, %",
            "Материалдардың уақытында жүктелуі, %"), s["materials_on_time_rate"]),
        (tr("Посещений ППС", "Faculty visits", "ПОҚ қатысуы"), s["visits"]),
        (tr("Среднее число посетителей на занятие", "Average attendees per lesson",
            "Бір сабаққа келген қатысушылардың орташа саны"), s["avg_visits"]),
        (tr("Ожидалось отзывов", "Reviews expected", "Күтілген пікірлер"), s["feedback_expected"]),
        (tr("Получено отзывов", "Reviews received", "Алынған пікірлер"), s["feedback_submitted"]),
        (tr("Заполнение Feedback, %", "Feedback completion, %", "Feedback толтырылуы, %"), s["feedback_rate"]),
        (tr("Средняя оценка (из 5)", "Average score (out of 5)", "Орташа баға (1–5 шкаласы)"), s["avg_score"]),
    ]:
        ws.append([label, value])
    ws["A1"].font = Font(bold=True, size=14, color="0B2A5B")
    ws.column_dimensions["A"].width = 44
    ws.column_dimensions["B"].width = 40

    lessons = data["lessons"]
    yes, no = tr("да", "yes", "иә"), tr("нет", "no", "жоқ")
    date_, teacher, topic = tr("Дата", "Date", "Күні"), tr("Преподаватель", "Teacher", "Оқытушы"), tr("Тема", "Topic", "Тақырыбы")
    held, annulled = tr("Проведено", "Held", "Өткізілді"), tr("Аннулировано", "Annulled", "Күші жойылды")
    department, school = tr("Кафедра", "Department", "Кафедра"), tr("Школа", "School", "Мектеп")
    sheet(
        tr("Занятия", "Lessons", "Сабақтар"),
        [tr("Триместр", "Trimester", "Триместр"), date_, tr("Время", "Time", "Уақыты"), teacher,
         tr("Должность", "Position", "Лауазымы"), department, topic,
         tr("Дисциплина", "Discipline", "Пән"), tr("Место", "Location", "Орны"), tr("Статус", "Status", "Мәртебесі"),
         tr("Причина аннулирования", "Reason for annulment", "Күшін жою себебі")],
        [[l["trimester"], l["date"], l["time"], l["teacher"], l["position"], l["department"], l["topic"], l["discipline"], l["place"], l["status_label"], l["annul_reason"]] for l in lessons],
        [16, 12, 12, 30, 22, 26, 40, 26, 22, 18, 36],
    )
    sheet(
        tr("Проведённые и отменённые", "Held and annulled", "Өткізілген және күші жойылған"),
        [date_, teacher, topic, tr("Результат", "Result", "Нәтиже"), tr("Причина", "Reason", "Себебі")],
        [[l["date"], l["teacher"], l["topic"], held if l["conducted"] else annulled, l["annul_reason"]] for l in lessons if l["conducted"] or l["annulled"]],
        [12, 30, 44, 16, 44],
    )
    sheet(
        tr("Материалы", "Materials", "Материалдар"),
        [date_, teacher, topic, tr("Срок прошёл", "Deadline passed", "Мерзімі өтті"), tr("Загружено вовремя", "Uploaded on time", "Уақытында жүктелді")],
        [[l["date"], l["teacher"], l["topic"], yes if l["deadline_passed"] else no, yes if l["materials_on_time"] else no] for l in lessons],
        [12, 30, 44, 14, 18],
    )
    sheet(
        tr("Посещаемость", "Attendance", "Қатысу"),
        [date_, teacher, topic, tr("Посетителей", "Attendees", "Қатысушылар саны")],
        [[l["date"], l["teacher"], l["topic"], l["visits"]] for l in lessons if l["conducted"]],
        [12, 30, 44, 14],
    )
    sheet(
        "Feedback",
        [date_, teacher, topic, tr("Ожидалось", "Expected", "Күтілді"), tr("Получено", "Received", "Алынды"), tr("Не заполнено", "Not filled in", "Толтырылмады"),
         tr("Средняя оценка", "Average score", "Орташа баға")],
        [[l["date"], l["teacher"], l["topic"], l["fb_expected"], l["fb_submitted"], l["fb_expired"], l["avg"]] for l in lessons if l["fb_expected"]],
        [12, 30, 44, 12, 12, 14, 16],
    )
    crit = sheet(tr("Оценки по критериям", "Scores by criterion", "Критерийлер бойынша бағалар"),
                 [tr("Критерий", "Criterion", "Критерий"), tr("Средняя оценка", "Average score", "Орташа баға"), tr("Количество оценок", "Number of ratings", "Бағалар саны")],
                 [[c["title"], c["average"], c["count"]] for c in data["criteria"]], [50, 16, 18])
    if data["criteria"]:
        chart = BarChart()
        chart.type = "bar"
        chart.title = tr("Средние оценки по критериям", "Average scores by criterion", "Критерийлер бойынша орташа бағалар")
        chart.y_axis.title = tr("Оценка", "Score", "Баға")
        chart.add_data(Reference(crit, min_col=2, min_row=1, max_row=len(data["criteria"]) + 1), titles_from_data=True)
        chart.set_categories(Reference(crit, min_col=1, min_row=2, max_row=len(data["criteria"]) + 1))
        chart.height, chart.width = 9, 18
        crit.add_chart(chart, "E2")
    group_cols = [tr("Всего", "Total", "Барлығы"), held, annulled, tr("Вовремя, %", "On time, %", "Уақытында, %"), tr("Посещений", "Visits", "Қатысу"),
                  "Feedback, %", tr("Средняя оценка", "Average score", "Орташа баға")]

    def gvals(r):
        return [r["total"], r["conducted"], r["annulled"], r["materials_on_time_rate"], r["visits"], r["feedback_rate"], r["avg_score"]]

    sheet(tr("По кафедрам", "By department", "Кафедралар бойынша"), [department, school] + group_cols,
          [[r["department"], r["school"]] + gvals(r) for r in data["by_department"]], [30, 34])
    sheet(tr("По преподавателям", "By teacher", "Оқытушылар бойынша"), [teacher, department] + group_cols,
          [[r["teacher"], r["department"]] + gvals(r) for r in data["by_teacher"]], [32, 28])
    sheet(tr("По триместрам", "By trimester", "Триместрлер бойынша"), [tr("Триместр", "Trimester", "Триместр")] + group_cols,
          [[r["label"]] + gvals(r) for r in data["by_trimester"]], [26])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def analytics_pdf(data: dict, scope: dict) -> bytes:
    st = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm,
                            bottomMargin=15 * mm, title=tr("Отчёт OpenLesson", "OpenLesson report", "OpenLesson есебі"))
    s = data["summary"]
    story = [
        Paragraph(tr("Отчёт по открытым занятиям", "Open lessons report", "Ашық сабақтар бойынша есеп"), st["h1"]),
        Paragraph(_esc(_scope_title(scope)), st["p"]),
        Spacer(1, 6),
        _table(
            [
                [tr("Всего", "Total", "Барлығы"), tr("Проведено", "Held", "Өткізілді"), tr("Аннулировано", "Annulled", "Күші жойылды"),
                 tr("Материалы вовремя", "Materials on time", "Материалдар уақытында"),
                 tr("Посещений ППС", "Faculty visits", "ПОҚ қатысуы"),
                 tr("Feedback заполнен", "Feedback completed", "Feedback толтырылды"),
                 tr("Средняя оценка", "Average score", "Орташа баға")],
                [s["total"], s["conducted"], s["annulled"], _fmt(s["materials_on_time_rate"], "%"), s["visits"],
                 _fmt(s["feedback_rate"], "%"), _fmt(s["avg_score"])],
            ],
            [38 * mm] * 7,
        ),
    ]
    if data["criteria"]:
        story += [Paragraph(tr("Средние результаты оценивания", "Average assessment results", "Бағалаудың орташа нәтижелері"), st["h2"]),
                  _table([[tr("Критерий", "Criterion", "Критерий"), tr("Средняя оценка", "Average score", "Орташа баға"),
                           tr("Оценок", "Ratings", "Бағалар саны")]]
                         + [[c["title"], _fmt(c["average"]), c["count"]] for c in data["criteria"]],
                         [150 * mm, 40 * mm, 30 * mm])]

    def grows(rows, first):
        return [[*(r[k] for k in first), r["total"], r["conducted"], r["annulled"], _fmt(r["materials_on_time_rate"], "%"),
                 r["visits"], _fmt(r["feedback_rate"], "%"), _fmt(r["avg_score"])] for r in rows]

    cols = [tr("Всего", "Total", "Барлығы"), tr("Проведено", "Held", "Өткізілді"), tr("Аннул.", "Annulled", "Жойылды"),
            tr("Вовремя", "On time", "Уақтылы"), tr("Посещ.", "Visits", "Қатысу"), "Feedback", tr("Оценка", "Score", "Баға")]
    teacher, department = tr("Преподаватель", "Teacher", "Оқытушы"), tr("Кафедра", "Department", "Кафедра")
    story += [
        Paragraph(tr("По кафедрам", "By department", "Кафедралар бойынша"), st["h2"]),
        _table([[department, tr("Школа", "School", "Мектеп")] + cols] + grows(data["by_department"], ["department", "school"]),
               [60 * mm, 66 * mm] + [20 * mm] * 7),
        Paragraph(tr("По преподавателям", "By teacher", "Оқытушылар бойынша"), st["h2"]),
        _table([[teacher, department] + cols] + grows(data["by_teacher"], ["teacher", "department"]),
               [60 * mm, 66 * mm] + [20 * mm] * 7),
        Paragraph(tr("Проведённые и отменённые занятия", "Held and annulled lessons",
                     "Өткізілген және күші жойылған сабақтар"), st["h2"]),
        _table(
            [[tr("Дата", "Date", "Күні"), teacher, tr("Тема", "Topic", "Тақырыбы"), tr("Статус", "Status", "Мәртебесі"),
              tr("Посещ.", "Visits", "Қатысу"), tr("Отзывы", "Reviews", "Пікірлер"), tr("Оценка", "Score", "Баға"),
              tr("Причина аннулирования", "Reason for annulment", "Күшін жою себебі")]]
            + [[l["date"].strftime("%d.%m.%Y"), l["teacher"], l["topic"], l["status_label"], l["visits"],
                f"{l['fb_submitted']}/{l['fb_expected']}", _fmt(l["avg"]), l["annul_reason"] or ""]
               for l in data["lessons"] if l["conducted"] or l["annulled"]],
            [20 * mm, 45 * mm, 70 * mm, 26 * mm, 15 * mm, 17 * mm, 16 * mm, 60 * mm],
        ),
    ]
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()
