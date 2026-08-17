import React from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon, ShieldCheck, ArrowRight } from "lucide-react";
import JobCardSettingsPanel from "@/pages/settings/JobCardSettingsPanel";
import ProductsServicesSettings from "@/pages/settings/ProductsServicesSettings";
import ImportCustomers from "@/pages/settings/ImportCustomers";
import CompanySettingsPanel from "@/pages/settings/CompanySettingsPanel";

// Settings hub (Phase: Job Card configuration + Products & Services + Data Management,
// 2026-08-13 UX redesign resume). Deliberately a small, cohesive tab structure rather than
// a single giant page of switches -- see this file's header comment in each sub-panel for
// exactly which real application behavior each setting affects. Access is gated by the
// `settings.access` permission at the route level (App.jsx's RoleGuard) -- this page itself
// assumes the caller already has that permission.
export default function Settings() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <SettingsIcon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure how CAP Dashboard works for your team.</p>
        </div>
      </div>

      <Tabs defaultValue="job-cards" className="w-full">
        <TabsList className="mb-5 flex-wrap h-auto">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="job-cards">Job Cards</TabsTrigger>
          <TabsTrigger value="products-services">Products & Services</TabsTrigger>
          <TabsTrigger value="data-management">Data Management</TabsTrigger>
          <TabsTrigger value="users-roles">Users & Roles</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="bg-card border border-border rounded-xl p-5">
            <CompanySettingsPanel />
          </div>
        </TabsContent>

        <TabsContent value="job-cards">
          <div className="bg-card border border-border rounded-xl p-5">
            <JobCardSettingsPanel />
          </div>
        </TabsContent>

        <TabsContent value="products-services">
          <div className="bg-card border border-border rounded-xl p-5">
            <ProductsServicesSettings />
          </div>
        </TabsContent>

        <TabsContent value="data-management">
          <div className="bg-card border border-border rounded-xl p-5">
            <ImportCustomers />
          </div>
        </TabsContent>

        <TabsContent value="users-roles">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-heading font-semibold text-foreground mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-primary" /> Users & Roles
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              User accounts, roles, and permissions are managed on the dedicated User Management page.
            </p>
            <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Go to User Management <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="system">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-heading font-semibold text-foreground mb-1">System</h2>
            <p className="text-sm text-muted-foreground">
              No system-level settings are wired up yet.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
