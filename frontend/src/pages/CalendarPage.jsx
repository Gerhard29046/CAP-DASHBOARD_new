import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { RefreshCw, X, Building2, Wrench, User2, Droplets, StickyNote, Calendar as CalendarIcon } from "lucide-react";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";

// Google Calendar sync was removed 2026-08-12 (user decision: Cloud Functions/Google API
// cost was not justified) -- this page now only ever shows the CAP Dashboard's own
// "Upcoming Services" calendar, built from service_records/machines/clients directly (see
// apiClient.js's calendarEvents()). See git history before this change for the removed
// Google toggle/status/EventDetails branch.
export default function CalendarPage() {
  const { hasPermission } = useAuth();
  const ref = useRef(null);

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [range, setRange] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({
        start: range.startStr,
        end: range.endStr,
        include_services: "1",
      });
      const data = await apiClient.request(`/calendar/events?${q}`);
      setEvents(data.events || []);
      setWarnings(data.warnings || []);
    } catch (e) {
      setError(e.message);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const eventClass = (e) => e.event.extendedProps.status?.toLowerCase() === "completed"
    ? ["calendar-completed"]
    : new Date(e.event.start) < new Date().setHours(0, 0, 0, 0)
      ? ["calendar-overdue"]
      : ["calendar-service"];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <PageHeader
        title="Calendar"
        subtitle="Upcoming services, derived from your service records."
        action={
          <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Refresh"}
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}
      {warnings.map((w) => (
        <div key={w} className="rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
          {w}
        </div>
      ))}

      <div className="relative min-h-[650px] rounded-xl border border-border bg-card p-3 md:p-5 animate-fade-in">
        <FullCalendar
          ref={ref}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={window.innerWidth < 640 ? "listMonth" : "dayGridMonth"}
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listMonth" }}
          buttonText={{ month: "Month", week: "Week", day: "Day", list: "Agenda" }}
          timeZone="Africa/Johannesburg"
          height="auto"
          events={events}
          editable={false}
          selectable={false}
          datesSet={setRange}
          eventClick={({ event }) => setSelected(event)}
          eventClassNames={eventClass}
          noEventsContent="No calendar events in this date range."
        />
      </div>

      {selected && (
        <EventDetails
          event={selected}
          canReschedule={hasPermission("upcoming_services.update")}
          close={() => setSelected(null)}
          refreshed={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function EventDetails({ event, canReschedule, close, refreshed }) {
  const p = event.extendedProps;
  const [date, setDate] = useState(event.startStr?.slice(0, 10) || "");
  const [busy, setBusy] = useState(false);

  const reschedule = async () => {
    setBusy(true);
    try {
      await apiClient.request(`/service-records/${p.serviceRecordId}`, {
        method: "PATCH",
        body: JSON.stringify({ next_service_due: date }),
      });
      refreshed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 animate-fade-in" onClick={close}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-5 sm:p-6 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-heading font-bold text-foreground">{event.title}</h2>
            {p.status && <Badge variant="neutral" className="mt-2">{p.status}</Badge>}
          </div>
          <button onClick={close} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="border-t border-border">
          <DetailRow icon={Building2} label="Client" value={p.clientName} />
          <DetailRow icon={Wrench} label="Machine" value={[p.machineBrand, p.machineModel].filter(Boolean).join(" ") || null} />
          <DetailRow icon={CalendarIcon} label="Serial Number" value={p.serialNumber} />
          <DetailRow icon={Droplets} label="Refrigerant" value={p.refrigerantType} />
          <DetailRow icon={User2} label="Technician" value={p.technician} />
          <DetailRow icon={StickyNote} label="Notes" value={p.notes} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><a href={`/clients/${p.clientId}`}>View Client</a></Button>
          <Button asChild variant="outline" size="sm"><a href={`/machines/${p.machineId}`}>View Machine</a></Button>
          <Button asChild variant="outline" size="sm"><a href={`/service-records?record=${p.serviceRecordId}`}>View Service Record</a></Button>
        </div>

        {canReschedule && (
          <div className="mt-5 pt-4 border-t border-border">
            <Label className="text-xs text-muted-foreground">Reschedule</Label>
            <div className="flex gap-2 mt-1.5">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
              <Button onClick={reschedule} disabled={busy || !date} className="shrink-0">
                {busy ? "Saving…" : "Reschedule"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
