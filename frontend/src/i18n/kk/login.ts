import type ru from "../ru/login";

export default {
  title: "Кіру",
  heroTitle: "Оқытушылардың ашық сабақтары —",
  heroAccent: "бір платформада",
  heroText:
    "Кестені триместрлер бойынша жоспарлау, материалдарды бақылау, шақырулар, қатысушыларды тіркеу, электрондық Feedback және AI Assistant көмегімен аналитика.",
  featureSchedule: "Кесте, еске салулар және мерзімдерді автоматты бақылау",
  featureReviews: "Әріптестердің 3 күн ішіндегі пікірлері және оқытушының жауаптары",
  featureAi: "Сабақ жоспары мен кері байланыстың ЖИ талдауы",
  heading: "OpenLesson жүйесіне кіру",
  hint: "Университеттің корпоративтік есептік жазбасын пайдаланыңыз.",
  signInWith: (provider: string) => `${provider} (Outlook) арқылы кіру`,
  oidcMissing:
    "OpenID Connect университет тенантына әлі қосылмаған. Сервер баптауларында OIDC_CLIENT_ID және OIDC_DISCOVERY_URL мәндерін көрсетіңіз — оған дейін төмендегі демо-кіруді пайдаланыңыз.",
  demoTitle: "Демо-кіру",
  devOnly: "тек әзірлеуге арналған",
  searchLabel: "Қызметкерді іздеу",
  searchPlaceholder: "Аты-жөні бойынша іздеу — мысалы, оқытушының тегі",
  unavailable: "Кіру мүмкін емес — әкімшіге хабарласыңыз",
} satisfies typeof ru;
