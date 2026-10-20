import type ru from "../ru/home";

export default {
  greeting: (name: string) => `Сәлеметсіз бе, ${name}!`,
  stats: {
    violations: "Мерзімнің бұзылуы",
    violationsHint: "Әкімшінің шешімі қажет",
    awaiting: "Қатысушыларды тіркеу күтілуде",
    awaitingHint: "Өткізілген сабақтар",
    missing: "Материалдар мерзіміне < 4 күн",
    missingHint: "Құжаттар әлі жүктелмеген",
  },
  myLesson: {
    materials: (done: number, total: number) => `Материалдар: ${total} ішінен ${done}`,
    emptyTitle: "Жоспарланған сабақ жоқ",
    emptyText: "Ашық сабағыңыз кесте бекітілгеннен кейін пайда болады.",
  },
  feedback: {
    title: "Feedback толтыру қажет",
    subtitle: "Сіз қатысқан ашық сабақтар туралы пікірлер",
    due: (date: string) => `мерзімі: ${date}`,
    emptyTitle: "Барлығы толтырылды",
    emptyText: "Әріптестеріңіздің ашық сабақтарына қатысқаннан кейін жаңа формалар пайда болады.",
  },
  attention: {
    title: "Назар аудару қажет",
    confirmAttendees: "Қатысушыларды растаңыз",
    deadline: (rel: string) => `Мерзімі: ${rel}`,
  },
  upcoming: {
    title: "Жақын арадағы ашық сабақтар",
    subtitle: "Алдағы 14 күн — тәжірибе алмасу үшін келіңіз",
    empty: "Алдағы екі аптада сабақ жоқ",
  },
  analyticsText: "Триместрлер, кафедралар және оқытушылар бойынша статистика",
} satisfies typeof ru;
