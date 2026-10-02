"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getApiBaseUrl, setCustomBackendUrl } from "@/lib/api";
import { loginWithGoogle, isFirebaseConfigured, sendFirebasePasswordReset } from "@/lib/firebase";
import { toast } from "sonner";
import {
  ArrowRight,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  Server,
  Settings,
  KeyRound,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  FileCheck2,
  Clock3,
  Sparkles
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

  // Forgot Password States
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
      toast.success("Backend server connected successfully.");
      setServerModalOpen(false);
    } catch {
      toast.warning("Server URL saved. Ensure your backend is running.");
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

        toast.success(`Welcome back, ${data.name || "User"}.`);

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
        toast.error(error || "Authentication failed. Please verify credentials.");
      }
    } catch {
      toast.error("Failed to connect to backend server.");
      setServerModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      if (!isFirebaseConfigured()) {
        toast.info("Firebase keys not set in environment. Use Demo credentials below.");
        handleQuickDemo("student");
        return;
      }

      const res = await loginWithGoogle();
      if (!res.success || !res.user) {
        toast.error(res.error || "Google Sign-in was cancelled or failed.");
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
        toast.success(`Signed in as ${data.name}.`);
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
      toast.info("Educator credentials loaded.");
    } else {
      setEmail("student@demo.com");
      setPassword("student123");
      toast.info("Student credentials loaded.");
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
        toast.success("Password recovery link sent. Check your inbox.");
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
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between relative overflow-hidden antialiased">
      {/* Subtle Background Glows */}
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-cyan-600/10 blur-[150px] pointer-events-none" />

      {/* Clean Navbar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Custom Sleek Logo Mark */}
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 p-[1px] shadow-sm">
            <div className="h-full w-full bg-[#0a0d14] rounded-[11px] flex items-center justify-center">
              <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
          <span className="font-bold text-lg tracking-tight text-white">
            AI Quiz Generator
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setServerModalOpen(true)}
            className="tap-press flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs text-slate-300 transition-all font-medium"
            title="Configure Backend API Server URL"
          >
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline text-slate-400">API:</span>
            <span className="font-mono text-[11px] text-emerald-400 max-w-[120px] truncate">{serverUrl || "localhost:8000"}</span>
            <Settings className="w-3 h-3 text-slate-500" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-8 flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20 w-full">
        {/* Left Column: Focused Value Proposition */}
        <div className="flex-1 space-y-6 max-w-xl text-center lg:text-left">
          <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-extrabold tracking-tight leading-[1.15] text-white">
            Transform Content Into{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-300 bg-clip-text text-transparent">
              Smart Assessments
            </span>
          </h1>

          <p className="text-slate-400 text-base leading-relaxed">
            Generate curriculum-aligned exams, flashcards, and automated grading rubrics from PDFs, slides, and lecture materials in seconds.
          </p>

          {/* Minimal 3-Point Benefits */}
          <div className="space-y-3.5 pt-2 text-left">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0 mt-0.5">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-200 block">Multimodal Document Ingestion</span>
                <span className="text-xs text-slate-400 leading-normal">Smart extraction from scanned PDFs, PPTX slides, Word docs, and YouTube videos.</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0 mt-0.5">
                <Clock3 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-200 block">Timed Exams with Integrity Proctoring</span>
                <span className="text-xs text-slate-400 leading-normal">Countdown timers, tab-switch integrity monitor, and official scorecard generation.</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-200 block">Intelligent Auto-Grading & Review</span>
                <span className="text-xs text-slate-400 leading-normal">Rubric-based AI scoring for short/long answers with detailed feedback.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Clean Auth Card */}
        <div className="w-full max-w-[400px]">
          <div className="p-7 sm:p-8 rounded-2xl bg-[#0c1017] border border-white/10 shadow-2xl relative">
            {/* Clean Tab Selector */}
            <div className="flex items-center p-1 rounded-xl bg-black/40 border border-white/5 mb-6">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className={`tap-press flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isLogin
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className={`tap-press flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  !isLogin
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Create Account
              </button>
            </div>

            <div className="mb-5">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {isLogin ? "Welcome back" : "Create an account"}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {isLogin
                  ? "Enter your credentials to access your workspace."
                  : "Get started to generate and take assessments."}
              </p>
            </div>

            {/* Google Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="tap-press w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all mb-4 disabled:opacity-50"
            >
              {googleLoading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.14z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            {/* Divider */}
            <div className="relative flex items-center justify-center mb-4">
              <div className="border-t border-white/10 w-full" />
              <span className="bg-[#0c1017] px-3 text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                or
              </span>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {!isLogin && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alex Morgan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-slate-300">
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
                      className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="tap-press w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm rounded-lg shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <>
                    <span>{isLogin ? "Sign In" : "Create Account"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Subtle Demo Logins */}
            <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
              <span className="text-[11px] text-slate-500">Quick Demo:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickDemo("teacher")}
                  className="px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-slate-300 font-medium transition-colors"
                >
                  Educator
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemo("student")}
                  className="px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-slate-300 font-medium transition-colors"
                >
                  Student
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Clean Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 border-t border-white/5 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>© 2026 AI Quiz Generator. All rights reserved.</span>
        <span>Secure Cross-Platform Assessment System</span>
      </footer>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#0f141d] border border-white/10 shadow-2xl space-y-4">
            {forgotStep === "input" ? (
              <>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base">Reset Password</h3>
                      <p className="text-xs text-slate-400">Enter your email to receive a recovery link</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(false)}
                    className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/5"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleForgotSubmit} className="space-y-4 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Account Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        autoFocus
                        placeholder="name@example.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setForgotModalOpen(false)}
                      className="px-3.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {forgotLoading ? "Sending link..." : "Send Recovery Link"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center space-y-4 py-2">
                <div className="mx-auto h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>

                <div>
                  <h3 className="text-base font-bold text-white">Check Your Inbox</h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">
                    A secure password reset link has been dispatched to:
                  </p>
                  <p className="font-mono text-cyan-300 text-xs mt-1">
                    {forgotEmail}
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <a
                    href="https://mail.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Open Email</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      disabled={cooldown > 0 || forgotLoading}
                      onClick={handleForgotSubmit}
                      className="text-xs text-indigo-400 hover:text-indigo-300 disabled:text-slate-600 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForgotModalOpen(false)}
                      className="text-xs text-slate-400 hover:text-white transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#0f141d] border border-white/10 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Backend API Server</h3>
                  <p className="text-[11px] text-slate-400">Configure FastAPI endpoint URL</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setServerModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  API Base URL
                </label>
                <input
                  type="url"
                  placeholder="https://two-radios-live.loca.lt"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-xs font-mono text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 text-[11px] text-slate-300 space-y-1">
                <span className="font-medium text-slate-200 block">Live Secure Tunnel:</span>
                <div className="flex items-center justify-between bg-black/40 p-1.5 rounded border border-white/5">
                  <code className="text-emerald-400 font-mono text-[11px] select-all">https://two-radios-live.loca.lt</code>
                  <button
                    type="button"
                    onClick={() => {
                      setServerUrl("https://two-radios-live.loca.lt");
                      handleSaveServerUrl("https://two-radios-live.loca.lt");
                    }}
                    className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-semibold"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setServerUrl("http://localhost:8000");
                  handleSaveServerUrl("http://localhost:8000");
                }}
                className="px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-400 hover:text-white transition-colors"
              >
                Default Localhost
              </button>
              <button
                type="button"
                onClick={() => handleSaveServerUrl()}
                disabled={testingServer}
                className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center transition-colors disabled:opacity-50"
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