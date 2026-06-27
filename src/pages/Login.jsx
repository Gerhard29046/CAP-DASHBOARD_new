import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  LogIn,
  Users,
  Wrench,
  FileText,
  CalendarCheck,
  Info,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { login, authError } = useAuth();

  const [email, setEmail] = useState("technician@connoisseurauto.co.za");
  const [password, setPassword] = useState("tech123");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await login(email, password);
    if (success) navigate("/");
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
          <section className="relative bg-gradient-to-br from-[#004225] to-[#006b3c] text-white p-10 overflow-hidden">
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
                <Feature icon={<Users size={20} />} text="Manage clients and machines" />
                <Feature icon={<Wrench size={20} />} text="Track services and job cards" />
                <Feature icon={<FileText size={20} />} text="Create quotes and invoices" />
                <Feature icon={<CalendarCheck size={20} />} text="Stay on top of upcoming services" />
              </div>
            </div>

            <MachineOutline />
          </section>

          <section className="bg-white p-10 lg:p-14">
            <h2 className="text-3xl font-extrabold text-[#004225]">
              Sign in to your account
            </h2>
            <p className="text-slate-600 mt-2">
              Enter your credentials to continue
            </p>

            <div className="mt-8 border border-green-200 bg-green-50 rounded-xl p-5 text-green-900">
              <div className="flex gap-3">
                <Info size={20} className="mt-0.5" />
                <div>
                  <p className="font-bold">Demo Accounts</p>
                  <p className="text-sm text-green-900">
                    Use the demo credentials below to explore the system.
                  </p>
                </div>
              </div>
            </div>

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
            </form>

            <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm text-slate-800 space-y-2 shadow-sm">
              <p className="font-extrabold text-[#004225] mb-3">
                Demo Login Details
              </p>
              <p>
                <strong className="text-[#006b3c]">Admin:</strong>{" "}
                admin@connoisseurauto.co.za / admin123
              </p>
              <p>
                <strong className="text-[#006b3c]">Technician:</strong>{" "}
                technician@connoisseurauto.co.za / tech123
              </p>
              <p>
                <strong className="text-[#006b3c]">Manager:</strong>{" "}
                manager@connoisseurauto.co.za / manager123
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="text-center text-white/80 text-sm pb-6">
        © 2024{" "}
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

function MachineOutline() {
  return (
    <div className="absolute bottom-0 left-20 opacity-30">
      <svg width="260" height="340" viewBox="0 0 260 340" fill="none">
        <path d="M80 55 L165 35 L210 75 L210 270 L155 315 L75 295 L55 90 Z" stroke="white" strokeWidth="3"/>
        <path d="M95 75 L165 60 L190 85 L185 120 L95 120 Z" stroke="white" strokeWidth="2"/>
        <path d="M85 145 L180 145 L165 175 L100 175 Z" stroke="white" strokeWidth="3"/>
        <path d="M90 190 L175 190 L160 220 L105 220 Z" stroke="white" strokeWidth="3"/>
        <path d="M95 235 L170 235 L155 260 L110 260 Z" stroke="white" strokeWidth="3"/>
        <circle cx="80" cy="305" r="16" stroke="white" strokeWidth="3"/>
        <circle cx="205" cy="290" r="26" stroke="white" strokeWidth="3"/>
        <path d="M80 55 L80 25 L150 25 L165 35" stroke="white" strokeWidth="3"/>
      </svg>
    </div>
  );
}