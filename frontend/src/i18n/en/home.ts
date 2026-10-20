import type ru from "../ru/home";

export default {
  greeting: (name: string) => `Hello, ${name}!`,
  stats: {
    violations: "Deadline violations",
    violationsHint: "Administrator decision required",
    awaiting: "Awaiting attendee registration",
    awaitingHint: "Lessons already held",
    missing: "Materials due in < 4 days",
    missingHint: "Documents not uploaded yet",
  },
  myLesson: {
    materials: (done: number, total: number) => `Materials: ${done} of ${total}`,
    emptyTitle: "No lessons planned",
    emptyText: "Your open lesson will appear once the schedule is approved.",
  },
  feedback: {
    title: "Feedback to fill in",
    subtitle: "Reviews of open lessons you attended",
    due: (date: string) => `due ${date}`,
    emptyTitle: "All done",
    emptyText: "New forms will appear after you attend colleagues' open lessons.",
  },
  attention: {
    title: "Needs attention",
    confirmAttendees: "Confirm attendees",
    deadline: (rel: string) => `Due ${rel}`,
  },
  upcoming: {
    title: "Upcoming open lessons",
    subtitle: "Next 14 days — drop in and share experience",
    empty: "No lessons in the next two weeks",
  },
  analyticsText: "Statistics by trimester, department and teacher",
} satisfies typeof ru;
