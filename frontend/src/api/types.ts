export type Role = "admin" | "methodist" | "teacher" | "dean" | "leadership";

export type LessonStatus =
  | "draft"
  | "scheduled"
  | "materials_ready"
  | "confirmed"
  | "violation"
  | "annulled"
  | "completed"
  | "feedback"
  | "closed";

export interface UserBrief {
  id: number;
  full_name: string;
  short_name: string;
  position: string | null;
  department_name: string | null;
  email: string | null;
}

export interface User extends UserBrief {
  /** Interface / e-mail language saved in the profile; null until the user's first visit. */
  language?: "kk" | "ru" | "en" | null;
  department_id: number | null;
  school_id: number | null;
  school_name: string | null;
  managed_school_id: number | null;
  managed_school_name: string | null;
  roles: Role[];
  is_active: boolean;
  is_faculty: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Location {
  id: number;
  code: string;
  map_key: string | null;
  building: string;
  block: string | null;
  floor: number | null;
  room: string | null;
  title: string | null;
  kind: string;
  capacity: number | null;
  is_active: boolean;
  display_name: string;
}

export interface Trimester {
  id: number;
  year_id: number;
  year_name: string;
  number: number;
  roman: string;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "approved";
  approved_at: string | null;
  lesson_count: number;
}

export interface AcademicYear {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  trimesters: Trimester[];
}

export interface Lesson {
  id: number;
  trimester_id: number;
  trimester_number: number;
  trimester_roman: string;
  year_name: string;
  teacher: UserBrief;
  teacher_position: string | null;
  department_id: number | null;
  department_name: string | null;
  school_name: string | null;
  topic: string;
  discipline: string;
  date: string;
  start_time: string;
  end_time: string;
  location: Location | null;
  location_text: string | null;
  place: string;
  status: LessonStatus;
  status_label: string;
  materials_deadline: string | null;
  materials: { presentation: boolean; plan: boolean };
  poster_png: string | null;
  attendance_count: number;
  feedback_submitted: number;
  feedback_total: number;
  avg_score: number | null;
  is_mine: boolean;
}

export interface Material {
  id: number;
  kind: "presentation" | "plan";
  title: string;
  original_name: string;
  size: number;
  uploaded_at: string;
  uploaded_by: UserBrief | null;
  on_time: boolean;
  url: string;
}

export interface LessonEvent {
  id: number;
  kind: string;
  message: string;
  actor: UserBrief | null;
  created_at: string;
}

export interface Attendance {
  id: number;
  user_id: number;
  full_name: string;
  position: string | null;
  department_name: string | null;
  visit_date: string;
  source: "manual" | "qr";
  status: "pending" | "confirmed" | "rejected";
  registered_at: string;
  confirmed_at: string | null;
}

export interface PlanSection {
  area: "structure" | "objectives" | "outcomes" | "interactive" | "digital";
  assessment: "good" | "partial" | "missing";
  comment: string;
  recommendations: string[];
}

export interface Analysis<T = Record<string, unknown>> {
  id: number;
  kind: "plan" | "feedback" | "invitation";
  /** openai — OpenAI API (ChatGPT), local_llm — local LLM (Ollama / LM Studio), local — rule-based analyser */
  provider: "openai" | "local_llm" | "local";
  model: string | null;
  status: string;
  result: T;
  error: string | null;
  created_at: string;
}

export interface PlanResult {
  summary: string;
  score: number;
  strengths: string[];
  sections: PlanSection[];
  priorities: string[];
}

export interface FeedbackSummaryResult {
  summary: string;
  sentiment: "positive" | "mixed" | "negative";
  strengths: string[];
  improvements: string[];
  recommendations: string[];
}

export interface LessonDetail extends Lesson {
  poster_pdf: string | null;
  poster_generated_at: string | null;
  poster_sent_at: string | null;
  invitation_text: string | null;
  original_deadline: string | null;
  extended_deadline: string | null;
  annul_reason: string | null;
  annulled_at: string | null;
  violation_at: string | null;
  checked_at: string | null;
  feedback_opened_at: string | null;
  feedback_due_at: string | null;
  feedback_closed_at: string | null;
  attendance_confirmed_at: string | null;
  start_dt: string;
  end_dt: string;
  is_past: boolean;
  permissions: { manage: boolean; upload: boolean; view_details: boolean; is_teacher: boolean; reply: boolean };
  materials_list: Material[];
  events: LessonEvent[];
  qr_token: string | null;
  my_attendance: Attendance | null;
  my_feedback: { id: number; status: FeedbackStatus; due_at: string } | null;
  analyses: {
    plan?: Analysis<PlanResult> | null;
    feedback?: Analysis<FeedbackSummaryResult> | null;
    invitation?: Analysis<{ invitation_text: string; short_description: string }> | null;
  };
}

export type FeedbackStatus = "pending" | "draft" | "submitted" | "expired";

export interface Criterion {
  id: number;
  /** In the interface language; the editor works with the raw *_ru / *_en / *_kk fields. */
  title: string;
  description: string | null;
  title_ru?: string;
  description_ru?: string | null;
  title_en?: string | null;
  description_en?: string | null;
  title_kk?: string | null;
  description_kk?: string | null;
  order: number;
  is_active: boolean;
}

export interface Reply {
  id: number;
  text: string;
  created_at: string;
  author: UserBrief;
}

export interface Feedback {
  id: number;
  lesson_id: number;
  status: FeedbackStatus;
  scores: Record<string, number>;
  average: number | null;
  strengths: string | null;
  improvements: string | null;
  comment: string | null;
  opened_at: string;
  due_at: string;
  submitted_at: string | null;
  updated_at: string;
  author: UserBrief | null;
  replies: Reply[];
}

export interface FeedbackForm extends Feedback {
  lesson: Lesson;
  criteria: Criterion[];
  is_author: boolean;
  editable: boolean;
}

export interface LessonFeedback {
  items: Feedback[];
  stats: {
    criteria: { id: number; title: string; average: number | null; count: number }[];
    overall: number | null;
    submitted: number;
    total: number;
    pending: (UserBrief & { status: FeedbackStatus; due_at: string })[];
  };
  ai_summary: Analysis<FeedbackSummaryResult> | null;
  can_reply: boolean;
}

export interface Notification {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  lesson_id: number | null;
  created_at: string;
  read_at: string | null;
}

export interface SystemInfo {
  now: string;
  real_now: string;
  clock_offset_minutes: number;
  environment: string;
  timezone: string;
  email_backend: string;
  ai_provider: "openai" | "local_llm" | "local";
  ai_model: string | null;
  oidc_enabled: boolean;
  scheduler_enabled: boolean;
}

export interface Structure {
  schools: { id: number; name: string; short_name: string | null; departments: { id: number; name: string; school_id: number | null }[] }[];
  unassigned_departments: { id: number; name: string; school_id: number | null }[];
}

export interface GroupStats {
  total: number;
  conducted: number;
  annulled: number;
  planned: number;
  materials_on_time_rate: number | null;
  visits: number;
  avg_visits: number | null;
  feedback_expected: number;
  feedback_submitted: number;
  feedback_rate: number | null;
  avg_score: number | null;
}

export interface Analytics {
  generated_at: string;
  scope: Record<string, string>;
  summary: GroupStats;
  by_status: { status: LessonStatus; label: string; count: number }[];
  criteria: { id: number; title: string; average: number; count: number }[];
  by_department: (GroupStats & { key: number; department: string; school: string | null })[];
  by_teacher: (GroupStats & { key: number; teacher: string; teacher_id: number; department: string | null })[];
  by_trimester: (GroupStats & { key: number; label: string })[];
  by_month: { month: string; total: number; conducted: number; annulled: number }[];
  top_lessons: { id: number; topic: string; teacher: string; date: string; avg_score: number; feedback: number }[];
  top_observers: { user_id: number; full_name: string; department: string | null; visits: number }[];
}

export interface EmailItem {
  id: number;
  to_email: string;
  subject: string;
  kind: string;
  lesson_id: number | null;
  status: "pending" | "sent" | "failed";
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  sent_at: string | null;
  created_at: string;
  attachments: string[];
}

export type AppSettings = {
  pre_reminder_days: number;
  reminder_days: number;
  deadline_days: number;
  deadline_time: string;
  annul_policy: "auto" | "admin_confirm" | "grace";
  grace_hours: number;
  poster_days: number;
  poster_primary_color: string;
  poster_accent_color: string;
  poster_logo: string | null;
  university_name: string;
  poster_language: "kk" | "ru" | "en";
  qr_checkin_enabled: boolean;
  checkin_before_minutes: number;
  checkin_after_minutes: number;
  feedback_days: number;
  feedback_reminder_days: number[];
  mailing_enabled: boolean;
  demo_clock_offset_minutes: number;
};
