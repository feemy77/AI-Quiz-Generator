"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getApiBaseUrl, setCustomBackendUrl } from "@/lib/api";
import { loginWithGoogle, isFirebaseConfigured, sendFirebasePasswordReset } from "@/lib/firebase";
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
  School,
  Clock,
  Award,
  Zap,
  BookOpen,
  Wifi,
  Server,
  Settings,
  ShieldCheck,
  KeyRound,
  ExternalLink,
  RotateCcw
} from "lucide-react";

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [testingServer, setTestingServer] = useState(false);

  // 🔐 Forgot Password States
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotStep, setForgotStep] = useState<"input" | "success">("input");
  const [cooldown, setCooldown] = useState(0);

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

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

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
      toast.warning("Server URL saved! If request failed, ensure your backend is active.");
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
        }, 500);
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

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      if (!isFirebaseConfigured()) {
        toast.info(
          "Firebase keys not set in environment. Quick Demo login is ready below!",
          { duration: 4000 }
        );
        handleQuickDemo("student");
        return;
      }

      const res = await loginWithGoogle();
      if (!res.success || !res.user) {
        toast.error(res.error || "Google Sign-in failed or was cancelled.");
        return;
      }

      const { ok, data, error } = await apiFetch("/auth/firebase-login", {
        method: "POST",
        body: JSON.stringify({
          email: res.user.email,
          name: res.user.displayName || "Google User",
          role: "student"
        }),
        auth: false,
      });

      if (ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.role);
        localStorage.setItem("name", data.name || res.user.displayName || "User");
        toast.success(`Welcome ${data.name}! Redirecting...`);
        setTimeout(() => {
          if (data.role === "teacher") router.push("/teacher-dashboard");
          else router.push("/student-dashboard");
        }, 500);
      } else {
        toast.error(error || "Server validation failed for Google account.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Google sign-in encountered an error.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleQuickDemo = (role: "teacher" | "student") => {
    setIsLogin(true);
    if (role === "teacher") {
      setEmail("teacher@demo.com");
      setPassword("teacher123");
      toast.info("Teacher credentials filled! Click 'Sign In' to enter Educator Pro.");
    } else {
      setEmail("student@demo.com");
      setPassword("student123");
      toast.info("Student credentials filled! Click 'Sign In' to enter Student Hub.");
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error("Please enter your registered email address.");
      return;
    }
    setForgotLoading(true);
    try {
      const res = await sendFirebasePasswordReset(forgotEmail.trim());
      if (res.success) {
        setForgotStep("success");
        setCooldown(60);
        toast.success("Password reset instructions sent! Check your inbox.");
      } else {
        toast.error(res.error || "Could not send password reset email.");
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] bg-mesh-gradient text-slate-100 flex flex-col justify-between relative overflow-hidden">
      {/* Background Ambient Glow Orbs */}
      <div className="absolute top-[-15%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-600/15 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[600px] h-[600px] rounded-full bg-cyan-600/15 blur-[160px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/25">
            <div className="h-full w-full bg-[#0b0f19] rounded-[15px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                AI Quiz Generator
              </span>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                PRO 2.5
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Intelligent Multimodal Assessment & Grading Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setServerModalOpen(true)}
            className="tap-press flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 transition-all shadow-sm"
            title="Configure Backend API Server URL"
          >
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline text-slate-400">API:</span>
            <span className="font-mono text-[11px] text-emerald-400 max-w-[130px] truncate">{serverUrl || "http://localhost:8000"}</span>
            <Settings className="w-3 h-3 text-slate-500 hover:text-white" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10 flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16 w-full">
        {/* Left Column: Hero & Showcase */}
        <div className="flex-1 space-y-7 max-w-2xl text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-300 shadow-inner">
            <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>Multimodal AI Ingestion • Spaced Repetition • Anti-Cheat Integrity</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] text-white">
            Smart Assessments,{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
              Zero Manual Grading
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
            Upload PDFs with scanned OCR, PowerPoint slides (.pptx), Word documents, or YouTube video lessons. 
            Generate university-grade timed examinations, interactive flashcard stacks, and automated AI rubrics in seconds.
          </p>

          {/* Feature Matrix Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <div className="p-4 rounded-2xl glass-panel card-hover flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400 shrink-0 border border-indigo-500/20">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Multimodal Documents & OCR</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                  High-accuracy Tesseract OCR fallback for scanned images, PDFs, PPTX slides & YouTube lessons.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl glass-panel card-hover flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 shrink-0 border border-purple-500/20">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Timed Exams & Anti-Cheat</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                  Live countdown timer, tab-switch monitoring, KaTeX math formulas, and official PDF scorecards.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl glass-panel card-hover flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 shrink-0 border border-cyan-500/20">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">AI Examiner Auto-Grading</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                  Fuzzy fill-in-the-blank normalization & AI rubric scoring for long essay answers.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl glass-panel card-hover flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0 border border-emerald-500/20">
                <School className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Classrooms & Question Bank</h4>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                  7-digit student join codes, classroom assignments, SuperMemo-2 flashcards, and question bookmarking.
                </p>
              </div>
            </div>
          </div>

          {/* Social Proof Strip */}
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 pt-3 border-t border-white/5 text-xs font-semibold text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Full Cross-Platform (Web & Mobile)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>1-Click Dynamic Role Switching</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
              <span>Firebase Auth & Reset Protected</span>
            </div>
          </div>
        </div>

        {/* Right Column: Authentication Card */}
        <div className="w-full max-w-md">
          <div className="p-7 sm:p-9 rounded-3xl glass-panel-glow relative">
            {/* Tab Buttons */}
            <div className="flex items-center p-1 rounded-2xl bg-black/40 border border-white/10 mb-7">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className={`tap-press flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  isLogin
                    ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className={`tap-press flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  !isLogin
                    ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Create Account
              </button>
            </div>

            <div className="mb-6">
              <h3 className="text-2xl font-black text-white tracking-tight">
                {isLogin ? "Welcome Back" : "Create Account"}
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-medium leading-relaxed">
                {isLogin
                  ? "Sign in to access your assessments, classrooms, and study cards."
                  : "Join today. You can freely toggle between Student and Educator mode anytime."}
              </p>
            </div>

            {/* Google Firebase Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="tap-press w-full py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-3 transition-all mb-5 group shadow-sm disabled:opacity-50"
            >
              {googleLoading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.14z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            {/* Divider */}
            <div className="relative flex items-center justify-center mb-5">
              <div className="border-t border-white/10 w-full" />
              <span className="bg-[#0e1424] px-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Or with Email
              </span>
            </div>

            {/* Email / Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
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
                      className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
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
                    className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Password
                  </label>
                  {isLogin && (
                    <button
                      type="button"
                      onClick={() => {
                        setForgotEmail(email || "");
                        setForgotStep("input");
                        setForgotModalOpen(true);
                      }}
                      className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-11 py-2.5 sm:py-3 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
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
                className="tap-press w-full mt-2 py-3 px-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  <>
                    <span className="text-sm">{isLogin ? "Sign In to Workspace" : "Create Account"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Fill Bar */}
            <div className="mt-6 pt-5 border-t border-white/10 text-center">
              <span className="text-[10px] font-bold text-slate-400 block mb-2.5 uppercase tracking-wider">
                ⚡ Instant Quick Demo Testing
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleQuickDemo("teacher")}
                  className="tap-press py-2 px-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-xs font-semibold text-indigo-300 flex items-center justify-center gap-1.5 transition-all"
                >
                  <School className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Educator Demo</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemo("student")}
                  className="tap-press py-2 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5 transition-all"
                >
                  <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Student Demo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 border-t border-white/5 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span>© 2026 AI Quiz Generator. Multi-Engine Multimodal Intelligence.</span>
        <div className="flex items-center gap-4 text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Anti-Cheat Exam Proctoring</span>
          </span>
          <span>•</span>
          <span>Web, Android & iOS Ready</span>
        </div>
      </footer>

      {/* 🔐 Professional Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md p-7 rounded-3xl bg-[#0f172a] border border-white/15 shadow-2xl shadow-black space-y-5 animate-in zoom-in-95 duration-200">
            {forgotStep === "input" ? (
              <>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-cyan-400 shadow-inner">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg tracking-tight">Forgot Password?</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Reset link will be sent to your email</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed font-normal">
                  Enter your registered account email below. We'll send you an official, secure password recovery link to choose a new password.
                </p>

                <form onSubmit={handleForgotSubmit} className="space-y-4 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Your Registered Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        autoFocus
                        placeholder="name@institution.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/15 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-all font-sans"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setForgotModalOpen(false)}
                      className="tap-press px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-400 hover:text-white transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="tap-press flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                    >
                      {forgotLoading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Sending instructions...</span>
                        </>
                      ) : (
                        <>
                          <span>Send Recovery Link</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center space-y-5 py-2">
                <div className="mx-auto h-16 w-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/20">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Check Your Inbox</h3>
                  <p className="text-xs text-slate-300 mt-2 max-w-sm mx-auto leading-relaxed">
                    We have dispatched a secure password reset link to:
                  </p>
                  <p className="font-mono text-cyan-300 text-xs font-bold mt-1 bg-black/40 py-1.5 px-3 rounded-xl border border-white/10 inline-block">
                    {forgotEmail}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-[11px] text-slate-400 leading-relaxed text-left">
                  💡 <b>Tip:</b> Click the link inside the email to immediately enter a new password. If you don't see it within a minute, check your Spam or Junk folder.
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <a
                    href="https://mail.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="tap-press w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all"
                  >
                    <span>Open Email Provider</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      disabled={cooldown > 0 || forgotLoading}
                      onClick={handleForgotSubmit}
                      className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 disabled:text-slate-600 transition-colors flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForgotModalOpen(false)}
                      className="text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                    >
                      Back to Sign In
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backend Server Configuration Modal */}
      {serverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#0f172a] border border-white/15 shadow-2xl shadow-black space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Backend API Server</h3>
                  <p className="text-xs text-slate-400">Point frontend to your FastAPI server or cloud endpoint</p>
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
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Backend API Base URL
                </label>
                <input
                  type="url"
                  placeholder="http://localhost:8000"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/15 rounded-xl text-sm font-mono text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-200 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold">
                  <Wifi className="w-4 h-4 text-emerald-400" />
                  <span>Local Development & Mobile APK:</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  When testing from an Android/iOS device on the same Wi-Fi, enter your laptop's local IP (e.g. <code className="text-emerald-300 font-mono">http://192.168.1.X:8000</code>).
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
                className="tap-press px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-400 hover:text-white transition-all"
              >
                Default Localhost
              </button>
              <button
                type="button"
                onClick={() => handleSaveServerUrl()}
                disabled={testingServer}
                className="tap-press flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
              >
                {testingServer ? "Verifying..." : "Save & Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}