import type ru from "../ru/map";

export default {
  subtitle: "Astana IT University C1 корпусы: ашық сабақтар өтетін аудиториялар мен орындар",
  range: {
    week: "Апта",
    month: "Ай",
  },
  lessonsCount: (n: number) => `${n} ашық сабақ`,
  selectedRoom: "Таңдалған аудитория",
  roomPlace: (building: string, block: string | null, floor: number | null) =>
    `${building} корпусы · ${block ?? ""} блок · ${floor != null ? `${floor}-қабат` : ""}`,
  roomKind: (kind: string) => `Түрі: ${kind}`,
  // The hint wraps a bold room number: {hintBefore}<b>243</b>{hintAfter}
  hintBefore:
    "Аудиториядағы ашық сабақтарды көру үшін картадан оны басыңыз. Таңдалған кезеңде сабақтары бар аудиториялар қызғылт сары түспен белгіленген; нөмір бойынша іздеуді пайдаланыңыз (мысалы, ",
  hintAfter: ") — қабат автоматты түрде ауысады.",
  emptyRoom: "Таңдалған кезеңде бұл аудиторияда ашық сабақ жоқ",
  // CampusMap chrome
  searchPlaceholder: "243 немесе C1.2.243K",
  searchLabel: "Аудиторияны іздеу",
  floor: (n: number) => `${n}-қабат`,
  zoomIn: "Жақындату",
  zoomOut: "Алыстату",
  zoomReset: "Масштабты қалпына келтіру",
  legend: {
    room: "Аудитория",
    lesson: "Ашық сабақ",
    selected: "Таңдалған",
  },
} satisfies typeof ru;
