"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getApiBaseUrl, setCustomBackendUrl } from "@/lib/api";
import { toast } from "sonner";
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  FileText,
  Video,
  School,
  Clock,
  Award,
  Zap,
  BookOpen,
  Wifi,
  Server,
  Settings,
  Check,
} from "lucide-react";

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [testingServer, setTestingServer] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setServerUrl(getApiBaseUrl());
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    if (token) {
      if (role === "unassigned") router.push("/setup");
      else if (role === "teacher") router.push("/teacher-dashboard");
      else if (role === "student") router.push("/student-dashboard");
    }
  }, [router]);

  const handleSaveServerUrl = async (customVal?: string) => {
    setTestingServer(true);
    const targetUrl = (customVal !== undefined ? customVal : serverUrl).trim().replace(/\/+$/, "");
    setCustomBackendUrl(targetUrl);
    setServerUrl(targetUrl || "http://localhost:8000");

    try {
      await apiFetch("/docs", { auth: false });
      toast.success("Backend server connected successfully!");
      setServerModalOpen(false);
    } catch {
      toast.warning("Server URL saved! If request failed, ensure your backend or tunnel is active.");
      setServerModalOpen(false);
    } finally {
      setTestingServer(false);
    }
  };

  if (!isMounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const endpoint = isLogin ? "/auth/login" : "/auth/register";
    const payload = isLogin ? { email, password } : { name, email, password };

    try {
      const { ok, data, error } = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
        auth: false,
      });

      if (ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.role);
        localStorage.setItem("name", data.name || "");

        toast.success(`Welcome back, ${data.name || "User"}! Redirecting...`);

        setTimeout(() => {
          if (data.role === "unassigned") {
            router.push("/setup");
          } else if (data.role === "teacher") {
            router.push("/teacher-dashboard");
          } else if (data.role === "student") {
            router.push("/student-dashboard");
          }
        }, 600);
      } else {
        toast.error(error || "Authentication failed. Please check credentials.");
      }
    } catch {
      toast.error("Failed to fetch from backend. Please configure your API server URL.");
      setServerModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (role: "teacher" | "student") => {
    setIsLogin(true);
    if (role === "teacher") {
      setEmail("teacher@demo.com");
      setPassword("teacher123");
      toast.info("Demo Teacher credentials filled. Click 'Sign In'!");
    } else {
      setEmail("student@demo.com");
      setPassword("student123");
      toast.info("Demo Student credentials filled. Click 'Sign In'!");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 flex flex-col justify-between relative overflow-hidden">
      {/* Background Ambient Glow Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[140px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              AI Quiz Generator
            </span>
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
              v2.0 PRO
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setServerModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 transition-all shadow-sm"
            title="Configure Backend API Server URL"
          >
            <Server className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline text-slate-400">API:</span>
            <span className="font-mono text-[11px] text-emerald-400 max-w-[140px] truncate">{serverUrl || "http://localhost:8000"}</span>
            <Settings className="w-3 h-3 text-slate-500 hover:text-white" />
          </button>
          <span className="hidden md:inline text-sm text-slate-400 font-medium">Switchable Teacher & Student Modes</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12 flex-1 flex flex-col lg:flex-row items-center justify-center gap-16 w-full">
        {/* Left Column: Hero & Feature Matrix */}
        <div className="flex-1 space-y-8 max-w-2xl text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-blue-300 shadow-sm backdrop-blur-md">
            <Zap className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span>Next-Gen Intelligent Assessment Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] text-white">
            Transform Any Content into{" "}
            <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-400 bg-clip-text text-transparent">
              Intelligent Exams
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
            Upload PowerPoint Slides (.pptx, .ppt), PDFs with OCR, Word documents, or YouTube lectures.
            Our AI constructs official university & board exams, manages classroom assignments, and delivers instant pedagogical grading.
          </p>

          {/* Feature Matrix Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-start gap-3.5 hover:bg-white/[0.08] transition-all">
              <div className="p-2.5 rounded-xl bg-orange-500/20 text-orange-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">PowerPoint Slides & Documents</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                  PowerPoint (.pptx/.ppt) lecture slides, scanned PDF OCR, Word (.docx/.doc), RTF, Markdown & YouTube lectures.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-start gap-3.5 hover:bg-white/[0.08] transition-all">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Live Countdown Exams</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                  Automated timed exams with auto-submit, official Arid/OBE paper export, and reviews.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-start gap-3.5 hover:bg-white/[0.08] transition-all">
              <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Smart AI Auto-Grading</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                  Intelligent evaluation for MCQs, blanks, and deep conceptual short/long answers.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-start gap-3.5 hover:bg-white/[0.08] transition-all">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                <School className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Classrooms & Flashcards</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                  Teacher assignment distribution and student spaced-repetition memory stacks.
                </p>
              </div>
            </div>
          </div>

          {/* Social Proof / Stats Strip */}
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 pt-4 border-t border-white/10 text-xs font-semibold text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>PPTX Slides & PDF OCR</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              <span>Official Arid/OBE Papers</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
              <span>Teacher & Student Hubs</span>
            </div>
          </div>
        </div>

        {/* Right Column: Ultra-Sleek Glassmorphism Auth Box */}
        <div className="w-full max-w-md">
          <div className="p-8 sm:p-10 rounded-3xl bg-white/[0.07] border border-white/15 backdrop-blur-xl shadow-2xl shadow-black/40">
            {/* Tab Buttons */}
            <div className="flex items-center p-1 rounded-2xl bg-black/30 border border-white/10 mb-8">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  isLogin
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  !isLogin
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Create Account
              </button>
            </div>

            <div className="mb-6">
              <h3 className="text-2xl font-black text-white">
                {isLogin ? "Welcome Back" : "Get Started Free"}
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                {isLogin
                  ? "Access your quizzes, classrooms, and assessments."
                  : "Create your account. You can switch between Student & Educator mode anytime."}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Alex Morgan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-black/25 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="name@institution.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-black/25 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-11 py-3 bg-black/25 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  <>
                    <span>{isLogin ? "Sign In to Workspace" : "Create My Account"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Logins Bar */}
            <div className="mt-6 pt-5 border-t border-white/10 text-center">
              <span className="text-xs font-semibold text-slate-400 block mb-3 uppercase tracking-wider">
                ⚡ Quick Demo One-Click Fill
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleQuickDemo("teacher")}
                  className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5 transition-all"
                >
                  <School className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Educator Demo</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemo("student")}
                  className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5 transition-all"
                >
                  <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                  <span>Student Demo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 border-t border-white/10 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span>© 2026 AI Quiz Generator. Built with Advanced Multimodal Intelligence.</span>
        <div className="flex items-center gap-6 text-slate-400">
          <span>Student & Educator Dual Ecosystem</span>
          <span>•</span>
          <span>Safe & Isolated Data</span>
        </div>
      </footer>

      {/* Backend Server Configuration Modal */}
      {serverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-white/20 shadow-2xl shadow-black/80 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Backend API Server</h3>
                  <p className="text-xs text-slate-400">Connect this app to your AI FastAPI backend</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setServerModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Backend API Base URL
                </label>
                <input
                  type="url"
                  placeholder="https://true-waves-pick.loca.lt or http://localhost:8000"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/15 rounded-xl text-sm font-mono text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold">
                  <Wifi className="w-4 h-4 text-emerald-400" />
                  <span>Free Tunnel Link (Live Right Now):</span>
                </div>
                <div className="flex items-center justify-between bg-black/40 p-2 rounded-lg border border-white/10">
                  <code className="text-emerald-400 font-mono text-xs select-all">https://true-waves-pick.loca.lt</code>
                  <button
                    type="button"
                    onClick={() => {
                      setServerUrl("https://true-waves-pick.loca.lt");
                      handleSaveServerUrl("https://true-waves-pick.loca.lt");
                    }}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-bold"
                  >
                    Use This
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  This tunnel connects directly to your laptop's running FastAPI server with zero card required.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setServerUrl("http://localhost:8000");
                  handleSaveServerUrl("http://localhost:8000");
                }}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-400 hover:text-white transition-all"
              >
                Reset Default
              </button>
              <button
                type="button"
                onClick={() => handleSaveServerUrl()}
                disabled={testingServer}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
              >
                {testingServer ? "Connecting..." : "Save & Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}