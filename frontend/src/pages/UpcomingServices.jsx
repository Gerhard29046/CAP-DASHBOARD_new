import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight, AlertTriangle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

export default function UpcomingServices() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [services, machines, clients] = await Promise.all([
        apiClient.entities.ServiceRecord.list("-next_service_date", 200),
        apiClient.entities.Machine.list(),
        apiClient.entities.Client.list(),
      ]);

      const machineMap = {};
      machines.forEach(m => { machineMap[m.id] = m; });
      const clientMap = {};
      clients.forEach(c => { clientMap[c.id] = c; });

      const today = moment().format("YYYY-MM-DD");

      const upcoming = services
        .filter(s => s.next_service_date && s.next_service_date >= today)
        .sort((a, b) => a.next_service_date.localeCompare(b.next_service_date))
        .map(s => {
          const machine = machineMap[s.machine_id];
          const client = machine ? clientMap[machine.client_id] : null;
          return { ...s, machine, client };
        });

      const overdue = services
        .filter(s => s.next_service_date && s.next_service_date < today)
        .sort((a, b) => a.next_service_date.localeCompare(b.next_service_date))
        .map(s => {
          const machine = machineMap[s.machine_id];
          const client = machine ? clientMap[machine.client_id] : null;
          return { ...s, machine, client, overdue: true };
        });

      setItems([...overdue, ...upcoming]);
      setLoading(false);
    }
    load();
  }, []);

  const notifyWhatsApp = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    if (!item.client?.phone) return;

    const msg = encodeURIComponent(
`Dear ${item.client.contact_person || "Valued Customer"},

This is a friendly reminder from Connoisseur Auto that your annual service is now due.

Machine:
${item.machine?.brand || ""} ${item.machine?.model || ""}
Serial Number: ${item.machine?.serial_number || "N/A"}

Scheduled Service Date:
${moment(item.next_service_date).format("MMMM D, YYYY")}

Regular servicing helps ensure your equipment continues to operate accurately, reliably and efficiently while reducing the risk of unexpected breakdowns.

Please reply to this message or contact us to arrange a convenient booking date.

Kind regards,

Connoisseur Auto
Automotive Air Conditioning Equipment Specialists`
);

    const phone = item.client.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-foreground">Upcoming Services</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{items.length} scheduled service{items.length !== 1 ? "s" : ""}</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CalendarClock className="w-12 h-12 text-muted-foreground mb-3" />
          <p className="font-medium text-foreground mb-1">No upcoming services</p>
          <p className="text-sm text-muted-foreground">When you add service records with a next service date, they'll appear here</p>
        </div>
      ) : (
        <div className="space-y-3 pb-6">
          {items.map(s => {
            const daysUntil = moment(s.next_service_date).diff(moment(), "days");
            const isOverdue = s.overdue;
            const isSoon = !isOverdue && daysUntil <= 7;

            return (
              <div key={s.id} className="bg-card rounded-2xl border border-border p-4 hover:border-primary/40 transition-colors group">
                <Link to={`/machines/${s.machine_id}`} className="block">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground truncate">
                          {s.machine ? `${s.machine.brand} ${s.machine.model}` : "Machine"}
                        </span>
                        {isOverdue && (
                          <span className="flex items-center gap-1 text-xs bg-destructive/15 text-red-400 px-2 py-0.5 rounded-full shrink-0">
                            <AlertTriangle className="w-3 h-3" /> Overdue
                          </span>
                        )}
                        {isSoon && (
                          <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full shrink-0">
                            Due Soon
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {s.client?.company_name || "—"}
                      </p>
                      <p className="text-xs text-primary mt-1">
                        {moment(s.next_service_date).format("MMM D, YYYY")}
                        {!isOverdue && ` · in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`}
                        {isOverdue && ` · ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? "s" : ""} overdue`}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground shrink-0 mt-1 ml-2" />
                  </div>
                </Link>

                {/* WhatsApp button */}
                {s.client?.phone && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-9 rounded-xl text-xs gap-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                      onClick={(e) => notifyWhatsApp(e, s)}
                    >
                      <MessageCircle className="w-4 h-4" /> Notify via WhatsApp
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}