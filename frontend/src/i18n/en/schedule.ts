import type ru from "../ru/schedule";

export default {
  title: "Open lesson schedule",
  yearSubtitle: (name: string) => `Academic year ${name}`,
  year: "Academic year",
  trimester: "Trimester",
  trimesterLabel: (roman: string) => `Trimester ${roman}`,
  searchPlaceholder: "Topic, course or teacher",
  search: "Search lessons",
  clearSearch: "Clear search",
  department: "Department",
  allDepartments: "All departments",
  mine: "My lessons",
  statusFilter: "Filter by status",
  draftNotice: (roman: string) => `The schedule for trimester ${roman} is not approved yet.`,
  goApprove: "Go to approval",
  afterApproval: "Lessons will appear once it is approved.",
  noMatchesTitle: "Nothing matches the filters",
  noMatchesText: "Change the search terms or reset the filters.",
  emptyTitle: "No lessons in this trimester yet",
  emptyText: "Lessons will appear once the schedule is uploaded and approved.",
  resetFilters: "Reset filters",
} satisfies typeof ru;
