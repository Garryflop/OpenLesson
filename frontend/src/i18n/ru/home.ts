// Keep keys in sync with ../en/home.ts
export default {
  greeting: (name: string) => `Здравствуйте, ${name}!`,
  stats: {
    violations: "Нарушения сроков",
    violationsHint: "Требуется решение администратора",
    awaiting: "Ожидают регистрации посетителей",
    awaitingHint: "Проведённые занятия",
    missing: "Срок материалов < 4 дней",
    missingHint: "Документы ещё не загружены",
  },
  myLesson: {
    materials: (done: number, total: number) => `Материалы: ${done} из ${total}`,
    emptyTitle: "Нет запланированных занятий",
    emptyText: "Ваше открытое занятие появится после утверждения графика.",
  },
  feedback: {
    title: "Нужно заполнить Feedback",
    subtitle: "Отзывы о посещённых открытых занятиях",
    due: (date: string) => `до ${date}`,
    emptyTitle: "Всё заполнено",
    emptyText: "Новые формы появятся после посещения открытых занятий коллег.",
  },
  attention: {
    title: "Требует внимания",
    confirmAttendees: "Подтвердите посетителей",
    deadline: (rel: string) => `Срок ${rel}`,
  },
  upcoming: {
    title: "Ближайшие открытые занятия",
    subtitle: "Следующие 14 дней — приходите, чтобы обменяться опытом",
    empty: "В ближайшие две недели занятий нет",
  },
  analyticsText: "Статистика по триместрам, кафедрам и преподавателям",
};
