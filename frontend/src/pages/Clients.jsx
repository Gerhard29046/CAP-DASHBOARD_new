import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, Users, ChevronRight, Phone, Mail, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { apiClient } from "@/api/apiClient";

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await apiClient.entities.Client.list();
      setClients(data);
    } catch (error) {
      console.error("Clients load failed:", error);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = clients.filter((c) =>
    c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_person?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Clients"
        subtitle={loading ? "Loading…" : `${clients.length} client${clients.length !== 1 ? "s" : ""}`}
        action={
          <Button onClick={() => navigate("/clients/new")} className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Client</span>
            <span className="sm:hidden">Add</span>
          </Button>
        }
      />

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by name, contact or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-10"
        />
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={Users}
          title={clients.length === 0 ? "No clients yet" : "No results found"}
          description={
            clients.length === 0
              ? "Add your first client to start tracking their machines and service history."
              : "Try a different search term."
          }
          action={
            clients.length === 0 && (
              <Button onClick={() => navigate("/clients/new")}>
                <Plus className="w-4 h-4 mr-2" /> Add First Client
              </Button>
            )
          }
        />
      )}

      {!loading && filtered.length > 0 && (
        <>
          {/* Desktop: table -- makes company name the strongest column, secondary
              contact info visually quieter, per the redesign brief. */}
          <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Client</TableHead>
                  <TableHead>Contact person</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/clients/${c.id}`)}
                  >
                    <TableCell className="pl-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-medium text-foreground">
                          {c.company_name || c.name || "Unnamed Client"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.contact_person || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[220px]">{c.email || "—"}</TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: card list, not a squeezed table. */}
          <div className="md:hidden space-y-2.5 stagger-in">
            {filtered.map((c) => (
              <Link
                key={c.id}
                to={`/clients/${c.id}`}
                className="block bg-card border border-border rounded-xl p-4 active:scale-[0.99] transition-transform duration-150"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-foreground truncate">
                        {c.company_name || c.name || "Unnamed Client"}
                      </p>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                    {c.contact_person && (
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{c.contact_person}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      {c.phone && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="w-3 h-3" /> {c.phone}
                        </span>
                      )}
                      {c.email && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate">
                          <Mail className="w-3 h-3 shrink-0" /> {c.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
