import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  ClipboardCheck,
  Calendar,
  User,
  Building2,
  Wrench,
  Camera,
  ChevronRight,
  X,
  FileText,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { apiClient } from "@/api/apiClient";
import { Input } from "@/components/ui/input";

function formatDate(date) {
  if (!date) return "Not set";
  return new Date(date).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

  useEffect(() => {
    loadRecords();
  }, []);

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
      thisMonth: records.filter((record) => {
        if (!record.service_date) return false;
        const date = new Date(record.service_date);
        return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
      }).length,
      withPhotos: records.filter((record) => getPhotos(record).length > 0).length,
      nextDue: records.filter((record) => record.next_service_due).length,
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const client = getClient(record);

      const text = [
        client?.company_name,
        client?.name,
        client?.phone,
        record.machine?.brand,
        record.machine?.model,
        record.machine?.serial_number,
        record.machine?.refrigerant_type,
        record.technician_name,
        record.work_performed,
        record.findings,
        record.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(search.toLowerCase());
    });
  }, [records, search]);

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">
            Service Records
          </h1>
          <p className="text-muted-foreground mt-1">
            Completed on-site services performed at client premises.
          </p>
        </div>

        <div className="relative w-full xl:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, machine, technician..."
            className="pl-10 h-11 rounded-xl bg-secondary/50 border-border"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Services" value={stats.total} icon={ClipboardCheck} tone="blue" />
        <StatCard title="This Month" value={stats.thisMonth} icon={Calendar} tone="emerald" />
        <StatCard title="With Photos" value={stats.withPhotos} icon={Camera} tone="purple" />
        <StatCard title="Next Due Set" value={stats.nextDue} icon={CheckCircle2} tone="teal" />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_430px] gap-5">
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">
                Completed Services
              </h2>
              <p className="text-sm text-muted-foreground">
                {loading ? "Loading..." : `${filteredRecords.length} record(s)`}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-28">
              <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-20">
              <ClipboardCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold text-foreground">
                No service records found
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Completed on-site services will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/30 text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">Client</th>
                    <th className="text-left px-5 py-3 font-medium">Machine</th>
                    <th className="text-left px-5 py-3 font-medium">Serial</th>
                    <th className="text-left px-5 py-3 font-medium">Service Date</th>
                    <th className="text-left px-5 py-3 font-medium">Technician</th>
                    <th className="text-left px-5 py-3 font-medium">Photos</th>
                    <th className="text-right px-5 py-3 font-medium">Open</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRecords.map((record) => {
                    const client = getClient(record);
                    const photos = getPhotos(record);
                    const selected = selectedRecord?.id === record.id;

                    return (
                      <tr
                        key={record.id}
                        onClick={() => setSelectedRecord(record)}
                        className={`border-t border-border cursor-pointer transition-colors ${
                          selected ? "bg-primary/10" : "hover:bg-secondary/30"
                        }`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                              <Building2 className="w-4 h-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">
                                {client?.company_name || client?.name || "Unknown Client"}
                              </p>
                              {client?.phone && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {client.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-medium text-foreground">
                            {[record.machine?.brand, record.machine?.model]
                              .filter(Boolean)
                              .join(" ") || "Unknown Machine"}
                          </p>
                          {record.machine?.refrigerant_type && (
                            <p className="text-xs text-muted-foreground">
                              {record.machine.refrigerant_type}
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4 text-muted-foreground">
                          {record.machine?.serial_number || "—"}
                        </td>

                        <td className="px-5 py-4 text-muted-foreground">
                          {formatDate(record.service_date)}
                        </td>

                        <td className="px-5 py-4 text-muted-foreground">
                          {record.technician_name || "Not recorded"}
                        </td>

                        <td className="px-5 py-4">
                          {photos.length > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/15 text-purple-400 px-2.5 py-1 text-xs font-medium">
                              <Camera className="w-3.5 h-3.5" />
                              {photos.length}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <ChevronRight className="w-4 h-4 text-muted-foreground inline-block" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ServiceDetailPanel record={selectedRecord} onPhotoClick={setSelectedPhoto} />
      </div>

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setSelectedPhoto(null)}
        >
          <button className="absolute top-5 right-5 text-white">
            <X className="w-7 h-7" />
          </button>

          <img
            src={selectedPhoto}
            alt=""
            className="max-w-full max-h-full rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}

function ServiceDetailPanel({ record, onPhotoClick }) {
  if (!record) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6">
        <p className="text-sm text-muted-foreground">
          Select a service record to view details.
        </p>
      </div>
    );
  }

  const client = getClient(record);
  const photos = getPhotos(record);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="text-xl font-bold text-foreground">Service Record</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {formatDate(record.service_date)}
        </p>
      </div>

      <div className="p-5 space-y-6">
        <DetailSection icon={Building2} title="Client">
          <p className="font-semibold text-foreground">
            {client?.company_name || client?.name || "Unknown Client"}
          </p>
          {client?.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
          {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
        </DetailSection>

        <DetailSection icon={Wrench} title="Machine">
          <p className="font-semibold text-foreground">
            {[record.machine?.brand, record.machine?.model]
              .filter(Boolean)
              .join(" ") || "Unknown Machine"}
          </p>
          <InfoRow label="Serial Number" value={record.machine?.serial_number} />
          <InfoRow label="Refrigerant" value={record.machine?.refrigerant_type} />
        </DetailSection>

        <DetailSection icon={ClipboardCheck} title="Service Details">
          <InfoRow label="Technician" value={record.technician_name} />
          <InfoRow label="Service Date" value={formatDate(record.service_date)} />
          <InfoRow label="Next Service Due" value={formatDate(record.next_service_due)} />

          <TextBlock title="Work Performed" value={record.work_performed} />
          <TextBlock title="Findings" value={record.findings} />
          <TextBlock title="Recommendations" value={record.notes} />
        </DetailSection>

        <DetailSection icon={Camera} title="Photos">
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No photos uploaded for this service.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <button
                  key={index}
                  onClick={() => onPhotoClick(photo)}
                  className="aspect-square rounded-xl overflow-hidden border border-border hover:border-primary transition-colors"
                >
                  <img
                    src={photo}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </DetailSection>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, tone }) {
  const tones = {
    blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    purple: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    teal: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tones[tone]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
      </div>
    </div>
  );
}

function DetailSection({ icon: Icon, title, children }) {
  return (
    <div className="border-b border-border pb-5 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground">{title}</h3>
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
      <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">
        {value || "Not recorded."}
      </p>
    </div>
  );
}
