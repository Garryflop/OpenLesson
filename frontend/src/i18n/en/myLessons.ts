import type ru from "../ru/myLessons";

export default {
  subtitle: "Lesson details, the document upload deadline and the status of each file",
  trimester: (roman: string, year: string) => `Trimester ${roman} · ${year}`,
  discipline: "Course",
  date: "Date",
  time: "Time",
  place: "Location",
  lessonCard: "Lesson page",
  emptyTitle: "You have no open lessons yet",
  emptyText: "Your lesson will appear here once the trimester's open lesson schedule is approved.",
  others: "My other lessons",
} satisfies typeof ru;
