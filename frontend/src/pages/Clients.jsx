import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, Users, ChevronRight, ChevronUp, ChevronDown, Phone, Mail, Building2, X, Copy, ArrowLeft, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { apiClient } from "@/api/apiClient";
import { findDuplicateClientGroups } from "@/lib/customerImport";

// FIELD_META drives both the sortable/filterable column headers below AND the per-field
// filter inputs -- one source of truth so a header click and its matching filter input can
// never drift out of sync.
const FIELD_META = [
  { key: "company_name", label: "Client", placeholder: "Filter by name…" },
  { key: "contact_person", label: "Contact person", placeholder: "Filter by contact…" },
  { key: "phone", label: "Phone", placeholder: "Filter by phone…" },
  { key: "email", label: "Email", placeholder: "Filter by email…" },
  { key: "address", label: "Address", placeholder: "Filter by address…" },
];

const emptyFilters = { company_name: "", contact_person: "", phone: "", email: "", address: "" };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); // global, cross-field search
  const [fieldFilters, setFieldFilters] = useState(emptyFilters);
  const [sort, setSort] = useState({ key: "company_name", dir: "asc" });
  const [showDuplicates, setShowDuplicates] = useState(false);
  // Per-field filters live inline on desktop (unchanged) but move behind a "Filters" sheet on
  // phones -- 5 stacked full-width inputs permanently on screen was the biggest "doesn't feel
  // mobile" complaint on this page (explicit user feedback, 2026-08-19). Reuses the existing
  // Dialog primitive, which already renders as a bottom sheet below `sm:` (Phase 3 of the
  // mobile-first pass), so this is one new piece of state, not a new UI pattern.
  const [showFilterSheet, setShowFilterSheet] = useState(false);
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

  // Combinable filters (AND across fields), per explicit spec: "Name contains: Smith,
  // Address contains: Cape Town -> show only matching clients." Global `search` still works
  // across every field at once (unchanged behavior for anyone used to the old single box);
  // per-field filters narrow further on top of it, not instead of it.
  const filtered = useMemo(() => {
    const globalTerm = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (globalTerm) {
        const haystack = `${c.company_name || ""} ${c.contact_person || ""} ${c.phone || ""} ${c.email || ""} ${c.address || ""}`.toLowerCase();
        if (!haystack.includes(globalTerm)) return false;
      }
      for (const { key } of FIELD_META) {
        const term = fieldFilters[key].trim().toLowerCase();
        if (term && !String(c[key] || "").toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [clients, search, fieldFilters]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const av = String(a[sort.key] || "").toLowerCase();
      const bv = String(b[sort.key] || "").toLowerCase();
      const cmp = av.localeCompare(bv);
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, sort]);

  const activeFieldFilters = FIELD_META.filter((f) => fieldFilters[f.key].trim());
  const hasAnyFilter = Boolean(search.trim()) || activeFieldFilters.length > 0;

  const clearAllFilters = () => { setSearch(""); setFieldFilters(emptyFilters); };
  const clearFieldFilter = (key) => setFieldFilters((prev) => ({ ...prev, [key]: "" }));

  // Clicking a sortable column header sorts by that column; if it's already the active sort,
  // it flips direction. A dedicated filter input for the same field sits directly below the
  // header row (see the filter bar) so "click header -> filter/search by that property" and
  // sorting coexist without one hijacking the other's interaction.
  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  const duplicateGroups = useMemo(() => findDuplicateClientGroups(clients), [clients]);

  if (showDuplicates) {
    return <DuplicateReview groups={duplicateGroups} onBack={() => setShowDuplicates(false)} />;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Clients"
        subtitle={loading ? "Loading…" : `${clients.length} client${clients.length !== 1 ? "s" : ""}${hasAnyFilter ? ` · ${sorted.length} shown` : ""}`}
        action={
          <div className="flex gap-2">
            {duplicateGroups.length > 0 && (
              <Button variant="outline" onClick={() => setShowDuplicates(true)} className="gap-2">
                <Copy className="w-4 h-4" />
                <span className="hidden sm:inline">{duplicateGroups.length} Possible Duplicate{duplicateGroups.length !== 1 ? "s" : ""}</span>
                <span className="sm:hidden">{duplicateGroups.length} Dupes</span>
              </Button>
            )}
            <Button onClick={() => navigate("/clients/new")} className="gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Client</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search all fields…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        {/* Phones/tablets: filters live behind a sheet, not permanently stacked on screen. */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShowFilterSheet(true)}
          className="relative shrink-0 md:hidden"
          aria-label={`Filters${activeFieldFilters.length ? ` (${activeFieldFilters.length} active)` : ""}`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          {activeFieldFilters.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
              {activeFieldFilters.length}
            </span>
          )}
        </Button>
      </div>

      {/* Desktop/tablet: per-field filter bar stays inline and always visible (unchanged
          behavior, plenty of horizontal room). */}
      <div className="hidden md:flex flex-wrap gap-2 mb-3">
        {FIELD_META.map((f) => (
          <div key={f.key} className="relative w-44">
            <Input
              placeholder={f.placeholder}
              value={fieldFilters[f.key]}
              onChange={(e) => setFieldFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="h-8 text-xs pr-6"
            />
            {fieldFilters[f.key] && (
              <button
                type="button"
                onClick={() => clearFieldFilter(f.key)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={`Clear ${f.label} filter`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Phones/tablets: same per-field filters, presented as a bottom sheet opened via the
          Filters button above. */}
      <Dialog open={showFilterSheet} onOpenChange={setShowFilterSheet}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filter clients</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {FIELD_META.map((f) => (
              <div key={f.key}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{f.label}</label>
                <div className="relative">
                  <Input
                    placeholder={f.placeholder}
                    value={fieldFilters[f.key]}
                    onChange={(e) => setFieldFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="pr-8"
                  />
                  {fieldFilters[f.key] && (
                    <button
                      type="button"
                      onClick={() => clearFieldFilter(f.key)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={`Clear ${f.label} filter`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            {activeFieldFilters.length > 0 && (
              <Button type="button" variant="outline" onClick={() => setFieldFilters(emptyFilters)}>
                Clear filters
              </Button>
            )}
            <Button type="button" onClick={() => setShowFilterSheet(false)}>
              Show {sorted.length} result{sorted.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active-filter summary + clear-all -- "make it obvious which filters are currently
          active" / "provide a simple way to clear filters" (explicit spec). */}
      {hasAnyFilter && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4 text-xs">
          <span className="text-muted-foreground">Active filters:</span>
          {search.trim() && (
            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2 py-0.5">
              Search: "{search}"
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X className="w-3 h-3" /></button>
            </span>
          )}
          {activeFieldFilters.map((f) => (
            <span key={f.key} className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2 py-0.5">
              {f.label}: "{fieldFilters[f.key]}"
              <button type="button" onClick={() => clearFieldFilter(f.key)} aria-label={`Clear ${f.label} filter`}><X className="w-3 h-3" /></button>
            </span>
          ))}
          <button type="button" onClick={clearAllFilters} className="text-muted-foreground hover:text-foreground underline ml-1">
            Clear all
          </button>
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      )}

      {!loading && sorted.length === 0 && (
        <EmptyState
          icon={Users}
          title={clients.length === 0 ? "No clients yet" : "No results found"}
          description={
            clients.length === 0
              ? "Add your first client to start tracking their machines and service history."
              : "Try a different search term or clear your filters."
          }
          action={
            clients.length === 0 ? (
              <Button onClick={() => navigate("/clients/new")}>
                <Plus className="w-4 h-4 mr-2" /> Add First Client
              </Button>
            ) : hasAnyFilter ? (
              <Button variant="outline" onClick={clearAllFilters}>Clear all filters</Button>
            ) : null
          }
        />
      )}

      {!loading && sorted.length > 0 && (
        <>
          {/* Desktop: table, sortable/clickable headers. */}
          <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {FIELD_META.map((f) => (
                    <TableHead
                      key={f.key}
                      className={f.key === "company_name" ? "pl-5 cursor-pointer select-none" : "cursor-pointer select-none"}
                      onClick={() => toggleSort(f.key)}
                      title={`Sort by ${f.label}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {f.label}
                        {sort.key === f.key && (sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </span>
                    </TableHead>
                  ))}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((c) => (
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
                    <TableCell className="text-muted-foreground truncate max-w-[220px]">{c.address || "—"}</TableCell>
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
            {sorted.map((c) => (
              <Link
                key={c.id}
                to={`/clients/${c.id}`}
                className="block bg-card border border-border rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform duration-150"
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

// Dedicated review view for possible-duplicate clients (2026-08-17, Priority 3). Read-only --
// deletion happens on ClientDetail.jsx (already has a full confirm dialog, cascade-safe delete
// via migration 0027, and permission-gated via clients.delete/is_admin RLS). Deliberately does
// NOT reimplement delete logic here: the existing detail-page flow already satisfies "identify
// the exact client, show identifying info, warn, confirm, respect permissions" -- duplicating
// that here would be a second, divergent delete path for the same destructive action.
function DuplicateReview({ groups, onBack }) {
  return (
    <div className="max-w-4xl mx-auto">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Clients
      </button>
      <PageHeader
        title="Possible Duplicate Clients"
        subtitle={`${groups.length} group${groups.length !== 1 ? "s" : ""} found — review each before deleting anything`}
      />
      <p className="text-xs text-muted-foreground mb-4">
        Matched by the same signals the Customer Import wizard uses: matching customer code, matching email,
        matching phone number, or a similar name. Nothing is deleted automatically — open a client to review its
        machines/service history and delete it from there if it's genuinely a duplicate.
      </p>
      {groups.length === 0 ? (
        <EmptyState icon={Copy} title="No possible duplicates found" description="Every client currently has a distinct code, email, phone, and name." />
      ) : (
        <div className="space-y-3">
          {groups.map((group, i) => (
            <div key={i} className="bg-card border border-amber-500/30 rounded-xl p-4">
              <p className="text-xs font-medium text-amber-500 mb-2">{group.reason}</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {group.clients.map((c) => (
                  <Link
                    key={c.id}
                    to={`/clients/${c.id}`}
                    className="block bg-secondary/40 hover:bg-secondary/70 border border-border rounded-lg p-3 transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground truncate">{c.company_name || "Unnamed Client"}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{c.email || "no email"} · {c.phone || "no phone"}</p>
                    {c.legacy_pastel_customer_code && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Code: {c.legacy_pastel_customer_code}</p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
