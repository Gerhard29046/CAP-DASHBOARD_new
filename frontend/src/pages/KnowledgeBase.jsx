import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Library, Plus, Search } from "lucide-react";

export default function KnowledgeBase() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiClient.request("/knowledge-machines")
      .then((data) => setItems(data || []))
      .catch((e) => console.error("Knowledge base load failed:", e))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => items.filter((x) =>
    JSON.stringify([x.manufacturer, x.model_name, x.variant, x.supported_refrigerants])
      .toLowerCase()
      .includes(search.toLowerCase())
  ), [items, search]);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Machine Knowledge Base"
        subtitle="Internal reference models and technical information."
        action={user?.role === "admin" && (
          <Link to="/knowledge-base/new">
            <Button className="gap-2"><Plus className="w-4 h-4" /> Add Machine</Button>
          </Link>
        )}
      />

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search manufacturer, model, variant, refrigerant…"
          className="pl-10 h-10"
        />
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Library}
          title={items.length === 0 ? "No reference machines yet" : "No results found"}
          description={
            items.length === 0
              ? "Add a machine to start building your internal technical reference."
              : "Try a different search term."
          }
          action={
            items.length === 0 && user?.role === "admin" && (
              <Link to="/knowledge-base/new">
                <Button><Plus className="w-4 h-4 mr-2" /> Add First Machine</Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-in">
          {filtered.map((x) => (
            <Link
              key={x.id}
              to={`/knowledge-base/${x.id}`}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all duration-200"
            >
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">{x.manufacturer}</p>
              <h2 className="text-lg font-heading font-bold text-foreground mt-1 leading-tight">
                {x.model_name} {x.variant}
              </h2>
              {x.product_code && <p className="text-xs text-muted-foreground mt-1">{x.product_code}</p>}
              {x.summary && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{x.summary}</p>}
              {x.supported_refrigerants?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-3">
                  {x.supported_refrigerants.map((r) => (
                    <Badge key={r} variant="neutral">{r}</Badge>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
