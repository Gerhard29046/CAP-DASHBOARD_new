import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, Users, ChevronRight, Phone, User2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    base44.entities.Client.list("-created_date").then(data => {
      setClients(data);
      setLoading(false);
    });
  }, []);

  const filtered = clients.filter(c =>
    c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_person?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Loading…" : `${clients.length} client${clients.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button
          onClick={() => navigate("/clients/new")}
          className="rounded-xl h-10 px-4 gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Client</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by name, contact or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 h-11 rounded-xl bg-secondary/50 border-border focus:bg-card"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-heading font-semibold text-foreground text-lg mb-1">
            {clients.length === 0 ? "No clients yet" : "No results found"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs mb-5">
            {clients.length === 0
              ? "Add your first client to start managing sites and machines."
              : "Try a different search term."}
          </p>
          {clients.length === 0 && (
            <Button onClick={() => navigate("/clients/new")} className="rounded-xl">
              <Plus className="w-4 h-4 mr-2" /> Add First Client
            </Button>
          )}
        </div>
      )}

      {/* Client cards */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(c => (
            <Link
              key={c.id}
              to={`/clients/${c.id}`}
              className="block bg-card border border-border rounded-2xl p-4 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all group"
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-foreground truncate">{c.company_name}</p>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                  </div>

                  {c.contact_person && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <User2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <p className="text-sm text-muted-foreground truncate">{c.contact_person}</p>
                    </div>
                  )}

                  {c.phone && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <p className="text-sm text-muted-foreground">{c.phone}</p>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}