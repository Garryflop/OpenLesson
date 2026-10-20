import { ArrowLeft, CalendarDays, Compass } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, usePageTitle } from "../components/ui";
import { useI18n } from "../i18n";

export default function NotFoundPage() {
  const c = useI18n().t.common;
  usePageTitle(c.notFound.title);
  const navigate = useNavigate();
  return (
    <Card className="mx-auto max-w-lg px-6 py-12 text-center">
      <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
        <Compass className="size-7" />
      </div>
      <p className="text-sm font-medium text-gray-400">{c.notFound.code}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{c.notFound.heading}</h1>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-gray-500">{c.notFound.text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={() => navigate(-1)}>
          {c.actions.back}
        </Button>
        <Link to="/schedule">
          <Button icon={<CalendarDays className="size-4" />}>{c.notFound.toSchedule}</Button>
        </Link>
      </div>
    </Card>
  );
}
