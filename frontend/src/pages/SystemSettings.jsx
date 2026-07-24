import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_LABELS = {
  connected: { label: "Connected", tone: "text-foreground" },
  calendar_selection_required: { label: "Connected — calendar selection required", tone: "text-amber-500" },
  reauth_required: { label: "Token expired — reconnect required", tone: "text-destructive" },
  connection_error: { label: "Connection error", tone: "text-destructive" },
};

export default function SystemSettings() {
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [togglingDisplay, setTogglingDisplay] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const current = await apiClient.request("/google-calendar/status");
      setStatus(current);
      setCalendars(current.connected ? await apiClient.request("/google-calendar/calendars") : []);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("google_calendar");
    if (result === "connected") setMessage("Google Calendar connected successfully.");
    if (result === "error") setMessage("Google Calendar could not be connected. Please try again.");
    load();
  }, [load]);

  const connect = async () => {
    setConnecting(true);
    setMessage("");
    try {
      const response = await apiClient.request("/google-calendar/connect");
      if (!response.authorization_url) throw new Error("The server did not return a Google authorization URL.");
      window.location.assign(response.authorization_url);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setConnecting(false);
    }
  };

  const save = async () => {
    try {
      await apiClient.request("/google-calendar/calendars", {
        method: "PUT",
        body: JSON.stringify({ calendar_ids: calendars.filter((c) => c.selected).map((c) => c.id) }),
      });
      setMessage("Selected calendars saved.");
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const toggleDisplay = async (enabled) => {
    setTogglingDisplay(true);
    setMessage("");
    try {
      const updated = await apiClient.request("/google-calendar/display", {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      setStatus(updated);
      setMessage(enabled
        ? "Google Calendar events are now visible across the CAP Dashboard."
        : "Google Calendar events are now hidden from the CAP Dashboard. The connection is unaffected.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setTogglingDisplay(false);
    }
  };

  const disconnect = async () => {
    setConfirmingDisconnect(false);
    setDisconnecting(true);
    setMessage("");
    try {
      await apiClient.request("/google-calendar/disconnect", { method: "DELETE" });
      setMessage("Google Calendar disconnected.");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-muted-foreground">Manage secure external integrations.</p>
      </div>

      {message && <div className="rounded-xl border p-3 text-sm">{message}</div>}

      <section className="rounded-2xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-bold">Google Calendar</h2>

        {loading && <p>Loading connection status…</p>}

        {!loading && loadError && (
          <div className="space-y-3">
            <p className="text-destructive">{loadError}</p>
            <Button variant="outline" onClick={load}>Retry</Button>
          </div>
        )}

        {!loading && !loadError && !status?.connected && (
          <>
            <p>Google Calendar is not connected.</p>
            <p className="text-sm text-muted-foreground">
              Connect the authorised company Google account to display selected calendar events
              in the CAP Dashboard. The integration is read-only and will not change the Google
              Calendar.
            </p>
            {hasPermission("calendar.google.connect") && (
              <Button onClick={connect} disabled={connecting}>
                {connecting ? "Connecting…" : "Connect Google Calendar"}
              </Button>
            )}
          </>
        )}

        {!loading && !loadError && status?.connected && (
          <>
            <dl className="grid grid-cols-[160px_1fr] gap-2 text-sm">
              <dt>Connection Status</dt>
              <dd className={STATUS_LABELS[status.status]?.tone || ""}>
                {STATUS_LABELS[status.status]?.label || status.status}
              </dd>
              <dt>Account</dt>
              <dd>{status.account_name || "—"} ({status.account_email})</dd>
              <dt>Connection Date</dt>
              <dd>{status.connected_at || "—"}</dd>
              <dt>Last Refresh</dt>
              <dd>{status.last_refreshed_at || "Not refreshed yet"}</dd>
            </dl>

            {status.status === "reauth_required" && (
              <p className="text-destructive">
                Google's access token could not be refreshed. Click Replace Connection below to
                sign in again — your calendar selection will be kept.
              </p>
            )}
            {status.status === "connection_error" && (
              <p className="text-destructive">{status.last_error || "The last Google Calendar request failed. Please try again."}</p>
            )}
            {status.status === "calendar_selection_required" && (
              <p className="text-sm text-muted-foreground">
                No calendars are selected yet. Choose at least one calendar below and click
                Change Selected Calendars.
              </p>
            )}

            {hasPermission("calendar.google.connect") && (
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={status.display_enabled}
                  disabled={togglingDisplay}
                  onCheckedChange={toggleDisplay}
                />
                Show connected Google Calendar across the CAP Dashboard
              </label>
            )}
            {!status.display_enabled && (
              <p className="text-sm text-muted-foreground">
                The connection is active, but Google events are currently hidden from all users.
              </p>
            )}

            <div className="space-y-2">
              {calendars.length === 0 && status.status !== "reauth_required" && status.status !== "connection_error" && (
                <p className="text-sm text-muted-foreground">No Google calendars were found on this account.</p>
              )}
              {calendars.map((calendar, index) => (
                <label className="flex items-center gap-2" key={calendar.id}>
                  <Checkbox
                    checked={calendar.selected}
                    onCheckedChange={(value) =>
                      setCalendars(calendars.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, selected: !!value } : item))}
                  />
                  {calendar.color && (
                    <span
                      className="inline-block h-3 w-3 rounded-full border"
                      style={{ backgroundColor: calendar.color }}
                    />
                  )}
                  <span>{calendar.name}{calendar.primary ? " (Primary)" : ""}</span>
                  <span className="text-xs text-muted-foreground">{calendar.id}</span>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {hasPermission("calendar.google.calendars.select") && (
                <Button onClick={save}>Change Selected Calendars</Button>
              )}
              {hasPermission("calendar.google.connect") && (
                <Button variant="outline" onClick={connect} disabled={connecting}>
                  {connecting ? "Connecting…" : "Replace Connection"}
                </Button>
              )}
              {hasPermission("calendar.google.disconnect") && (
                <Button
                  variant="destructive"
                  onClick={() => setConfirmingDisconnect(true)}
                  disabled={disconnecting}
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </Button>
              )}
            </div>
          </>
        )}
      </section>

      <AlertDialog open={confirmingDisconnect} onOpenChange={setConfirmingDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Google Calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              This revokes CAP Dashboard's access to the connected Google account, clears the
              stored connection and calendar selection, and immediately stops Google events from
              being shown to any user. Normal CAP upcoming services and service records are not
              affected. You will need to reconnect and reselect calendars to restore this
              integration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={disconnect}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
