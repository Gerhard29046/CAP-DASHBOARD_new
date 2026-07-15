import React, { useState } from "react";
import MachineOutlineImage from "@/assets/optimaoutline.svg";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  LogIn,
  Users,
  Wrench,
  FileText,
  CalendarCheck,
  HelpCircle,
  Copy,
  Check,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { login, authError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const showDemoCredentials =
    import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO_CREDENTIALS === "true";

  const handleSubmit = async (e) => {
    e.preventDefault();

    const success = await login(email, password);

    if (success) {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#002f1f] via-[#003f28] to-[#001f16] text-slate-900">
      <header className="h-24 flex items-center justify-between px-10 border-b border-white/10">
        <div className="text-white leading-tight">
          <div className="text-xl font-extrabold tracking-wide">
            CONNOISSEUR
          </div>
          <div className="text-xl font-extrabold tracking-wide">
            AUTOMOTIVE PRODUCTS
          </div>
          <div className="text-xs text-white/80">(CAPE) C.C.</div>
        </div>

        <div className="flex items-center gap-2 text-white/90 font-medium">
          <HelpCircle size={20} />
          Help
        </div>
      </header>

      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] bg-white">
<section className="relative bg-gradient-to-br from-[#004225] to-[#006b3c] text-white pt-10 px-10 pb-44 overflow-hidden">            
  <div className="relative z-10">
              <div className="border-t-2 border-red-500 border-b-2 py-4 mb-6 max-w-xs">
                <h1 className="text-3xl font-extrabold leading-none">
                  CONNOISSEUR
                </h1>
                <h1 className="text-3xl font-extrabold leading-none">
                  AUTOMOTIVE
                </h1>
                <h1 className="text-3xl font-extrabold leading-none">
                  PRODUCTS
                </h1>
                <p className="text-sm mt-1">(CAPE) C.C.</p>
              </div>

              <h2 className="text-xl font-bold text-green-300 mb-8">
                SERVICE MANAGEMENT SYSTEM
              </h2>

              <p className="text-white/95 max-w-sm leading-relaxed mb-8">
                Welcome back. Sign in to access the{" "}
                <span className="text-green-300 font-bold">
                  Connoisseur Auto
                </span>{" "}
                service management dashboard.
              </p>

              <div className="space-y-4">
                <Feature
                  icon={<Users size={20} />}
                  text="Manage clients and machines"
                />
                <Feature
                  icon={<Wrench size={20} />}
                  text="Track services and job cards"
                />
                <Feature
                  icon={<FileText size={20} />}
                  text="Create quotes and invoices"
                />
                <Feature
                  icon={<CalendarCheck size={20} />}
                  text="Stay on top of upcoming services"
                />
              </div>
            </div>

            <img
    src={MachineOutlineImage}
    alt=""
    className="absolute bottom-[0px] left-[95px] w-[430px] opacity-25 pointer-events-none select-none"
/>
          </section>

          <section className="bg-white p-10 lg:p-14">
            <h2 className="text-3xl font-extrabold text-[#004225]">
              Sign in to your account
            </h2>

            <p className="text-slate-600 mt-2">
              Enter your credentials to continue
            </p>

            {authError && (
              <div className="mt-5 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {authError.message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <InputField
                label="Email address"
                icon={<Mail size={20} />}
                value={email}
                onChange={setEmail}
                type="email"
              />

              <InputField
                label="Password"
                icon={<Lock size={20} />}
                value={password}
                onChange={setPassword}
                type="password"
              />

              <button className="w-full bg-gradient-to-r from-[#007a3d] to-[#005c2e] hover:from-[#006b35] hover:to-[#004d27] text-white rounded-lg py-4 font-bold flex items-center justify-center gap-2 shadow-lg">
                <LogIn size={21} />
                Sign in
              </button>

              {showDemoCredentials && <DemoLoginDetails />}
            </form>

          </section>
        </div>
      </main>

      <footer className="text-center text-white/80 text-sm pb-6">
        © 2026{" "}
        <span className="text-green-400 font-semibold">
          Connoisseur Automotive Products (Cape) C.C.
        </span>{" "}
        All rights reserved.
      </footer>
    </div>
  );
}

function Feature({ icon, text }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center">
        {icon}
      </div>
      <span className="font-medium">{text}</span>
    </div>
  );
}

function InputField({ label, icon, value, onChange, type }) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-800 mb-2">
        {label}
      </label>

      <div className="relative">
        <div className="absolute left-4 top-3.5 text-slate-400">{icon}</div>

        <input
          className="w-full border border-slate-300 rounded-lg pl-12 pr-4 py-3 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-700"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
        />
      </div>
    </div>
  );
}

const DEMO_ACCOUNTS = [
  { role: "Admin", email: "admin@connoisseurauto.co.za", password: "admin123" },
  { role: "Technician", email: "technician@connoisseurauto.co.za", password: "tech123" },
  { role: "Accountant", email: "accounts@connoisseurauto.co.za", password: "acc123" },
];

function DemoLoginDetails() {
  const [copied, setCopied] = useState("");

  const copy = async (key, value) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1200);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <p className="font-extrabold text-[#004225] mb-3">Demo Login Details</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {DEMO_ACCOUNTS.map((account) => (
          <div key={account.role} className="rounded-lg border border-slate-200 bg-white p-3 min-w-0">
            <p className="text-sm font-bold text-[#004225] mb-2">{account.role}</p>
            <CredentialRow
              label="Email"
              value={account.email}
              copyKey={`${account.role}-email`}
              copied={copied}
              onCopy={copy}
            />
            <CredentialRow
              label="Password"
              value={account.password}
              copyKey={`${account.role}-password`}
              copied={copied}
              onCopy={copy}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CredentialRow({ label, value, copyKey, copied, onCopy }) {
  const CopiedIcon = copied === copyKey ? Check : Copy;
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex items-center gap-1">
        <code className="min-w-0 flex-1 break-all text-xs text-slate-800">{value}</code>
        <button
          type="button"
          onClick={() => onCopy(copyKey, value)}
          className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#004225]"
          aria-label={`Copy ${accountLabel(label)}`}
        >
          <CopiedIcon size={14} />
        </button>
      </div>
    </div>
  );
}

function accountLabel(label) {
  return label.toLowerCase();
}
