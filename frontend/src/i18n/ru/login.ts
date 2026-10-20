// Keep keys in sync with ../en/login.ts
export default {
  title: "Вход",
  heroTitle: "Открытые занятия преподавателей —",
  heroAccent: "в одной платформе",
  heroText:
    "Планирование графика по триместрам, контроль материалов, приглашения, регистрация посетителей, электронный Feedback и аналитика с AI Assistant.",
  featureSchedule: "График, напоминания и автоматический контроль сроков",
  featureReviews: "Отзывы коллег в течение 3 дней и ответы преподавателя",
  featureAi: "AI-анализ плана занятия и обратной связи",
  heading: "Вход в OpenLesson",
  hint: "Используйте корпоративную учётную запись университета.",
  signInWith: (provider: string) => `Войти через ${provider} (Outlook)`,
  oidcMissing:
    "OpenID Connect ещё не подключён к тенанту университета. Укажите OIDC_CLIENT_ID и OIDC_DISCOVERY_URL в настройках сервера — до этого используйте демонстрационный вход ниже.",
  demoTitle: "Демонстрационный вход",
  devOnly: "только для разработки",
  searchLabel: "Поиск сотрудника",
  searchPlaceholder: "Поиск по ФИО — например, фамилия преподавателя",
  unavailable: "Вход недоступен — обратитесь к администратору",
};
