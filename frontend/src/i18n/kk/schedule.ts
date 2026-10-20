import type ru from "../ru/schedule";

export default {
  title: "Ашық сабақтар кестесі",
  yearSubtitle: (name: string) => `${name} оқу жылы`,
  year: "Оқу жылы",
  trimester: "Триместр",
  trimesterLabel: (roman: string) => `${roman} триместр`,
  searchPlaceholder: "Тақырып, пән немесе оқытушы",
  search: "Сабақтарды іздеу",
  clearSearch: "Іздеуді тазарту",
  department: "Кафедра",
  allDepartments: "Барлық кафедралар",
  mine: "Менің сабақтарым",
  statusFilter: "Мәртебе бойынша сүзгі",
  draftNotice: (roman: string) => `${roman} триместр кестесі әлі бекітілмеген.`,
  goApprove: "Бекітуге өту",
  afterApproval: "Сабақтар кесте бекітілгеннен кейін пайда болады.",
  noMatchesTitle: "Сүзгілер бойынша ештеңе табылмады",
  noMatchesText: "Іздеу шарттарын өзгертіңіз немесе сүзгілерді тазартыңыз.",
  emptyTitle: "Бұл триместрде әзірге сабақ жоқ",
  emptyText: "Сабақтар кесте жүктеліп, бекітілгеннен кейін пайда болады.",
  resetFilters: "Сүзгілерді тазарту",
} satisfies typeof ru;
