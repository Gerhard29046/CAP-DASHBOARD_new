const test = require("node:test");
const assert = require("node:assert/strict");
const {
  safeStatus,
  validateDateRange,
  validateCalendarIds,
  collectCalendarEventsForCalendars,
} = require("../index");

// --- safeStatus (disconnected status) ---------------------------------

test("safeStatus: null connection returns disconnected defaults without throwing", () => {
  const result = safeStatus(null);
  assert.deepEqual(result, {
    connected: false,
    requires_reconnection: false,
    account_name: null,
    account_email: null,
    connected_at: null,
    last_refreshed_at: null,
    selected_calendars: [],
    last_error: null,
  });
});

test("safeStatus: connected connection reflects its fields", () => {
  const result = safeStatus({
    isActive: true,
    googleAccountName: "Jane Doe",
    googleAccountEmail: "jane@example.com",
    selectedCalendarIds: ["cal-1"],
    lastError: null,
  });
  assert.equal(result.connected, true);
  assert.equal(result.account_name, "Jane Doe");
  assert.equal(result.account_email, "jane@example.com");
  assert.deepEqual(result.selected_calendars, ["cal-1"]);
});

test("safeStatus: connection with lastError requires reconnection", () => {
  const result = safeStatus({ lastError: "Google Calendar must be reconnected." });
  assert.equal(result.requires_reconnection, true);
  assert.equal(result.last_error, "Google Calendar must be reconnected.");
});

// --- validateDateRange --------------------------------------------------

test("validateDateRange: rejects missing start", () => {
  const result = validateDateRange(undefined, "2026-01-01");
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("validateDateRange: rejects missing end", () => {
  const result = validateDateRange("2026-01-01", undefined);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("validateDateRange: rejects unparseable dates", () => {
  const result = validateDateRange("not-a-date", "2026-01-01");
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("validateDateRange: rejects end <= start", () => {
  const result = validateDateRange("2026-01-10", "2026-01-01");
  assert.equal(result.ok, false);
  assert.match(result.message, /end must be after start/);
});

test("validateDateRange: rejects end === start", () => {
  const result = validateDateRange("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
  assert.equal(result.ok, false);
});

test("validateDateRange: rejects a range over 370 days", () => {
  const result = validateDateRange("2026-01-01", "2027-02-01");
  assert.equal(result.ok, false);
  assert.match(result.message, /370 days/);
});

test("validateDateRange: accepts a valid range", () => {
  const result = validateDateRange("2026-01-01", "2026-01-31");
  assert.equal(result.ok, true);
  assert.ok(result.startDate instanceof Date);
  assert.ok(result.endDate instanceof Date);
});

// --- validateCalendarIds -------------------------------------------------

test("validateCalendarIds: rejects non-array", () => {
  assert.equal(validateCalendarIds("cal-1").ok, false);
  assert.equal(validateCalendarIds(undefined).ok, false);
  assert.equal(validateCalendarIds({}).ok, false);
});

test("validateCalendarIds: rejects array containing a non-string", () => {
  const result = validateCalendarIds(["cal-1", 42]);
  assert.equal(result.ok, false);
});

test("validateCalendarIds: rejects an empty string entry", () => {
  const result = validateCalendarIds(["cal-1", ""]);
  assert.equal(result.ok, false);
});

test("validateCalendarIds: rejects a string longer than 1024 chars", () => {
  const result = validateCalendarIds(["a".repeat(1025)]);
  assert.equal(result.ok, false);
});

test("validateCalendarIds: accepts a string exactly 1024 chars", () => {
  const result = validateCalendarIds(["a".repeat(1024)]);
  assert.equal(result.ok, true);
});

test("validateCalendarIds: rejects more than 50 ids", () => {
  const ids = Array.from({ length: 51 }, (_, i) => `cal-${i}`);
  const result = validateCalendarIds(ids);
  assert.equal(result.ok, false);
  assert.match(result.message, /No more than 50/);
});

test("validateCalendarIds: accepts exactly 50 ids", () => {
  const ids = Array.from({ length: 50 }, (_, i) => `cal-${i}`);
  const result = validateCalendarIds(ids);
  assert.equal(result.ok, true);
});

test("validateCalendarIds: accepts a valid array of 1-50 non-empty strings", () => {
  const result = validateCalendarIds(["cal-1", "cal-2"]);
  assert.deepEqual(result, { ok: true, calendarIds: ["cal-1", "cal-2"] });
});

// --- collectCalendarEventsForCalendars (Google API failure -> warning, ---
// --- other calendars still processed) ------------------------------------

test("collectCalendarEventsForCalendars: a failing calendar produces a warning without breaking the others", async () => {
  const fetchCalendarEvents = async (calendarId) => {
    if (calendarId === "bad-calendar") {
      throw new Error("Google API failure");
    }
    return [{ id: `event-${calendarId}` }];
  };

  const { events, warnings } = await collectCalendarEventsForCalendars(
    ["good-calendar-1", "bad-calendar", "good-calendar-2"],
    fetchCalendarEvents,
  );

  assert.deepEqual(events, [{ id: "event-good-calendar-1" }, { id: "event-good-calendar-2" }]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /could not be loaded/);
});

test("collectCalendarEventsForCalendars: no failures produces no warnings", async () => {
  const fetchCalendarEvents = async (calendarId) => [{ id: `event-${calendarId}` }];
  const { events, warnings } = await collectCalendarEventsForCalendars(["cal-1", "cal-2"], fetchCalendarEvents);
  assert.equal(events.length, 2);
  assert.deepEqual(warnings, []);
});

test("collectCalendarEventsForCalendars: all calendars failing yields no events and one warning per calendar", async () => {
  const fetchCalendarEvents = async () => {
    throw new Error("Google API failure");
  };
  const { events, warnings } = await collectCalendarEventsForCalendars(["cal-1", "cal-2"], fetchCalendarEvents);
  assert.deepEqual(events, []);
  assert.equal(warnings.length, 2);
});
