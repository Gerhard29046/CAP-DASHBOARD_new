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

    if (success) {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-[#002f1f] text-slate-900">
      <header className="h-20 flex items-center justify-between px-8 border-b border-white/10">
        <div className="text-white">
          <div className="text-lg font-bold tracking-wide">
            CONNOISSEUR AUTOMOTIVE PRODUCTS
          </div>
          <div className="text-sm text-green-300 font-semibold">
            Service Management System
          </div>
        </div>

        <div className="text-white/80 text-sm">Help</div>
      </header>

      <main className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2">
          <section className="bg-gradient-to-br from-[#003b25] to-[#006b3c] text-white p-10 relative overflow-hidden">
            <div className="relative z-10">
              <h1 className="text-3xl font-bold leading-tight">
                Connoisseur Automotive Products
              </h1>
              <p className="mt-2 text-green-200 font-semibold">
                Service Management System
              </p>

              <div className="w-16 h-1 bg-red-500 mt-6 mb-8" />

              <p className="text-white/90 leading-relaxed max-w-sm">
                Welcome back. Sign in to manage clients, machines, services,
                job cards, quotations, and upcoming service schedules.
              </p>

              <div className="mt-10 space-y-5">
                <Feature icon={<Users size={20} />} text="Manage clients and machines" />
                <Feature icon={<Wrench size={20} />} text="Track services and job cards" />
                <Feature icon={<FileText size={20} />} text="Create quotes and invoices" />
                <Feature icon={<CalendarCheck size={20} />} text="Monitor upcoming services" />
              </div>
            </div>

            <div className="absolute bottom-8 right-8 opacity-20 text-white text-[180px] font-black">
              W
            </div>
          </section>

          <section className="p-10 lg:p-14 bg-white">
            <h2 className="text-3xl font-bold text-[#004225]">
              Sign in to your account
            </h2>
            <p className="mt-2 text-slate-600">
              Enter your credentials to continue.
            </p>

            <div className="mt-8 border border-green-200 bg-green-50 rounded-xl p-4 text-green-900">
              <div className="flex gap-3">
                <Info size={20} className="mt-0.5" />
                <div>
                  <p className="font-semibold">Demo Accounts</p>
                  <p className="text-sm text-green-800 mt-1">
                    Use the demo credentials below to test different user roles.
                  </p>
                </div>
              </div>
            </div>

            {authError && (
              <div className="mt-5 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
                {authError.message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-3.5 text-slate-400" size={20} />
                  <input
                    className="w-full border border-slate-300 rounded-lg pl-12 pr-4 py-3 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-700"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-3.5 text-slate-400" size={20} />
                  <input
                    className="w-full border border-slate-300 rounded-lg pl-12 pr-4 py-3 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-700"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                  />
                </div>
              </div>

              <button className="w-full bg-[#006b3c] hover:bg-[#00552f] text-white rounded-lg py-3 font-semibold flex items-center justify-center gap-2">
                <LogIn size={20} />
                Sign in
              </button>
            </form>

            <div className="mt-8 border border-slate-200 bg-slate-50 rounded-xl p-5 text-sm text-slate-700 space-y-2">
              <p className="font-bold text-[#004225] mb-3">Demo Login Details</p>
              <p><strong className="text-[#006b3c]">Admin:</strong> admin@connoisseurauto.co.za / admin123</p>
              <p><strong className="text-[#006b3c]">Technician:</strong> technician@connoisseurauto.co.za / tech123</p>
              <p><strong className="text-[#006b3c]">Manager:</strong> manager@connoisseurauto.co.za / manager123</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, text }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
        {icon}
      </div>
      <span className="text-white/95">{text}</span>
    </div>
  );
}