const test = require("node:test");
const assert = require("node:assert/strict");
const { mapGoogleEventToFullCalendar } = require("../lib/googleCalendarService");

test("mapGoogleEventToFullCalendar: maps a timed event to the exact FullCalendar shape", () => {
  const rawEvent = {
    id: "event-123",
    summary: "Client site visit",
    start: { dateTime: "2026-08-01T09:00:00+02:00" },
    end: { dateTime: "2026-08-01T10:00:00+02:00" },
    location: "123 Main St",
    description: "Quarterly service",
    organizer: { displayName: "Jane Doe", email: "jane@example.com" },
    htmlLink: "https://calendar.google.com/event?eid=abc",
  };

  const result = mapGoogleEventToFullCalendar(rawEvent, "primary", "My Calendar");

  assert.match(result.id, /^google-[0-9a-f]{40}$/);
  assert.deepEqual(result, {
    id: result.id,
    title: "Client site visit",
    start: "2026-08-01T09:00:00+02:00",
    end: "2026-08-01T10:00:00+02:00",
    allDay: false,
    editable: false,
    extendedProps: {
      sourceType: "google_calendar",
      calendarId: "primary",
      calendarName: "My Calendar",
      location: "123 Main St",
      description: "Quarterly service",
      organiser: "Jane Doe",
      htmlLink: "https://calendar.google.com/event?eid=abc",
    },
  });
});

test("mapGoogleEventToFullCalendar: all-day (date-only) event has allDay true", () => {
  const rawEvent = {
    id: "event-456",
    summary: "Public holiday",
    start: { date: "2026-12-25" },
    end: { date: "2026-12-26" },
  };

  const result = mapGoogleEventToFullCalendar(rawEvent, "cal-2", "Holidays");

  assert.equal(result.allDay, true);
  assert.equal(result.start, "2026-12-25");
  assert.equal(result.end, "2026-12-26");
});

test("mapGoogleEventToFullCalendar: organiser falls back to email when displayName is absent", () => {
  const rawEvent = {
    id: "event-789",
    summary: "Untitled organiser event",
    start: { dateTime: "2026-08-01T09:00:00Z" },
    end: { dateTime: "2026-08-01T10:00:00Z" },
    organizer: { email: "organiser@example.com" },
  };

  const result = mapGoogleEventToFullCalendar(rawEvent, "cal-3", "Calendar 3");
  assert.equal(result.extendedProps.organiser, "organiser@example.com");
});

test("mapGoogleEventToFullCalendar: missing summary/organizer/location/description default sensibly", () => {
  const rawEvent = {
    id: "event-000",
    start: { dateTime: "2026-08-01T09:00:00Z" },
    end: { dateTime: "2026-08-01T10:00:00Z" },
  };

  const result = mapGoogleEventToFullCalendar(rawEvent, "cal-4", null);
  assert.equal(result.title, "(Untitled event)");
  assert.equal(result.extendedProps.calendarName, "cal-4");
  assert.equal(result.extendedProps.location, null);
  assert.equal(result.extendedProps.description, null);
  assert.equal(result.extendedProps.organiser, null);
  assert.equal(result.extendedProps.htmlLink, null);
});

test("mapGoogleEventToFullCalendar: id is stable for the same calendarId/eventId pair", () => {
  const rawEvent = { id: "event-abc", start: { date: "2026-01-01" }, end: { date: "2026-01-02" } };
  const first = mapGoogleEventToFullCalendar(rawEvent, "cal-1", "Cal 1");
  const second = mapGoogleEventToFullCalendar(rawEvent, "cal-1", "Cal 1");
  assert.equal(first.id, second.id);
});
