"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, apiFetch, clearAuth, switchUserRole } from "@/lib/api";
import { toast } from "sonner";
import {
  Sparkles,
  School,
  History,
  BookOpen,
  Flame,
  Award,
  LogOut,
  Upload,
  Video,
  Camera,
  Play,
  CheckCircle2,
  Calendar,
  X,
  Clock,
  GraduationCap,
  Download,
  FileText,
  Info,
} from "lucide-react";

type SelectedFile = {
  id: string;
  file: File;
  totalPages: number | null;
  startPage: number;
  endPage: number;
  isAnalyzing: boolean;
  isImage: boolean;
};

export default function StudentDashboard() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [studentName, setStudentName] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"generator" | "classrooms" | "history">("generator");

  // Generator States
  const [inputType, setInputType] = useState("document");
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [ytStartMin, setYtStartMin] = useState(0);
  const [ytEndMin, setYtEndMin] = useState(25);
  const [numMcq, setNumMcq] = useState(5);
  const [numFillBlank, setNumFillBlank] = useState(2);
  const [numShort, setNumShort] = useState(2);
  const [numLong, setNumLong] = useState(1);
  const [difficulty, setDifficulty] = useState("Medium");
  const [questionStyle, setQuestionStyle] = useState("Auto");
  const [academicTier, setAcademicTier] = useState("University");
  const [examTrack, setExamTrack] = useState("Theory");
  const [includeComprehension, setIncludeComprehension] = useState(false);
  const [examSubject, setExamSubject] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [exportingId, setExportingId] = useState<number | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Classroom States
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [classrooms, setClassrooms] = useState<any[]>([]);

  // Student Attempt History
  const [attempts, setAttempts] = useState<any[]>([]);

  // Gamification & Flashcards Data
  const [stats, setStats] = useState<{
    streak: { current_streak: number; longest_streak: number };
    badges: { badge_name: string }[];
    dueFlashcards: number;
  }>({
    streak: { current_streak: 0, longest_streak: 0 },
    badges: [],
    dueFlashcards: 0,
  });

  const [customPopup, setCustomPopup] = useState({ show: false, title: "", message: "", type: "success" });
  const [switchingRole, setSwitchingRole] = useState(false);
  const [generatedQuizModal, setGeneratedQuizModal] = useState<{
    show: boolean;
    quizId: number | null;
    totalQuestions: number;
  }>({ show: false, quizId: null, totalQuestions: 0 });

  // 🔒 Prevent background scrolling when modal is open
  useEffect(() => {
    if (generatedQuizModal.show || customPopup.show) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow || "unset";
      };
    }
  }, [generatedQuizModal.show, customPopup.show]);

  useEffect(() => {
    setIsMounted(true);
    const token = localStorage.getItem("token");
    const userRole = localStorage.getItem("role");

    if (!token) {
      router.push("/");
      return;
    } else if (userRole === "teacher" || userRole === "admin") {
      router.push("/teacher-dashboard");
      return;
    }

    setStudentName(localStorage.getItem("name") || "Student");
    fetchStudentData();
  }, [router]);

  const fetchStudentData = async () => {
    try {
      const [statRes, cardRes, classRes, attemptRes] = await Promise.all([
        apiFetch("/user/dashboard"),
        apiFetch("/flashcards/due"),
        apiFetch("/student/classrooms"),
        apiFetch("/student/attempts"),
      ]);

      if (statRes.ok) {
        setStats({
          streak: statRes.data.streak || { current_streak: 0, longest_streak: 0 },
          badges: statRes.data.badges || [],
          dueFlashcards: cardRes.ok ? cardRes.data.due_count || 0 : 0,
        });
      }

      if (classRes.ok) {
        setClassrooms(classRes.data.classrooms || []);
      }

      if (attemptRes.ok) {
        setAttempts(attemptRes.data.attempts || []);
      }
    } catch (e) {
      console.error("Failed to load student data:", e);
    }
  };

  if (!isMounted) return null;

  const handleLogout = () => {
    clearAuth();
    router.push("/");
  };

  const handleSwitchToTeacher = async () => {
    setSwitchingRole(true);
    try {
      const { ok, error } = await switchUserRole("teacher");
      if (ok) {
        toast.success("Switched to Educator Mode");
        router.push("/teacher-dashboard");
      } else {
        toast.error(error || "Failed to switch mode.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setSwitchingRole(false);
    }
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const { ok, data, error } = await apiFetch("/student/classrooms/join", {
        method: "POST",
        body: JSON.stringify({ join_code: joinCode.trim() }),
      });
      if (ok) {
        setCustomPopup({
          show: true,
          title: "Classroom Joined Successfully",
          message: "You have joined the classroom. Active assignments are listed below.",
          type: "success",
        });
        setJoinCode("");
        fetchStudentData();
      } else {
        setCustomPopup({
          show: true,
          title: "Could Not Join",
          message: error || "Invalid join code.",
          type: "error",
        });
      }
    } catch {
      setCustomPopup({ show: true, title: "Error", message: "Network connection error.", type: "error" });
    } finally {
      setJoining(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesArray = Array.from(e.target.files || []);
    if (filesArray.length === 0) return;

    if (inputType === "snap") {
      const selectedFile = filesArray[0];
      setImagePreview(URL.createObjectURL(selectedFile));
      setSelectedFiles([
        {
          id: Math.random().toString(36).substring(7),
          file: selectedFile,
          totalPages: null,
          startPage: 1,
          endPage: 1,
          isAnalyzing: false,
          isImage: true,
        },
      ]);
      return;
    }

    const newSelectedFiles: SelectedFile[] = filesArray.map((f) => ({
      id: Math.random().toString(36).substring(7),
      file: f,
      totalPages: null,
      startPage: 1,
      endPage: 1,
      isAnalyzing: false,
      isImage: f.type.startsWith("image/"),
    }));
    setSelectedFiles((prev) => [...prev, ...newSelectedFiles]);

    for (const newFile of newSelectedFiles) {
      if (!newFile.isImage) {
        setSelectedFiles((prev) => prev.map((pf) => (pf.id === newFile.id ? { ...pf, isAnalyzing: true } : pf)));
        const fd = new FormData();
        fd.append("file", newFile.file);
        try {
          const res = await fetch(`${API_BASE_URL}/quiz/analyze-document`, { method: "POST", body: fd });
          if (res.ok) {
            const data = await res.json();
            setSelectedFiles((prev) =>
              prev.map((pf) =>
                pf.id === newFile.id
                  ? { ...pf, totalPages: data.total_pages, endPage: data.total_pages, isAnalyzing: false }
                  : pf
              )
            );
          } else {
            setSelectedFiles((prev) => prev.map((pf) => (pf.id === newFile.id ? { ...pf, isAnalyzing: false } : pf)));
          }
        } catch {
          setSelectedFiles((prev) => prev.map((pf) => (pf.id === newFile.id ? { ...pf, isAnalyzing: false } : pf)));
        }
      }
    }
    if (e.target) e.target.value = "";
  };

  const removeFile = (id: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id));
  };
  const updateRange = (id: string, field: "startPage" | "endPage", value: number) => {
    setSelectedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: value } : f)));
  };
  const clearImageSelection = () => {
    setSelectedFiles([]);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGenerateSelfStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((inputType === "document" || inputType === "snap") && selectedFiles.length === 0)
      return setMessage("Please select at least one document or image.");
    if (inputType === "youtube" && !youtubeUrl.trim()) return setMessage("Please enter a YouTube video URL.");
    if (numMcq + numFillBlank + numShort + numLong <= 0) return setMessage("Please request at least one question.");

    setLoading(true);
    setMessage("");
    const token = localStorage.getItem("token");
    const formData = new FormData();

    if ((inputType === "document" || inputType === "snap") && selectedFiles.length > 0) {
      selectedFiles.forEach((sf) => formData.append("files", sf.file));
      const ranges = selectedFiles.map((sf) => ({ filename: sf.file.name, start: sf.startPage, end: sf.endPage }));
      formData.append("file_ranges", JSON.stringify(ranges));
    } else if (inputType === "youtube") {
      formData.append("youtube_url", youtubeUrl);
      formData.append("yt_start_min", ytStartMin.toString());
      formData.append("yt_end_min", ytEndMin.toString());
    }

    formData.append("num_mcq", numMcq.toString());
    formData.append("num_fill_blank", numFillBlank.toString());
    formData.append("num_short", numShort.toString());
    formData.append("num_long", numLong.toString());
    formData.append("difficulty", difficulty);
    formData.append("academic_tier", academicTier);
    formData.append("exam_track", examTrack);
    formData.append("include_comprehension", includeComprehension ? "true" : "false");
    formData.append("exam_title", examTitle.trim() || "Student Practice Paper");
    formData.append("subject", examSubject.trim() || "General Subject");
    formData.append("institution_name", "Academic Examination Department");

    try {
      const response = await fetch(`${API_BASE_URL}/quiz/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setGeneratedQuizModal({
          show: true,
          quizId: data.quiz_id,
          totalQuestions: numMcq + numFillBlank + numShort + numLong,
        });
        fetchStudentData();
      } else {
        setMessage(data.detail || "Failed to generate quiz.");
      }
    } catch {
      setMessage("Network error connecting to backend.");
    } finally {
      setLoading(false);
    }
  };

  const handleStudentDownload = async (quizId: number, format: "pdf" | "docx") => {
    setExportingId(quizId);
    const token = localStorage.getItem("token");
    try {
      const response = await fetch(`${API_BASE_URL}/quiz/${quizId}/export/${format}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          institution_name: "Academic Examination Department",
          department_name: "Examination Branch",
          exam_title: examTitle.trim() || "Academic Practice Paper",
          subject: examSubject.trim() || "Computer Science",
          class_name: academicTier === "University" ? "BSCS - 3" : academicTier === "College" ? "HSSC - II" : "SSC - X",
          teacher_name: "Course Instructor",
          duration_minutes: 75,
          total_marks: 12,
          exam_set: "Standard",
          exam_category: examTrack === "Practical" ? "PRACTICAL" : "THEORY",
          include_instructions: true,
          include_answer_key: true,
          include_clo: true,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Exam_Paper_${quizId}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success(`Exam Paper downloaded as ${format.toUpperCase()}`);
      } else {
        toast.error("Failed to download exam paper.");
      }
    } catch {
      toast.error("Network error while downloading.");
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-28 sm:pb-16 relative">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent truncate max-w-[140px] sm:max-w-none">
                  Student Hub
                </h1>
                <span className="hidden sm:inline text-xs text-gray-400 font-medium">Study & Master Anything</span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {/* Streak Pill */}
              <div className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-xs font-black">
                <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-amber-500 text-amber-500" />
                <span className="sm:hidden">{stats.streak.current_streak}d</span>
                <span className="hidden sm:inline">{stats.streak.current_streak} Day Streak</span>
              </div>

              {/* Flashcards Pill - Desktop */}
              <button
                onClick={() => router.push("/flashcards")}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-full text-xs font-bold hover:bg-purple-100 transition-colors tap-press cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>{stats.dueFlashcards} Due</span>
              </button>

              {/* Mode Switcher - Desktop */}
              <button
                onClick={handleSwitchToTeacher}
                disabled={switchingRole}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer tap-press"
                title="Switch to Educator Dashboard"
              >
                <School className="w-3.5 h-3.5 text-indigo-600" />
                <span>{switchingRole ? "Switching..." : "Switch to Educator Mode"}</span>
              </button>

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors cursor-pointer tap-press"
                title="Log out"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 📱 Mobile Bottom Navigation Bar (sm:hidden) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-gray-200/90 px-2 py-1.5 shadow-2xl safe-bottom">
        <div className="grid grid-cols-5 gap-1 items-center">
          <button
            type="button"
            onClick={() => setActiveTab("generator")}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all tap-press cursor-pointer ${
              activeTab === "generator" ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${activeTab === "generator" ? "bg-blue-50 text-blue-600" : ""}`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 font-bold tracking-tight">Practice</span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/flashcards")}
            className="relative flex flex-col items-center justify-center py-1 rounded-xl transition-all text-gray-400 hover:text-gray-700 tap-press cursor-pointer"
          >
            <div className="p-1.5 rounded-xl">
              <BookOpen className="w-5 h-5" />
              {stats.dueFlashcards > 0 && (
                <span className="absolute top-1 right-2.5 min-w-[16px] h-4 px-1 bg-purple-600 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse">
                  {stats.dueFlashcards > 9 ? "9+" : stats.dueFlashcards}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 font-medium tracking-tight">Cards</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("classrooms")}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all tap-press cursor-pointer ${
              activeTab === "classrooms" ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${activeTab === "classrooms" ? "bg-blue-50 text-blue-600" : ""}`}>
              <School className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 font-bold tracking-tight">Classes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all tap-press cursor-pointer ${
              activeTab === "history" ? "text-blue-600 font-extrabold" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${activeTab === "history" ? "bg-blue-50 text-blue-600" : ""}`}>
              <History className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 font-bold tracking-tight">History</span>
          </button>

          <button
            type="button"
            onClick={handleSwitchToTeacher}
            disabled={switchingRole}
            className="flex flex-col items-center justify-center py-1 rounded-xl transition-all text-indigo-600 hover:text-indigo-800 tap-press disabled:opacity-50 cursor-pointer"
            title="Switch to Educator Mode"
          >
            <div className="p-1.5 rounded-xl bg-indigo-50">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 font-medium tracking-tight">Educator</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {/* Navigation Tabs (Desktop Only) */}
        <div className="hidden sm:flex bg-white p-1.5 rounded-2xl border border-gray-200/80 max-w-md shadow-xs">
          <button
            onClick={() => setActiveTab("generator")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all tap-press cursor-pointer ${
              activeTab === "generator" ? "bg-blue-600 text-white shadow-xs" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Practice Quiz</span>
          </button>
          <button
            onClick={() => setActiveTab("classrooms")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all tap-press cursor-pointer ${
              activeTab === "classrooms" ? "bg-blue-600 text-white shadow-xs" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <School className="w-4 h-4" />
            <span>My Classes</span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all tap-press cursor-pointer ${
              activeTab === "history" ? "bg-blue-600 text-white shadow-xs" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <History className="w-4 h-4" />
            <span>Quiz History</span>
          </button>
        </div>

        {/* TAB 1: AI GENERATOR */}
        {activeTab === "generator" && (
          <div className="bg-white p-6 sm:p-10 rounded-3xl border border-gray-200/80 shadow-xs max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Generate Instant Study Assessment</h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload your study materials, lecture slides, or paste a YouTube lesson to practice immediately.
              </p>
            </div>

            {message && (
              <div className="p-3.5 mb-6 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-200">
                {message}
              </div>
            )}

            <form onSubmit={handleGenerateSelfStudy} className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  1. Choose Material Source
                </label>
                <div className="grid grid-cols-3 gap-2 bg-gray-100 p-1.5 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setInputType("document");
                      clearImageSelection();
                    }}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all tap-press cursor-pointer min-h-[44px] ${
                      inputType === "document" ? "bg-white text-blue-600 shadow-xs" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span>Slides & Docs</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputType("youtube");
                      clearImageSelection();
                    }}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all tap-press cursor-pointer min-h-[44px] ${
                      inputType === "youtube" ? "bg-white text-rose-600 shadow-xs" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    <Video className="w-4 h-4" />
                    <span>YouTube URL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputType("snap");
                      clearImageSelection();
                    }}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all tap-press cursor-pointer min-h-[44px] ${
                      inputType === "snap" ? "bg-white text-indigo-600 shadow-xs" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Snap & Quiz</span>
                  </button>
                </div>
              </div>

              {/* Source Inputs */}
              {inputType === "document" && (
                <div className="p-4 sm:p-5 bg-gradient-to-br from-blue-50/60 via-indigo-50/40 to-purple-50/30 rounded-2xl border-2 border-dashed border-blue-200/90 transition-all hover:border-blue-400">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-blue-950">
                      Upload PowerPoint Slides or Documents
                    </label>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full w-fit">
                      Universal Course Ingestion
                    </span>
                  </div>

                  {/* Format Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px] font-semibold">
                    <span className="px-2 py-0.5 rounded-md bg-orange-100/90 text-orange-800 border border-orange-200/80 flex items-center gap-1">
                      📊 PowerPoint (.pptx, .ppt)
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-red-100/90 text-red-800 border border-red-200/80 flex items-center gap-1">
                      📄 PDF (Pages & Scanned OCR)
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-blue-100/90 text-blue-800 border border-blue-200/80 flex items-center gap-1">
                      📝 Word (.docx, .doc)
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100/90 text-emerald-800 border border-emerald-200/80 flex items-center gap-1">
                      📋 Plain Text, RTF & Markdown
                    </span>
                  </div>

                  <input
                    type="file"
                    multiple
                    accept=".pdf,.pptx,.ppt,.docx,.doc,.txt,.text,.md,.rtf,.csv,.tsv,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/rtf,text/csv"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-extrabold file:bg-blue-600 file:text-white hover:file:bg-blue-700 transition-all cursor-pointer bg-white p-2 rounded-xl border border-gray-200 shadow-xs"
                  />
                  {selectedFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {selectedFiles.map((sf) => {
                        const isSlide = sf.file.name.toLowerCase().endsWith(".pptx") || sf.file.name.toLowerCase().endsWith(".ppt");
                        const isWord = sf.file.name.toLowerCase().endsWith(".docx") || sf.file.name.toLowerCase().endsWith(".doc");
                        const isPdf = sf.file.name.toLowerCase().endsWith(".pdf");

                        return (
                          <div key={sf.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white rounded-xl border border-gray-200 gap-2 shadow-xs">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className="text-base shrink-0">
                                {isSlide ? "📊" : isWord ? "📝" : isPdf ? "📄" : "📋"}
                              </span>
                              <div className="flex flex-col overflow-hidden">
                                <span className="text-xs font-bold text-gray-900 truncate max-w-[220px] sm:max-w-xs">{sf.file.name}</span>
                                <span className="text-[10px] text-gray-400 font-medium">
                                  {isSlide ? "PowerPoint Presentation" : isWord ? "Word Document" : isPdf ? "PDF Document" : "Text Document"}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {sf.isAnalyzing ? (
                                <span className="text-xs text-blue-600 animate-pulse font-medium">Analyzing slides/pages...</span>
                              ) : sf.totalPages ? (
                                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200">
                                  <span className="font-bold text-indigo-700">
                                    {isSlide ? "Slides:" : "Pages:"}
                                  </span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={sf.endPage}
                                    value={sf.startPage}
                                    onChange={(e) => updateRange(sf.id, "startPage", parseInt(e.target.value) || 1)}
                                    className="w-12 px-1.5 py-0.5 border rounded-lg text-center font-bold bg-white"
                                  />
                                  <span>to</span>
                                  <input
                                    type="number"
                                    min={sf.startPage}
                                    max={sf.totalPages}
                                    value={sf.endPage}
                                    onChange={(e) => updateRange(sf.id, "endPage", parseInt(e.target.value) || sf.totalPages!)}
                                    className="w-12 px-1.5 py-0.5 border rounded-lg text-center font-bold bg-white"
                                  />
                                  <span className="text-gray-500 font-bold">
                                    ({sf.totalPages} {isSlide ? "slides" : "pages"})
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">Full doc</span>
                              )}
                              <button
                                type="button"
                                onClick={() => removeFile(sf.id)}
                                className="p-1 text-gray-400 hover:text-rose-600 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {inputType === "youtube" && (
                <div className="p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-300 space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Paste YouTube Lecture URL
                  </label>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 font-medium text-sm"
                  />
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-600 pt-1">
                    <span>Segment (Minutes):</span>
                    <input
                      type="number"
                      min={0}
                      value={ytStartMin}
                      onChange={(e) => setYtStartMin(parseInt(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border rounded-lg text-center font-bold"
                    />
                    <span>to</span>
                    <input
                      type="number"
                      min={ytStartMin}
                      value={ytEndMin}
                      onChange={(e) => setYtEndMin(parseInt(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border rounded-lg text-center font-bold"
                    />
                    <span className="text-gray-400">(0 = full video)</span>
                  </div>
                </div>
              )}

              {inputType === "snap" && (
                <div className="p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-300 space-y-3 text-center">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Snap Question or Textbook Page
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                    id="snap-camera-input"
                  />
                  <label
                    htmlFor="snap-camera-input"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm transition-all"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Take Photo / Upload Picture</span>
                  </label>
                  {imagePreview && (
                    <div className="mt-3 inline-block relative border-2 border-indigo-200 rounded-xl overflow-hidden shadow-xs">
                      <img src={imagePreview} alt="Snapshot preview" className="max-h-48 rounded-lg object-contain" />
                      <button
                        type="button"
                        onClick={clearImageSelection}
                        className="absolute top-2 right-2 p-1 bg-black/60 text-white rounded-full hover:bg-rose-600 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Subject & Exam Metadata Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Subject / Course Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Computer Networks, Linear Algebra, Machine Learning"
                    value={examSubject}
                    onChange={(e) => setExamSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Exam / Goal Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mid Term Exam Preparation (Fall 2024)"
                    value={examTitle}
                    onChange={(e) => setExamTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                  />
                </div>
              </div>

              {/* 🎓 Academic Level & Examination Track Presets */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-indigo-600" />
                    Academic Level & Examination Track
                  </label>
                  <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                    Accredited Academic Standard
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 block mb-1">Academic Tier</label>
                    <div className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-xl border border-gray-200">
                      {[
                        { id: "University", label: "University", icon: "🎓" },
                        { id: "College", label: "College", icon: "🏛️" },
                        { id: "School", label: "School", icon: "🏫" },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setAcademicTier(t.id);
                          }}
                          className={`py-1.5 px-2 text-center rounded-lg text-xs font-bold transition-all ${
                            academicTier === t.id
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          <span>{t.icon}</span> <span className="block sm:inline">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-600 block mb-1">Examination Track</label>
                    <div className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-xl border border-gray-200">
                      {[
                        { id: "Theory", label: "Theory", icon: "🧠" },
                        { id: "Practical", label: "Practical", icon: "💻" },
                        { id: "Standard", label: "Quick", icon: "📝" },
                      ].map((tr) => (
                        <button
                          key={tr.id}
                          type="button"
                          onClick={() => {
                            setExamTrack(tr.id);
                            if (tr.id === "Practical") {
                              setNumMcq(0);
                              setNumFillBlank(0);
                              setNumShort(0);
                              setNumLong(1);
                            } else if (tr.id === "Theory") {
                              setNumMcq(2);
                              setNumFillBlank(0);
                              setNumShort(2);
                              setNumLong(2);
                            } else {
                              setNumMcq(5);
                              setNumFillBlank(2);
                              setNumShort(2);
                              setNumLong(1);
                            }
                          }}
                          className={`py-1.5 px-2 text-center rounded-lg text-xs font-bold transition-all ${
                            examTrack === tr.id
                              ? "bg-slate-900 text-white shadow-sm"
                              : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          <span>{tr.icon}</span> <span className="block sm:inline">{tr.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* College Comprehension Optional Toggle */}
                {academicTier === "College" && (
                  <div className="mb-3 p-2.5 bg-white rounded-xl border border-indigo-100 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Include Reading Comprehension Passage
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Optional: Enable to generate passage + comprehension questions. Leave unchecked for pure definitions, differences & concepts.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeComprehension}
                      onChange={(e) => setIncludeComprehension(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                )}

                <div className="text-[11px] text-slate-500 bg-white/80 p-2.5 rounded-xl border border-slate-200/60 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                  {examTrack === "Practical" ? (
                    <span><strong>Practical Lab Mode:</strong> Formulates 100% pure hands-on implementation tasks with step-by-step sub-parts: <code>a) Setup</code>, <code>b) Ingestion</code>, <code>c) Architecture</code>, <code>d) Tuning</code>, <code>e) Metrics</code>, <code>f) Visualization</code> with sub-mark breakdowns <code>(1 + 2 + 2 + 3 + 2 + 2)</code>.</span>
                  ) : academicTier === "College" ? (
                    <span><strong>College Board Standard:</strong> Tailored for Intermediate board examinations focusing on textbook definitions, comparative differences ("Differentiate between X and Y"), and conceptual reasoning.</span>
                  ) : academicTier === "School" ? (
                    <span><strong>Secondary School Standard:</strong> Formulates direct textbook definitions, core concept exercise questions ("Explore...", "What is meant by..."), and factual knowledge checks.</span>
                  ) : examTrack === "Theory" ? (
                    <span><strong>University Theory Mode:</strong> Generates authentic real-world scenario/case-study problems with concrete parameters, calculation traces, and Course Learning Outcome [CLO-1/2/3] tags.</span>
                  ) : (
                    <span><strong>Quick Practice Mode:</strong> Standard balanced test with MCQs, fill-in-the-blanks, and short questions.</span>
                  )}
                </div>
              </div>

              {/* Preferences */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  2. Question Counts & Difficulty
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">MCQs</label>
                    <input
                      type="number"
                      min={0}
                      max={25}
                      value={numMcq}
                      onChange={(e) => setNumMcq(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-2 border rounded-xl font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Blanks</label>
                    <input
                      type="number"
                      min={0}
                      max={15}
                      value={numFillBlank}
                      onChange={(e) => setNumFillBlank(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-2 border rounded-xl font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Short</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={numShort}
                      onChange={(e) => setNumShort(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-2 border rounded-xl font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Long</label>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={numLong}
                      onChange={(e) => setNumLong(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-2 border rounded-xl font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Difficulty</label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      className="w-full px-2 py-2 border rounded-xl font-bold"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-teal-600 text-white font-extrabold rounded-2xl shadow-lg hover:opacity-95 transition-all tap-press cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Generating Questions with AI...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-white" />
                    <span>Start Practice Assessment</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* TAB 2: MY CLASSROOMS & ASSIGNMENTS */}
        {activeTab === "classrooms" && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Enrolled Classrooms & Assignments</h2>
              <p className="text-sm text-gray-500 mt-1">
                Enter your instructor's join code to join batches and view pending homework quizzes.
              </p>
            </div>

            {/* Join Form */}
            <form onSubmit={handleJoinClass} className="flex gap-3 bg-white p-4 rounded-3xl border border-gray-200/80 shadow-xs">
              <input
                type="text"
                placeholder="Enter 7-Character Join Code (e.g. AB12XY9)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl font-mono text-base font-bold uppercase tracking-wider outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={joining}
                className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all text-sm shadow-xs"
              >
                {joining ? "Joining..." : "Join Class"}
              </button>
            </form>

            {classrooms.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl text-center border border-gray-100">
                <School className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-bold text-gray-600">You haven't joined any classrooms yet.</p>
                <p className="text-xs text-gray-400 mt-1">Ask your teacher for their classroom join code.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {classrooms.map((cl) => (
                  <div key={cl.id} className="bg-white p-6 rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
                    <div className="flex justify-between items-start border-b pb-3">
                      <div>
                        <h3 className="text-lg font-extrabold text-gray-900">{cl.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Instructor: {cl.teacher_name || "Teacher"}</p>
                      </div>
                      <span className="text-xs font-mono font-bold bg-gray-100 px-3 py-1 rounded-full text-gray-600">
                        Code: {cl.join_code}
                      </span>
                    </div>

                    {/* Class Assignments */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                        Assigned Quizzes ({cl.assignments?.length || 0})
                      </h4>

                      {!cl.assignments || cl.assignments.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No pending assignments for this class.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {cl.assignments.map((asgn: any) => (
                            <div
                              key={asgn.id}
                              className="p-4 bg-blue-50/40 border border-blue-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div>
                                <h5 className="font-bold text-sm text-blue-950">{asgn.quiz_title}</h5>
                                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                  <span>{asgn.subject || "Subject"}</span>
                                  <span>•</span>
                                  <span>{asgn.duration_minutes || 30} mins</span>
                                  {asgn.due_date && (
                                    <>
                                      <span>•</span>
                                      <span className="text-amber-700 font-semibold">Due: {asgn.due_date}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {asgn.has_submitted ? (
                                <div className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold shadow-2xs">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <span>Submitted {asgn.submitted_at ? `(${asgn.submitted_at})` : ""}</span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => router.push(`/quiz/${asgn.quiz_id}?assignment_id=${asgn.id}`)}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer tap-press"
                                >
                                  <Play className="w-3.5 h-3.5 fill-white" />
                                  <span>Take Quiz</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PAST ATTEMPT HISTORY */}
        {activeTab === "history" && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Past Quiz Attempts & Performance</h2>
              <p className="text-sm text-gray-500 mt-1">Review your track record across assessments and self-studies.</p>
            </div>

            {attempts.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl text-center border border-gray-100">
                <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-bold text-gray-600">No attempts recorded yet.</p>
                <p className="text-xs text-gray-400 mt-1">Complete a practice quiz to see your performance log here.</p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-extrabold text-gray-500">
                      <tr>
                        <th className="px-6 py-4">Assessment Title</th>
                        <th className="px-6 py-4">Subject</th>
                        <th className="px-6 py-4">Score</th>
                        <th className="px-6 py-4">Percentage</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Paper Export</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {attempts.map((a) => (
                        <tr key={a.id} className="hover:bg-gray-50/60">
                          <td className="px-6 py-4 font-bold text-gray-900">{a.quiz_title}</td>
                          <td className="px-6 py-4 text-gray-600 text-xs">{a.subject || "General"}</td>
                          <td className="px-6 py-4 font-semibold text-gray-800">
                            {a.is_assignment ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                Submitted
                              </span>
                            ) : (
                              `${a.score} / ${a.max_score}`
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {a.is_assignment ? (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                Held by Instructor
                              </span>
                            ) : (
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-black ${
                                  (a.score_percent ?? 0) >= 70
                                    ? "bg-emerald-100 text-emerald-800"
                                    : (a.score_percent ?? 0) >= 50
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {a.score_percent}%
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-400 text-xs">{a.date}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleStudentDownload(a.quiz_id, "pdf")}
                                disabled={exportingId === a.quiz_id}
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Download PDF Exam Paper"
                              >
                                <Download className="w-3 h-3" />
                                <span>PDF</span>
                              </button>
                              <button
                                onClick={() => handleStudentDownload(a.quiz_id, "docx")}
                                disabled={exportingId === a.quiz_id}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Download Word (.docx) Exam Paper"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Word</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* POPUP MODAL */}
      {customPopup.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white max-w-sm w-full p-6 rounded-3xl shadow-xl border border-gray-100 text-center">
            <h3 className="text-lg font-black text-gray-900 mb-2">{customPopup.title}</h3>
            <p className="text-xs text-gray-600 mb-5 leading-relaxed">{customPopup.message}</p>
            <button
              onClick={() => setCustomPopup({ show: false, title: "", message: "", type: "success" })}
              className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl text-xs hover:bg-black transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* GENERATED QUIZ ACTION MODAL */}
      {generatedQuizModal.show && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setGeneratedQuizModal({ show: false, quizId: null, totalQuestions: 0 });
            }
          }}
        >
          <div className="relative bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl border border-gray-100 text-center space-y-4 max-h-[88vh] overflow-y-auto overscroll-contain my-auto">
            {/* Top-right quick close button */}
            <button
              type="button"
              onClick={() => setGeneratedQuizModal({ show: false, quizId: null, totalQuestions: 0 })}
              className="absolute right-4 top-4 p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Assessment Ready</h3>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Your questions have been successfully generated and formatted. Choose your learning mode:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => router.push(`/quiz/${generatedQuizModal.quizId}?mode=study`)}
                className="p-4 sm:p-5 rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/70 hover:border-indigo-400 text-left transition-all group flex flex-col justify-between shadow-xs cursor-pointer tap-press"
              >
                <div className="p-2.5 rounded-xl bg-indigo-600 text-white w-fit mb-2.5 shadow-xs">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-indigo-950 text-sm">Study Mode</h4>
                  <p className="text-xs text-indigo-700/80 mt-1 leading-snug">
                    Review questions with verified answer keys, hints, and detailed explanations.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => router.push(`/quiz/${generatedQuizModal.quizId}?mode=exam`)}
                className="p-4 sm:p-5 rounded-2xl border-2 border-blue-500 bg-blue-50/50 hover:bg-blue-100/70 hover:border-blue-600 text-left transition-all group flex flex-col justify-between shadow-xs cursor-pointer tap-press"
              >
                <div className="p-2.5 rounded-xl bg-blue-600 text-white w-fit mb-2.5 shadow-xs">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-blue-950 text-sm">Live Assessment</h4>
                  <p className="text-xs text-blue-700/80 mt-1 leading-snug">
                    Take timed test with countdown timer and receive instant AI evaluation.
                  </p>
                </div>
              </button>
            </div>

            {/* Official University Paper Download Actions for Students */}
            <div className="pt-2 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl text-left">
              <div>
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-indigo-600 shrink-0" />
                  Official Exam Paper (Print & Practice)
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Download authentic official academic exam paper in Times New Roman with CLOs and marking scheme.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={exportingId === generatedQuizModal.quizId}
                  onClick={() => generatedQuizModal.quizId && handleStudentDownload(generatedQuizModal.quizId, "pdf")}
                  className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF Paper</span>
                </button>
                <button
                  type="button"
                  disabled={exportingId === generatedQuizModal.quizId}
                  onClick={() => generatedQuizModal.quizId && handleStudentDownload(generatedQuizModal.quizId, "docx")}
                  className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Word (.docx)</span>
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setGeneratedQuizModal({ show: false, quizId: null, totalQuestions: 0 })}
                className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors"
              >
                Close & Stay on Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}