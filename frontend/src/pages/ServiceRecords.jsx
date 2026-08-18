import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search, ClipboardCheck, Calendar, Building2, Wrench, Camera, X, CheckCircle2, ChevronRight,
  Award, Loader2, Eye, Download, RefreshCw,
} from "lucide-react";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import RecordPhotoGallery from "@/components/RecordPhotoGallery";
import { buildServiceCertificatePdf } from "@/lib/serviceCertificatePdf";
import { getRecordPhotoSignedUrl, uploadServiceCertificate, getServiceCertificateSignedUrl } from "@/services/supabase/storage";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkId = searchParams.get("id");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useEffect(() => { loadRecords(); }, []);

  // Deep-link support: MachineDetail's "Service History" rows link here as
  // `/service-records?id=<serviceRecordId>` so a specific service can be opened directly
  // (including its certificate) instead of only being reachable via Edit. Re-run whenever the
  // records list or the id param changes, since the initial load's own `enriched[0]` default
  // selection races with this on first mount.
  useEffect(() => {
    if (!deepLinkId || records.length === 0) return;
    const match = records.find((r) => r.id === deepLinkId);
    if (match) setSelectedRecord(match);
  }, [deepLinkId, records]);

  const selectRecord = (record) => {
    setSelectedRecord(record);
    setSearchParams(record ? { id: record.id } : {}, { replace: true });
  };

  const loadRecords = async () => {
    setLoading(true);
    try {
      // BUGFIX (2026-08-17, found while building the Service Certificate feature):
      // apiClient.entities.ServiceRecord.list() is a plain `select * from service_records`
      // (makeEntity()/listRows() in supabaseApiClient.js/database.js do no join) -- it has
      // never actually returned a nested `.machine`/`.machine.client`, even though
      // getClient()/the whole detail panel below always assumed it did. In production this
      // meant every row silently showed "Unknown Client" and blank machine/contact details.
      // Fetching machines+clients alongside and joining them client-side here, matching the
      // same enrich pattern already used by Dashboard.jsx/InvoiceQueue.jsx for the identical
      // shape of join.
      const [records, machines, clients] = await Promise.all([
        apiClient.entities.ServiceRecord.list(),
        apiClient.entities.Machine.list(),
        apiClient.entities.Client.list(),
      ]);
      const machineMap = Object.fromEntries((machines || []).map((m) => [m.id, m]));
      const clientMap = Object.fromEntries((clients || []).map((c) => [c.id, c]));
      const enriched = (records || []).map((r) => {
        const machine = machineMap[r.machine_id];
        return { ...r, machine: machine ? { ...machine, client: clientMap[machine.client_id] || null } : null };
      });
      setRecords(enriched);
      // Skip the default "first record" selection when arriving via a deep link (see the
      // deepLinkId effect above) -- it would otherwise flash record[0] before the intended
      // record takes over a render later.
      if (!deepLinkId && enriched.length > 0) setSelectedRecord(enriched[0]);
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
                          onClick={() => selectRecord(record)}
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
                      onClick={() => selectRecord(record)}
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

        <DetailSection icon={Award} title="Service Certificate">
          <CertificateSection record={record} client={client} photos={photos} />
        </DetailSection>
      </div>
    </div>
  );
}

// Batch A of the certificate/email workflow (2026-08-17, explicit user request). Every row
// on this page is, by this page's own definition ("Completed Services" / "Completed on-site
// services performed at client premises"), already a completed service -- service_records
// has no draft/in-progress concept anywhere in the real data model (confirmed: no page reads
// or filters on its `status` column at all; a record is only ever created, via
// LogServiceModal.jsx, once the technician has already filled in service_date/
// work_performed). So the certificate action is available for every record here, matching
// "do not make the certificate action available for an incomplete service unless there is an
// explicit reason to do so" -- there is no incomplete state to exclude.
function CertificateSection({ record, client, photos }) {
  const { hasPermission } = useAuth();
  const canGenerate = hasPermission("services.edit");
  const canView = hasPermission("services.view");

  const [certificate, setCertificate] = useState(null);
  const [loadingCert, setLoadingCert] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(photos.length > 0);
  const [generating, setGenerating] = useState(false);
  const [busyAction, setBusyAction] = useState(null); // "preview" | "download" | null
  const [error, setError] = useState("");
  // Kept only for the certificate just generated in THIS session -- lets Preview/Download
  // work instantly without a Storage round-trip. Cleared whenever the selected record
  // changes; a certificate generated in an earlier session is always re-fetched via a fresh
  // signed URL instead (see openCertificate() below).
  const [freshBlobUrl, setFreshBlobUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setFreshBlobUrl(null);
    setIncludePhotos(photos.length > 0);
    setLoadingCert(true);
    apiClient.entities.ServiceCertificate.getForServiceRecord(record.id)
      .then((row) => { if (!cancelled) setCertificate(row); })
      .catch((e) => { console.error("Failed to load certificate status:", e); if (!cancelled) setCertificate(null); })
      .finally(() => { if (!cancelled) setLoadingCert(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `photos` is derived fresh from
    // `record` on every render (getPhotos()), re-running on its reference would refetch on
    // every render; `record.id` is the real, stable trigger.
  }, [record.id]);

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const [certRow, company] = await Promise.all([
        apiClient.entities.ServiceCertificate.generate(record.id, includePhotos),
        apiClient.entities.CompanySettings.get(),
      ]);

      let photoUrls = [];
      if (includePhotos && photos.length > 0) {
        photoUrls = (await Promise.all(photos.map(async (path) => {
          try { return await getRecordPhotoSignedUrl(path); } catch { return null; }
        }))).filter(Boolean);
      }

      const blob = await buildServiceCertificatePdf({
        certificateNumber: certRow.certificate_number,
        serviceRecord: record,
        machine: record.machine,
        client,
        company,
        photoUrls,
        includePhotos,
        generatedAt: new Date(certRow.generated_at || Date.now()),
      });

      const pdfPath = await uploadServiceCertificate(record.id, certRow.certificate_number, blob);
      const updated = await apiClient.entities.ServiceCertificate.setPdfPath(certRow.id, pdfPath);

      setCertificate(updated);
      setFreshBlobUrl(URL.createObjectURL(blob));
    } catch (e) {
      console.error("Failed to generate service certificate:", e);
      setError(e.message || "Could not generate the certificate.");
    } finally {
      setGenerating(false);
    }
  };

  const openCertificate = async (mode) => {
    setBusyAction(mode);
    setError("");
    try {
      let url = freshBlobUrl;
      if (!url) {
        url = await getServiceCertificateSignedUrl(certificate.pdf_path);
      }
      if (mode === "preview") {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${certificate.certificate_number}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e) {
      console.error(`Failed to ${mode} certificate:`, e);
      setError(e.message || `Could not ${mode} the certificate.`);
    } finally {
      setBusyAction(null);
    }
  };

  if (!canView) {
    return <p className="text-sm text-muted-foreground">You do not have permission to view service certificates.</p>;
  }

  if (loadingCert) {
    return <Skeleton className="h-24 rounded-lg" />;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {certificate ? (
        <div className="rounded-lg border border-border bg-secondary/40 p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Certificate Generated</p>
          </div>
          <p className="text-sm text-foreground font-mono">{certificate.certificate_number}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generated {formatDate(certificate.generated_at)}
            {!certificate.pdf_path && " — PDF pending, try regenerating."}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              type="button" size="sm" variant="outline"
              disabled={!certificate.pdf_path || busyAction !== null}
              onClick={() => openCertificate("preview")}
              className="gap-1.5"
            >
              {busyAction === "preview" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              Preview
            </Button>
            <Button
              type="button" size="sm" variant="outline"
              disabled={!certificate.pdf_path || busyAction !== null}
              onClick={() => openCertificate("download")}
              className="gap-1.5"
            >
              {busyAction === "download" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download PDF
            </Button>
            {canGenerate && (
              <Button type="button" size="sm" variant="outline" disabled={generating} onClick={generate} className="gap-1.5">
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {generating ? "Regenerating…" : "Regenerate"}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No certificate has been generated for this service yet.</p>
      )}

      {!certificate && canGenerate && (
        <div className="space-y-2.5">
          {photos.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={includePhotos} onCheckedChange={(v) => setIncludePhotos(!!v)} />
              <span className="text-sm text-foreground">Include service photos ({photos.length})</span>
            </label>
          )}
          <Button type="button" onClick={generate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
            {generating ? "Generating…" : "Generate Service Certificate"}
          </Button>
        </div>
      )}
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
