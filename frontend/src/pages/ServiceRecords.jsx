import React, { useEffect, useMemo, useState } from "react";
import {
  Search, ClipboardCheck, Calendar, Building2, Wrench, Camera, X, CheckCircle2, ChevronRight,
} from "lucide-react";
import { apiClient } from "@/api/apiClient";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import RecordPhotoGallery from "@/components/RecordPhotoGallery";

function formatDate(date) {
  if (!date) return "Not set";
  return new Date(date).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function getClient(record) {
  return record.machine?.client || null;
}

function getPhotos(record) {
  return record.photos || record.service_photos || [];
}

export default function ServiceRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useEffect(() => { loadRecords(); }, []);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const data = await apiClient.entities.ServiceRecord.list();
      setRecords(data || []);
      if (data?.length > 0) setSelectedRecord(data[0]);
    } catch (error) {
      console.error("Failed to load service records:", error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    return {
      total: records.length,
      thisMonth: records.filter((r) => {
        if (!r.service_date) return false;
        const d = new Date(r.service_date);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      }).length,
      withPhotos: records.filter((r) => getPhotos(r).length > 0).length,
      nextDue: records.filter((r) => r.next_service_due).length,
    };
  }, [records]);

  const filteredRecords = useMemo(() => records.filter((record) => {
    const client = getClient(record);
    const text = [
      client?.company_name, client?.name, client?.phone,
      record.machine?.brand, record.machine?.model, record.machine?.serial_number,
      record.machine?.refrigerant_type, record.technician_name,
      record.work_performed, record.findings, record.notes,
    ].filter(Boolean).join(" ").toLowerCase();
    return text.includes(search.toLowerCase());
  }), [records, search]);

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        title="Service Records"
        subtitle="Completed on-site services performed at client premises."
        action={
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, machine, technician…"
              className="pl-10 h-10"
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 stagger-in">
        <StatCard label="Total Services" value={stats.total} icon={ClipboardCheck} accent="primary" />
        <StatCard label="This Month" value={stats.thisMonth} icon={Calendar} accent="success" />
        <StatCard label="With Photos" value={stats.withPhotos} icon={Camera} accent="info" />
        <StatCard label="Next Due Set" value={stats.nextDue} icon={CheckCircle2} accent="warning" />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-heading font-semibold text-foreground text-sm">Completed Services</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading ? "Loading…" : `${filteredRecords.length} record${filteredRecords.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : filteredRecords.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="No service records found" description="Completed on-site services will appear here." />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Client</TableHead>
                      <TableHead>Machine</TableHead>
                      <TableHead>Service Date</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead>Photos</TableHead>
                      <TableHead className="w-10" aria-label="Opens details" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record) => {
                      const client = getClient(record);
                      const photos = getPhotos(record);
                      return (
                        <TableRow
                          key={record.id}
                          onClick={() => setSelectedRecord(record)}
                          aria-label={`View details for ${client?.company_name || client?.name || "this service record"}`}
                          className={`cursor-pointer ${selectedRecord?.id === record.id ? "bg-primary/5" : ""}`}
                        >
                          <TableCell className="pl-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <Building2 className="w-4 h-4 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate">{client?.company_name || client?.name || "Unknown Client"}</p>
                                {client?.phone && <p className="text-xs text-muted-foreground truncate">{client.phone}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-foreground">{[record.machine?.brand, record.machine?.model].filter(Boolean).join(" ") || "Unknown Machine"}</p>
                            {record.machine?.serial_number && <p className="text-xs text-muted-foreground mt-0.5">{record.machine.serial_number}</p>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(record.service_date)}</TableCell>
                          <TableCell className="text-muted-foreground">{record.technician_name || "Not recorded"}</TableCell>
                          <TableCell>
                            {photos.length > 0 ? (
                              <Badge variant="info" className="gap-1"><Camera className="w-3 h-3" />{photos.length}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {/* Decorative only -- the whole row (onClick above) is the
                                click target, matching every other list in the app. */}
                            <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card list */}
              <div className="lg:hidden divide-y divide-border">
                {filteredRecords.map((record) => {
                  const client = getClient(record);
                  const photos = getPhotos(record);
                  return (
                    <button
                      key={record.id}
                      onClick={() => setSelectedRecord(record)}
                      aria-label={`View details for ${client?.company_name || client?.name || "this service record"}`}
                      className={`w-full text-left flex items-start gap-3 p-4 transition-colors duration-150 ${selectedRecord?.id === record.id ? "bg-primary/5" : "active:bg-secondary/60"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground text-sm truncate">{client?.company_name || client?.name || "Unknown Client"}</span>
                          {photos.length > 0 && <Badge variant="info" className="gap-1 shrink-0"><Camera className="w-3 h-3" />{photos.length}</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          {[record.machine?.brand, record.machine?.model].filter(Boolean).join(" ") || "Unknown Machine"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(record.service_date)}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <ServiceDetailPanel record={selectedRecord} onPhotoClick={setSelectedPhoto} />
      </div>

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6 animate-fade-in"
          onClick={() => setSelectedPhoto(null)}
        >
          <button className="absolute top-5 right-5 text-white">
            <X className="w-7 h-7" />
          </button>
          <img src={selectedPhoto} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

function ServiceDetailPanel({ record, onPhotoClick }) {
  if (!record) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <p className="text-sm text-muted-foreground">Select a service record to view details.</p>
      </div>
    );
  }

  const client = getClient(record);
  const photos = getPhotos(record);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="text-lg font-heading font-bold text-foreground">Service Record</h2>
        <p className="text-sm text-muted-foreground mt-1">{formatDate(record.service_date)}</p>
      </div>

      <div className="p-5 space-y-6">
        <DetailSection icon={Building2} title="Client">
          <p className="font-medium text-foreground">{client?.company_name || client?.name || "Unknown Client"}</p>
          {client?.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
          {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
        </DetailSection>

        <DetailSection icon={Wrench} title="Machine">
          <p className="font-medium text-foreground">{[record.machine?.brand, record.machine?.model].filter(Boolean).join(" ") || "Unknown Machine"}</p>
          <InfoRow label="Serial Number" value={record.machine?.serial_number} />
          <InfoRow label="Refrigerant" value={record.machine?.refrigerant_type} />
        </DetailSection>

        <DetailSection icon={ClipboardCheck} title="Service Details">
          <InfoRow label="Technician" value={record.technician_name} />
          <InfoRow label="Next Service Due" value={formatDate(record.next_service_due)} />
          <TextBlock title="Work Performed" value={record.work_performed} />
          <TextBlock title="Findings" value={record.findings} />
          <TextBlock title="Recommendations" value={record.notes} />
        </DetailSection>

        <DetailSection icon={Camera} title="Photos">
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos uploaded for this service.</p>
          ) : (
            <RecordPhotoGallery
              photos={photos}
              onPhotoClick={onPhotoClick}
              containerClassName="grid grid-cols-3 gap-2"
              itemClassName="aspect-square rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors duration-150"
              imgClassName="w-full h-full object-cover"
            />
          )}
        </DetailSection>
      </div>
    </div>
  );
}

function DetailSection({ icon: Icon, title, children }) {
  return (
    <div className="border-b border-border pb-5 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-heading font-semibold text-foreground text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value || "—"}</span>
    </div>
  );
}

function TextBlock({ title, value }) {
  return (
    <div className="mt-3">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{value || "Not recorded."}</p>
    </div>
  );
}
