import type ru from "../ru/login";

export default {
  title: "Sign in",
  heroTitle: "Teachers' open lessons —",
  heroAccent: "on a single platform",
  heroText:
    "Trimester schedule planning, materials control, invitations, attendee registration, electronic feedback forms and analytics with an AI Assistant.",
  featureSchedule: "Schedule, reminders and automatic deadline control",
  featureReviews: "Peer reviews within 3 days and replies from the teacher",
  featureAi: "AI analysis of the lesson plan and feedback",
  heading: "Sign in to OpenLesson",
  hint: "Use your corporate university account.",
  signInWith: (provider: string) => `Sign in with ${provider} (Outlook)`,
  oidcMissing:
    "OpenID Connect is not yet connected to the university tenant. Set OIDC_CLIENT_ID and OIDC_DISCOVERY_URL in the server settings — until then, use the demo sign-in below.",
  demoTitle: "Demo sign-in",
  devOnly: "development only",
  searchLabel: "Search staff",
  searchPlaceholder: "Search by name — e.g. a teacher's surname",
  unavailable: "Sign-in is unavailable — contact the administrator",
} satisfies typeof ru;
