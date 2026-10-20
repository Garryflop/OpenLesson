import type ru from "../ru/myLessons";

export default {
  subtitle: "Сабақ туралы мәліметтер, құжаттарды жүктеу мерзімі және әр файлдың мәртебесі",
  trimester: (roman: string, year: string) => `${roman} триместр · ${year}`,
  discipline: "Пән",
  date: "Күні",
  time: "Уақыты",
  place: "Орны",
  lessonCard: "Сабақ беті",
  emptyTitle: "Сізде әзірге ашық сабақ жоқ",
  emptyText: "Триместрге арналған ашық сабақтар кестесі бекітілгеннен кейін сабағыңыз осында пайда болады.",
  others: "Менің басқа сабақтарым",
} satisfies typeof ru;
