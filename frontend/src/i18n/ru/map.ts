// Keep keys in sync with ../en/map.ts
export default {
  subtitle: "Корпус C1 Astana IT University: аудитории и места проведения открытых занятий",
  range: {
    week: "Неделя",
    month: "Месяц",
  },
  lessonsCount: (n: number) => `открытых занятий: ${n}`,
  selectedRoom: "Выбранная аудитория",
  roomPlace: (building: string, block: string | null, floor: number | null) => `Корпус ${building} · блок ${block ?? ""} · ${floor ?? ""} этаж`,
  roomKind: (kind: string) => `Тип: ${kind}`,
  // The hint wraps a bold room number: {hintBefore}<b>243</b>{hintAfter}
  hintBefore:
    "Нажмите на аудиторию на карте, чтобы увидеть открытые занятия в ней. Оранжевым отмечены аудитории с занятиями за выбранный период; используйте поиск по номеру (например, ",
  hintAfter: ") — этаж переключится автоматически.",
  emptyRoom: "В этой аудитории нет открытых занятий за выбранный период",
  // CampusMap chrome
  searchPlaceholder: "243 или C1.2.243K",
  searchLabel: "Поиск аудитории",
  floor: (n: number) => `${n} этаж`,
  zoomIn: "Приблизить",
  zoomOut: "Отдалить",
  zoomReset: "Сбросить масштаб",
  legend: {
    room: "Аудитория",
    lesson: "Открытое занятие",
    selected: "Выбрано",
  },
};
