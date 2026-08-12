import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { RefreshCw, X } from "lucide-react";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="space-y-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Upcoming Services.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading…" : "Refresh Calendar"}
        </Button>
      </div>

      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</div>}
      {warnings.map((w) => <div key={w} className="rounded-xl border bg-muted p-3 text-sm">{w}</div>)}

      <div className="relative min-h-[650px] rounded-2xl border bg-card p-3 md:p-5">
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between gap-3">
          <h2 className="text-xl font-bold">{event.title}</h2>
          <button onClick={close}><X /></button>
        </div>
        <dl className="mt-5 grid grid-cols-[130px_1fr] gap-2 text-sm">
          <dt>Client</dt><dd>{p.clientName}</dd>
          <dt>Machine</dt><dd>{[p.machineBrand, p.machineModel].filter(Boolean).join(" ")}</dd>
          <dt>Serial Number</dt><dd>{p.serialNumber || "—"}</dd>
          <dt>Refrigerant</dt><dd>{p.refrigerantType || "—"}</dd>
          <dt>Technician</dt><dd>{p.technician || "—"}</dd>
          <dt>Status</dt><dd>{p.status}</dd>
          <dt>Notes</dt><dd>{p.notes || "—"}</dd>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild variant="outline"><a href={`/clients/${p.clientId}`}>View Client</a></Button>
          <Button asChild variant="outline"><a href={`/machines/${p.machineId}`}>View Machine</a></Button>
          <Button asChild variant="outline"><a href={`/service-records?record=${p.serviceRecordId}`}>View Service Record</a></Button>
        </div>
        {canReschedule && (
          <div className="mt-5 flex gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Button onClick={reschedule} disabled={busy || !date}>Reschedule Service</Button>
          </div>
        )}
      </div>
    </div>
  );
}
