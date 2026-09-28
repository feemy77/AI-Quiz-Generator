"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Award,
  Share2,
  BookOpen,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Sparkles,
  HelpCircle,
  Printer,
  Check,
  Play,
  ShieldCheck,
  Lock,
  RefreshCw,
} from "lucide-react";

export default function TakeQuizClient() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const quiz_id = params?.quiz_id || searchParams.get("id");
  const challengeCode = searchParams.get("challenge");
  const modeParam = searchParams.get("mode");
  const assignmentIdParam = searchParams.get("assignment_id");

  const [isMounted, setIsMounted] = useState(false);
  const [quizData, setQuizData] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Classroom Assignment Security States
  const [isAssignment, setIsAssignment] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [assignmentInfo, setAssignmentInfo] = useState<{ classroom_name?: string; teacher_name?: string; assignment_id?: number } | null>(null);
  const [assignmentSubmittedData, setAssignmentSubmittedData] = useState<{ submitted_at: string; message: string } | null>(null);

  // Quiz Mode: "exam" (live assessment) vs "study" (question + answer key viewer)
  const [quizMode, setQuizMode] = useState<"exam" | "study">(modeParam === "study" ? "study" : "exam");
  const [studyData, setStudyData] = useState<any>(null);
  const [loadingStudy, setLoadingStudy] = useState(false);

  // Student's input
  const [studentName, setStudentName] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<any>(null);

  // Urdu Language Script Detection
  const isUrdu = Boolean(
    metadata?.language === "Urdu" ||
    quizData?.language === "Urdu" ||
    /[\u0600-\u06FF]/.test(
      (metadata?.exam_title || "") +
      (quizData?.mcq_questions?.[0]?.question_text || "") +
      (quizData?.short_questions?.[0]?.question_text || "")
    )
  );

  // Gamification & Share States
  const [actionLoading, setActionLoading] = useState(false);
  const [shareData, setShareData] = useState<{ code: string; link: string } | null>(null);
  const [flashcardMsg, setFlashcardMsg] = useState("");

  // Timer States
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Review Filter Tab
  const [reviewFilter, setReviewFilter] = useState<"all" | "incorrect" | "correct">("all");

  // AI Mentor Explanations Cache
  const [aiExplanations, setAiExplanations] = useState<Record<string, { loading: boolean; data?: any; error?: string; open?: boolean }>>({});

  const toggleAiExplanation = async (key: string, question: string, questionType: string, studentAnswer: string, correctAnswer: string, explanation: string = "") => {
    // If already exists, toggle open state
    if (aiExplanations[key]?.data) {
      setAiExplanations((prev) => ({
        ...prev,
        [key]: { ...prev[key], open: !prev[key].open }
      }));
      return;
    }

    setAiExplanations((prev) => ({
      ...prev,
      [key]: { loading: true, open: true }
    }));

    try {
      const { ok, data, error } = await apiFetch("/quiz/explain-question", {
        method: "POST",
        body: JSON.stringify({
          question,
          question_type: questionType,
          student_answer: studentAnswer,
          correct_answer: correctAnswer,
          explanation
        })
      });
      if (ok && data) {
        setAiExplanations((prev) => ({
          ...prev,
          [key]: { loading: false, data, open: true }
        }));
      } else {
        setAiExplanations((prev) => ({
          ...prev,
          [key]: { loading: false, error: error || "Failed to fetch AI explanation.", open: true }
        }));
      }
    } catch {
      setAiExplanations((prev) => ({
        ...prev,
        [key]: { loading: false, error: "Network error connecting to AI Mentor.", open: true }
      }));
    }
  };

  // Question Alternative Swapper States
  const [altExpanded, setAltExpanded] = useState<Record<string, boolean>>({});
  const [swapLoading, setSwapLoading] = useState<string | null>(null);

  const toggleAltExpanded = (key: string) => {
    setAltExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStudentSwap = async (section: string, index: number, altIndex: number) => {
    if (!quiz_id) return;
    const key = `${section}-${index}`;
    setSwapLoading(key);
    try {
      const { ok, data, error } = await apiFetch(`/quiz/${quiz_id}/swap-question`, {
        method: "POST",
        body: JSON.stringify({
          section,
          index,
          action: "select_alternative",
          alternative_index: altIndex,
        }),
      });
      if (ok && data?.quiz_data) {
        setStudyData(data.quiz_data);
        setQuizData(data.quiz_data);
        toast.success("Question swapped with alternative! 🔄");
      } else {
        toast.error(error || "Failed to swap question.");
      }
    } catch {
      toast.error("Network error while swapping question.");
    } finally {
      setSwapLoading(null);
    }
  };

  const handleStudentGenerateAlt = async (section: string, index: number, targetStyle: string) => {
    if (!quiz_id) return;
    const key = `${section}-${index}-${targetStyle}`;
    setSwapLoading(key);
    try {
      const { ok, data, error } = await apiFetch(`/quiz/${quiz_id}/swap-question`, {
        method: "POST",
        body: JSON.stringify({
          section,
          index,
          action: "generate_new",
          target_style: targetStyle,
          difficulty: "Medium",
        }),
      });
      if (ok && data?.quiz_data) {
        setStudyData(data.quiz_data);
        setQuizData(data.quiz_data);
        toast.success(`Generated and swapped to ${targetStyle} question! ✨`);
      } else {
        toast.error(error || "Failed to generate alternative.");
      }
    } catch {
      toast.error("Network error generating alternative.");
    } finally {
      setSwapLoading(null);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    if (quiz_id) fetchQuiz();

    const storedName = localStorage.getItem("name") || "";
    if (storedName) setStudentName(storedName);
  }, [quiz_id]);

  const fetchStudyData = useCallback(async () => {
    if (!quiz_id || isAssignment) return;
    setLoadingStudy(true);
    try {
      const { ok, data, error } = await apiFetch(`/quiz/${quiz_id}/study-mode`);
      if (ok && data) {
        setStudyData(data.quiz_data);
        if (!metadata && data.exam_metadata) {
          setMetadata(data.exam_metadata);
        }
      } else {
        toast.error(error || "Could not load study material.");
      }
    } catch {
      toast.error("Network error loading study mode.");
    } finally {
      setLoadingStudy(false);
    }
  }, [quiz_id, metadata, isAssignment]);

  useEffect(() => {
    if (quizMode === "study" && !studyData && !isAssignment) {
      fetchStudyData();
    }
  }, [quizMode, studyData, isAssignment, fetchStudyData]);

  const fetchQuiz = async () => {
    try {
      const asgnQuery = assignmentIdParam ? `?assignment_id=${assignmentIdParam}` : "";
      const { ok, data, error } = await apiFetch(`/quiz/${quiz_id}${asgnQuery}`);
      if (ok) {
        setQuizData(data.quiz_data);
        setMetadata(data.exam_metadata);

        if (data.is_assignment) {
          setIsAssignment(true);
          setQuizMode("exam"); // Strictly lock to exam mode
        }
        if (data.has_submitted) {
          setHasSubmitted(true);
        }
        if (data.classroom_name || data.teacher_name || data.assignment_id) {
          setAssignmentInfo({
            classroom_name: data.classroom_name,
            teacher_name: data.teacher_name,
            assignment_id: data.assignment_id,
          });
        }

        // Initialize exam timer from duration_minutes
        const durationMin = data.exam_metadata?.duration_minutes || 30;
        setTimeLeft(durationMin * 60);
      } else {
        toast.error(error || "Quiz not found!");
        router.push("/");
      }
    } catch {
      toast.error("Network error fetching quiz.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const submitTest = useCallback(
    async (isAutoSubmit = false) => {
      if (submitting) return;

      const nameToSubmit = studentName.trim() || "Student";
      setSubmitting(true);

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      try {
        const asgnIdToSend = assignmentIdParam ? parseInt(assignmentIdParam) : assignmentInfo?.assignment_id;
        const { ok, data, error } = await apiFetch(`/quiz/${quiz_id}/submit`, {
          method: "POST",
          body: JSON.stringify({
            student_name: nameToSubmit,
            answers: answers,
            challenge_code: challengeCode,
            assignment_id: asgnIdToSend,
          }),
        });

        if (ok) {
          if (data.is_assignment) {
            setAssignmentSubmittedData({
              submitted_at: data.submitted_at || new Date().toLocaleString(),
              message: data.message || "Assignment submitted successfully!",
            });
            toast.success("Assignment submitted to instructor successfully!");
          } else {
            setResults(data.results);
            if (isAutoSubmit) {
              toast.info("⏰ Time is up! Your answers were automatically submitted and graded.", { duration: 6000 });
            } else {
              toast.success("Exam submitted successfully!");
            }
          }
        } else {
          toast.error(`Failed to submit: ${error}`);
        }
      } catch {
        toast.error("Error submitting test. Please verify connection.");
      } finally {
        setSubmitting(false);
      }
    },
    [answers, challengeCode, quiz_id, studentName, submitting, assignmentIdParam, assignmentInfo]
  );

  // Countdown Timer Effect (only running during live exam)
  useEffect(() => {
    if (timeLeft === null || results || quizMode === "study") return;

    if (timeLeft <= 0) {
      submitTest(true);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft, results, quizMode, submitTest]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      toast.warning("Please enter your name before submitting.");
      return;
    }
    submitTest(false);
  };

  const handleReturnDashboard = () => {
    const role = localStorage.getItem("role");
    if (role === "student") {
      router.push("/student-dashboard");
    } else if (role === "teacher" || role === "admin") {
      router.push("/teacher-dashboard");
    } else {
      router.push("/");
    }
  };

  const handleCreateChallenge = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.warning("Please login first to challenge a friend!");
      return;
    }
    setActionLoading(true);
    try {
      const { ok, data } = await apiFetch("/challenge/create", {
        method: "POST",
        body: JSON.stringify({ quiz_id: parseInt(quiz_id as string) }),
      });
      if (ok) {
        const link = `${window.location.origin}/quiz/${quiz_id}?challenge=${data.code}`;
        setShareData({ code: data.code, link: link });
        toast.success("Challenge created! Share link generated.");
      }
    } catch {
      toast.error("Failed to create challenge.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleShare = async () => {
    if (!shareData) return;
    const shareText = `I scored ${results.total_score}/${results.max_score} in this Assessment! Can you beat my score? Join using my link:`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "AI Quiz Challenge",
          text: shareText,
          url: shareData.link,
        });
      } catch {
        // User canceled share
      }
    } else {
      navigator.clipboard.writeText(`${shareText}\n\n${shareData.link}`);
      toast.success("Link copied to clipboard! Share it with your friends.");
    }
  };

  const handleCreateFlashcards = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.warning("Please login first to create flashcards!");
      return;
    }
    setActionLoading(true);
    try {
      const { ok, data } = await apiFetch(`/quiz/${quiz_id}/flashcards`, {
        method: "POST",
      });
      if (ok) {
        setFlashcardMsg(data.message || "Flashcards generated! Check your dashboard.");
        toast.success("Flashcards generated! Check your dashboard.");
      }
    } catch {
      toast.error("Failed to create flashcards.");
    } finally {
      setActionLoading(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isMounted) return null;
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-700">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="font-semibold text-lg">Loading Quiz Environment...</p>
      </div>
    );
  }

  const totalExamQuestions =
    (quizData?.mcq_questions?.length || 0) +
    (quizData?.fill_blank_questions?.length || 0) +
    (quizData?.short_questions?.length || 0) +
    (quizData?.long_questions?.length || 0);

  const answeredCount = Object.values(answers).filter(
    (val) => typeof val === "string" && val.trim().length > 0
  ).length;

  const progressPercentage =
    totalExamQuestions > 0 ? Math.min(100, Math.round((answeredCount / totalExamQuestions) * 100)) : 0;

  // ==========================================
  // VIEW: SINGLE-ATTEMPT LOCK SCREEN (ALREADY SUBMITTED)
  // ==========================================
  if (hasSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-lg w-full p-8 rounded-3xl border border-gray-200 shadow-xl text-center space-y-5">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner border border-amber-100">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Assignment Already Completed</h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              You have already completed and submitted your examination for{" "}
              <strong className="text-gray-800 font-bold">{assignmentInfo?.classroom_name || "this classroom"}</strong>
              {assignmentInfo?.teacher_name ? ` under instructor ${assignmentInfo.teacher_name}` : ""}.
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 text-xs text-gray-600 text-left space-y-2">
            <div className="flex justify-between">
              <span className="font-semibold text-gray-500">Policy:</span>
              <span className="font-bold text-gray-800">Strict Single-Attempt Examination</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-gray-500">Status:</span>
              <span className="font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Delivered to Instructor
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-gray-500">Candidate:</span>
              <span className="font-bold text-gray-800">{studentName || "Enrolled Student"}</span>
            </div>
          </div>
          <button
            onClick={() => router.push("/student-dashboard")}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer tap-press"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to My Classes</span>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: FORMAL ASSIGNMENT SUBMISSION CONFIRMATION (CONFIDENTIAL)
  // ==========================================
  if (assignmentSubmittedData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-lg w-full p-8 rounded-3xl border border-gray-200 shadow-xl text-center space-y-6 animate-fade-in">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner border border-emerald-100">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <div>
            <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-extrabold mb-2 uppercase tracking-wider">
              Delivered Successfully
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Assignment Submitted</h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              Your responses have been securely recorded and sent to your instructor for formal evaluation.
            </p>
          </div>

          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 text-xs text-slate-700 text-left space-y-2.5">
            <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
              <span className="font-semibold text-slate-500">Classroom:</span>
              <span className="font-bold text-slate-900">{assignmentInfo?.classroom_name || "Academic Classroom"}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
              <span className="font-semibold text-slate-500">Instructor:</span>
              <span className="font-bold text-slate-900">{assignmentInfo?.teacher_name || "Course Instructor"}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
              <span className="font-semibold text-slate-500">Candidate:</span>
              <span className="font-bold text-slate-900">{studentName || "Student"}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
              <span className="font-semibold text-slate-500">Submitted At:</span>
              <span className="font-mono text-slate-800">{assignmentSubmittedData.submitted_at}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-500">Questions Answered:</span>
              <span className="font-bold text-emerald-700">{answeredCount} of {totalExamQuestions} Questions</span>
            </div>
          </div>

          <div className="p-3.5 bg-amber-50/60 rounded-xl text-xs text-amber-900 border border-amber-200/80 text-left flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Official Exam Policy:</strong> In accordance with examination confidentiality, marks and model answer keys are withheld. Your instructor will grade your submission and release results on your classroom dashboard.
            </p>
          </div>

          <button
            onClick={() => router.push("/student-dashboard")}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer tap-press"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to My Classes</span>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: POST-SUBMISSION RESULTS & IN-DEPTH REVIEW (PRACTICE / SELF-STUDY QUIZZES ONLY)
  // ==========================================
  if (results) {
    const pct = Number(((results.total_score / (results.max_score || 1)) * 100).toFixed(1));
    const isPassing = pct >= 50;

    // Smart Grade Calculation
    const getGradeInfo = (p: number) => {
      if (p >= 90) return { grade: "A+", label: "Mastery Level 🌟", color: "emerald", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      if (p >= 80) return { grade: "A", label: "Distinction 🚀", color: "blue", bg: "bg-blue-50 text-blue-700 border-blue-200" };
      if (p >= 70) return { grade: "B", label: "Proficient 👏", color: "indigo", bg: "bg-indigo-50 text-indigo-700 border-indigo-200" };
      if (p >= 60) return { grade: "C", label: "Satisfactory 👍", color: "amber", bg: "bg-amber-50 text-amber-700 border-amber-200" };
      if (p >= 50) return { grade: "D", label: "Passing ⚠️", color: "orange", bg: "bg-orange-50 text-orange-700 border-orange-200" };
      return { grade: "F", label: "Needs Revision 💡", color: "rose", bg: "bg-rose-50 text-rose-700 border-rose-200" };
    };

    const gradeInfo = getGradeInfo(pct);

    // Section Analytics Calculations
    const mcqTotal = results.mcq?.length || 0;
    const mcqCorrect = results.mcq?.filter((q: any) => q.is_correct).length || 0;
    const mcqPct = mcqTotal > 0 ? Math.round((mcqCorrect / mcqTotal) * 100) : 0;

    const fbTotal = results.fill_blank?.length || 0;
    const fbCorrect = results.fill_blank?.filter((q: any) => q.is_correct).length || 0;
    const fbPct = fbTotal > 0 ? Math.round((fbCorrect / fbTotal) * 100) : 0;

    const shortTotal = results.short?.length || 0;
    const shortMaxMarks = shortTotal * 2;
    const shortEarnedMarks = results.short?.reduce((acc: number, q: any) => acc + ((q.score_percent || 0) / 100) * 2, 0) || 0;
    const shortPct = shortMaxMarks > 0 ? Math.round((shortEarnedMarks / shortMaxMarks) * 100) : 0;

    const longTotal = results.long?.length || 0;
    const longMaxMarks = results.long?.reduce((acc: number, q: any) => acc + (q.marks || 6), 0) || 0;
    const longEarnedMarks = results.long?.reduce((acc: number, q: any) => acc + ((q.score_percent || 0) / 100) * (q.marks || 6), 0) || 0;
    const longPct = longMaxMarks > 0 ? Math.round((longEarnedMarks / longMaxMarks) * 100) : 0;

    // Circumference for r=50 circle: 2 * pi * 50 = 314.159
    const circleDashoffset = 314.16 - (314.16 * Math.min(100, Math.max(0, pct))) / 100;

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 via-slate-50 to-blue-50/20 p-4 sm:p-8 text-gray-900">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* ========================================== */}
          {/* 🌟 SMART RESULT ANALYTICS HERO CARD */}
          {/* ========================================== */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden">
            <div
              className={`absolute top-0 left-0 right-0 h-3 ${
                isPassing ? "bg-gradient-to-r from-emerald-500 to-teal-500" : "bg-gradient-to-r from-amber-500 to-rose-500"
              }`}
            />

            <div className="flex flex-col md:flex-row items-center justify-between gap-8 pt-2">
              {/* Left Column: Greeting & Summary */}
              <div className="text-center md:text-left space-y-3 flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border shadow-2xs bg-blue-50 text-blue-700 border-blue-200">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>AI Multimodal Evaluation Completed</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                  Assessment Report
                </h1>
                <p className="text-gray-500 text-sm leading-relaxed max-w-lg">
                  Candidate: <strong className="text-gray-800 font-bold">{studentName || "Student"}</strong>.
                  {pct >= 75
                    ? " Outstanding performance! You demonstrated comprehensive mastery across topics."
                    : pct >= 50
                    ? " Good job! You passed the assessment, with specific topics identified for revision below."
                    : " Needs review. Check the AI Tutor explanations below to solidify core concepts."}
                </p>

                <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                  <div className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200/80 flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-bold uppercase">Evaluated Score:</span>
                    <span className="text-lg font-black text-blue-600">{results.total_score}</span>
                    <span className="text-xs text-gray-400">/</span>
                    <span className="text-sm font-bold text-gray-700">{results.max_score} Marks</span>
                  </div>

                  <span className={`px-4 py-2 rounded-xl text-xs font-black border ${gradeInfo.bg}`}>
                    Grade: {gradeInfo.grade} ({gradeInfo.label})
                  </span>
                </div>
              </div>

              {/* Right Column: Animated Radial Donut Gauge */}
              <div className="flex flex-col items-center justify-center shrink-0">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="w-36 h-36 transform -rotate-90">
                    <circle
                      cx="72"
                      cy="72"
                      r="50"
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-gray-100"
                      fill="transparent"
                    />
                    <circle
                      cx="72"
                      cy="72"
                      r="50"
                      stroke="currentColor"
                      strokeWidth="10"
                      strokeDasharray={314.16}
                      strokeDashoffset={circleDashoffset}
                      strokeLinecap="round"
                      className={`transition-all duration-1000 ease-out ${
                        pct >= 75 ? "text-emerald-500" : pct >= 50 ? "text-blue-500" : "text-rose-500"
                      }`}
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-black text-gray-900 tracking-tight">{pct}%</span>
                    <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Overall</span>
                  </div>
                </div>
              </div>
            </div>

            {challengeCode && (
              <div className="mt-6 inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-2.5 rounded-xl text-xs font-semibold w-full">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Challenge session recorded! Your results are live on the classroom leaderboard.</span>
              </div>
            )}
          </div>

          {/* ========================================== */}
          {/* 📊 SECTION PERFORMANCE BREAKDOWN CARDS */}
          {/* ========================================== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* MCQ Card */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                <span>Multiple Choice</span>
                <span className="text-blue-600 font-extrabold">{mcqPct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-700" style={{ width: `${mcqPct}%` }} />
              </div>
              <div className="text-[11px] text-gray-500 flex justify-between">
                <span>{mcqCorrect} of {mcqTotal} Correct</span>
                <span className="font-semibold text-gray-700">{mcqCorrect}/{mcqTotal} Marks</span>
              </div>
            </div>

            {/* Fill Blanks Card */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                <span>Fill in Blanks</span>
                <span className="text-purple-600 font-extrabold">{fbPct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="bg-purple-600 h-2 rounded-full transition-all duration-700" style={{ width: `${fbPct}%` }} />
              </div>
              <div className="text-[11px] text-gray-500 flex justify-between">
                <span>{fbCorrect} of {fbTotal} Correct</span>
                <span className="font-semibold text-gray-700">{fbCorrect}/{fbTotal} Marks</span>
              </div>
            </div>

            {/* Short Questions Card */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                <span>Short Answers</span>
                <span className="text-indigo-600 font-extrabold">{shortPct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="bg-indigo-600 h-2 rounded-full transition-all duration-700" style={{ width: `${shortPct}%` }} />
              </div>
              <div className="text-[11px] text-gray-500 flex justify-between">
                <span>{shortEarnedMarks.toFixed(1)} / {shortMaxMarks} Marks</span>
                <span className="font-semibold text-gray-700">{shortTotal} Questions</span>
              </div>
            </div>

            {/* Long Questions Card */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                <span>Long & Analytical</span>
                <span className="text-emerald-600 font-extrabold">{longPct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-600 h-2 rounded-full transition-all duration-700" style={{ width: `${longPct}%` }} />
              </div>
              <div className="text-[11px] text-gray-500 flex justify-between">
                <span>{longEarnedMarks.toFixed(1)} / {longMaxMarks} Marks</span>
                <span className="font-semibold text-gray-700">{longTotal} Questions</span>
              </div>
            </div>
          </div>

          {/* ========================================== */}
          {/* 🎯 DIAGNOSTIC STRENGTHS & FOCUS AREAS */}
          {/* ========================================== */}
          <div className="bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/20 p-5 rounded-3xl border border-blue-100 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Smart Diagnostic Insights</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white/90 rounded-2xl border border-emerald-100 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-emerald-950 block font-bold mb-0.5">Key Strengths Identified:</strong>
                  <p className="text-emerald-800 leading-relaxed">
                    {mcqPct >= 80
                      ? "Outstanding grasp on core factual definitions and objective concept identification."
                      : shortPct >= 70
                      ? "Solid understanding of analytical concepts and succinct technical formulations."
                      : "Good effort across multiple question categories; fundamentals are in place."}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-white/90 rounded-2xl border border-amber-100 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-950 block font-bold mb-0.5">Recommended Revision Area:</strong>
                  <p className="text-amber-800 leading-relaxed">
                    {longPct < 60 && longTotal > 0
                      ? "Focus on descriptive answers: include all necessary key points and structural clarity."
                      : fbPct < 70 && fbTotal > 0
                      ? "Carefully verify terminology and spelling in fill-in-the-blank items."
                      : "Click 'Explain with AI Mentor' on any missed questions below for 1-on-1 tutoring!"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Quick Links */}
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!shareData ? (
                <button
                  onClick={handleCreateChallenge}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2.5 p-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-2xl border border-indigo-200/60 transition-all text-xs cursor-pointer tap-press"
                >
                  <Share2 className="w-4 h-4 text-indigo-600" />
                  <span>Challenge a Friend (Live Link)</span>
                </button>
              ) : (
                <button
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2.5 p-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-sm transition-all text-xs cursor-pointer tap-press"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share Challenge Link</span>
                </button>
              )}

              <button
                onClick={handleCreateFlashcards}
                disabled={actionLoading || !!flashcardMsg}
                className={`flex items-center justify-center gap-2.5 p-3.5 rounded-2xl font-bold border transition-all text-xs cursor-pointer tap-press ${
                  flashcardMsg
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200/60"
                }`}
              >
                <BookOpen className="w-4 h-4 text-purple-600" />
                <span>{flashcardMsg ? "Flashcards Added to Dashboard! ✅" : "Generate Spaced Flashcards"}</span>
              </button>
            </div>
          </div>

          {/* ========================================== */}
          {/* DETAILED QUESTION-BY-QUESTION REVIEW */}
          {/* ========================================== */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5 mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Question-by-Question Review</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Examine your answers, correct solutions, and AI constructive feedback.
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="inline-flex p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setReviewFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    reviewFilter === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  All ({results.max_score || totalExamQuestions})
                </button>
                <button
                  onClick={() => setReviewFilter("incorrect")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    reviewFilter === "incorrect" ? "bg-white text-rose-700 shadow-sm" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  Incorrect Only
                </button>
                <button
                  onClick={() => setReviewFilter("correct")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    reviewFilter === "correct" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  Correct Only
                </button>
              </div>
            </div>

            {/* Section A: MCQs Review */}
            {results.mcq && results.mcq.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-black text-blue-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span>Multiple Choice Questions</span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px]">1 Mark Each</span>
                </h3>
                <div className="space-y-4">
                  {results.mcq
                    .filter((q: any) =>
                      reviewFilter === "all" ? true : reviewFilter === "correct" ? q.is_correct : !q.is_correct
                    )
                    .map((q: any, i: number) => {
                      const expKey = `mcq-${i}`;
                      const expState = aiExplanations[expKey];

                      return (
                        <div
                          key={i}
                          className={`p-5 rounded-2xl border transition-all ${
                            q.is_correct ? "border-emerald-200 bg-emerald-50/20" : "border-rose-200 bg-rose-50/20"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <span className="font-bold text-sm text-gray-900">
                              Q{i + 1}. {q.question}
                            </span>
                            {q.is_correct ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Correct (+1)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 shrink-0">
                                <XCircle className="w-3.5 h-3.5" /> Incorrect (+0)
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
                            <div className="p-3 bg-white rounded-xl border border-gray-100">
                              <span className="text-[10px] font-bold text-gray-400 block mb-1 uppercase tracking-wider">Your Answer</span>
                              <span className={q.is_correct ? "font-bold text-emerald-700" : "font-bold text-rose-600"}>
                                {q.selected || "(Not Attempted)"}
                              </span>
                            </div>
                            <div className="p-3 bg-white rounded-xl border border-gray-100">
                              <span className="text-[10px] font-bold text-gray-400 block mb-1 uppercase tracking-wider">Correct Answer</span>
                              <span className="font-bold text-emerald-700">{q.correct_answer}</span>
                            </div>
                          </div>

                          {q.explanation && (
                            <div className="p-3 bg-blue-50/60 rounded-xl text-xs text-blue-900 border border-blue-100 flex items-start gap-2 mb-2">
                              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                              <span>
                                <strong>Explanation:</strong> {q.explanation}
                              </span>
                            </div>
                          )}

                          {/* AI Mentor Deep Explanation Trigger */}
                          <div className="mt-3 pt-2 border-t border-gray-200/60">
                            <button
                              type="button"
                              onClick={() => toggleAiExplanation(expKey, q.question, "MCQ", q.selected || "", q.correct_answer, q.explanation || "")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-all cursor-pointer tap-press"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{expState?.open ? "Hide AI Mentor Explanation" : "Explain with AI Mentor 🪄"}</span>
                            </button>

                            {expState?.open && (
                              <div className="mt-3 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-xs space-y-2 animate-fade-in">
                                {expState.loading ? (
                                  <div className="flex items-center gap-2 text-indigo-700 font-semibold py-2">
                                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                    <span>AI Mentor is synthesizing personalized explanation...</span>
                                  </div>
                                ) : expState.data ? (
                                  <div className="space-y-2 text-indigo-950">
                                    <div className="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                                      <Award className="w-4 h-4 text-indigo-600" />
                                      <span>Takeaway: {expState.data.summary}</span>
                                    </div>
                                    <p className="leading-relaxed bg-white/80 p-3 rounded-xl border border-indigo-100 text-gray-800">
                                      {expState.data.detailed_explanation}
                                    </p>
                                    {expState.data.common_misconception && (
                                      <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200 text-amber-900">
                                        <strong className="block mb-0.5 text-[11px]">⚠️ Common Pitfall:</strong>
                                        <span>{expState.data.common_misconception}</span>
                                      </div>
                                    )}
                                    {expState.data.pro_tip && (
                                      <div className="p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-200 text-emerald-900">
                                        <strong className="block mb-0.5 text-[11px]">💡 Pro Exam Tip:</strong>
                                        <span>{expState.data.pro_tip}</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-rose-600">{expState.error || "Explanation unavailable."}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Section B: Fill in the Blank Review */}
            {results.fill_blank && results.fill_blank.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-black text-purple-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span>Fill in the Blanks</span>
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px]">1 Mark Each</span>
                </h3>
                <div className="space-y-4">
                  {results.fill_blank
                    .filter((q: any) =>
                      reviewFilter === "all" ? true : reviewFilter === "correct" ? q.is_correct : !q.is_correct
                    )
                    .map((q: any, i: number) => {
                      const expKey = `fb-${i}`;
                      const expState = aiExplanations[expKey];

                      return (
                        <div
                          key={i}
                          className={`p-5 rounded-2xl border transition-all ${
                            q.is_correct ? "border-emerald-200 bg-emerald-50/20" : "border-rose-200 bg-rose-50/20"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <span className="font-bold text-sm text-gray-900">
                              Q{i + 1}. {q.question}
                            </span>
                            {q.is_correct ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Correct (+1)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 shrink-0">
                                <XCircle className="w-3.5 h-3.5" /> Incorrect (+0)
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
                            <div className="p-3 bg-white rounded-xl border border-gray-100">
                              <span className="text-[10px] font-bold text-gray-400 block mb-1 uppercase tracking-wider">Your Answer</span>
                              <span className={q.is_correct ? "font-bold text-emerald-700" : "font-bold text-rose-600"}>
                                {q.student_answer || "(Left Blank)"}
                              </span>
                            </div>
                            <div className="p-3 bg-white rounded-xl border border-gray-100">
                              <span className="text-[10px] font-bold text-gray-400 block mb-1 uppercase tracking-wider">Correct Answer</span>
                              <span className="font-bold text-emerald-700">{q.correct_answer}</span>
                            </div>
                          </div>

                          {q.explanation && (
                            <div className="p-3 bg-purple-50/60 rounded-xl text-xs text-purple-900 border border-purple-100 flex items-start gap-2 mb-2">
                              <HelpCircle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                              <span>
                                <strong>Explanation:</strong> {q.explanation}
                              </span>
                            </div>
                          )}

                          {/* AI Mentor Trigger */}
                          <div className="mt-3 pt-2 border-t border-gray-200/60">
                            <button
                              type="button"
                              onClick={() => toggleAiExplanation(expKey, q.question, "FillBlank", q.student_answer || "", q.correct_answer, q.explanation || "")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-all cursor-pointer tap-press"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{expState?.open ? "Hide AI Mentor Explanation" : "Explain with AI Mentor 🪄"}</span>
                            </button>

                            {expState?.open && (
                              <div className="mt-3 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-xs space-y-2 animate-fade-in">
                                {expState.loading ? (
                                  <div className="flex items-center gap-2 text-indigo-700 font-semibold py-2">
                                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                    <span>AI Mentor is synthesizing personalized explanation...</span>
                                  </div>
                                ) : expState.data ? (
                                  <div className="space-y-2 text-indigo-950">
                                    <div className="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                                      <Award className="w-4 h-4 text-indigo-600" />
                                      <span>Takeaway: {expState.data.summary}</span>
                                    </div>
                                    <p className="leading-relaxed bg-white/80 p-3 rounded-xl border border-indigo-100 text-gray-800">
                                      {expState.data.detailed_explanation}
                                    </p>
                                    {expState.data.common_misconception && (
                                      <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200 text-amber-900">
                                        <strong className="block mb-0.5 text-[11px]">⚠️ Common Pitfall:</strong>
                                        <span>{expState.data.common_misconception}</span>
                                      </div>
                                    )}
                                    {expState.data.pro_tip && (
                                      <div className="p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-200 text-emerald-900">
                                        <strong className="block mb-0.5 text-[11px]">💡 Pro Exam Tip:</strong>
                                        <span>{expState.data.pro_tip}</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-rose-600">{expState.error || "Explanation unavailable."}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Section C: Short & Long Answer AI Feedback (Rich Evaluator) */}
            {((results.short && results.short.length > 0) || (results.long && results.long.length > 0)) && (
              <div>
                <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span>Descriptive & Analytical Questions</span>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px]">AI Evaluated with Rubric</span>
                </h3>
                <div className="space-y-5">
                  {[...(results.short || []), ...(results.long || [])].map((q: any, i: number) => {
                    const score = q.score_percent || 0;
                    const expKey = `desc-${i}`;
                    const expState = aiExplanations[expKey];

                    return (
                      <div key={i} className="p-5 sm:p-6 rounded-3xl border border-indigo-100 bg-indigo-50/20 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-bold text-sm text-gray-900">
                            Q{i + 1}. {q.question}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black shrink-0 ${
                              score >= 70
                                ? "bg-emerald-100 text-emerald-800"
                                : score >= 40
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            AI Evaluation: {score}%
                          </span>
                        </div>

                        {/* Side by side: Student answer vs Reference Answer */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-3.5 bg-white rounded-2xl border border-gray-100 space-y-1">
                            <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Candidate Written Answer</span>
                            <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{q.student_answer || "(No Answer Submitted)"}</p>
                          </div>
                          <div className="p-3.5 bg-white rounded-2xl border border-gray-100 space-y-1">
                            <span className="text-[10px] font-bold text-emerald-600 block uppercase tracking-wider">Reference Model Solution</span>
                            <p className="text-emerald-900 whitespace-pre-wrap font-medium leading-relaxed">{q.model_answer}</p>
                          </div>
                        </div>

                        {/* Strengths & Missing Key Points (Rich AI Evaluator) */}
                        {((q.strengths && q.strengths.length > 0) || (q.missed_points && q.missed_points.length > 0)) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            {q.strengths && q.strengths.length > 0 && (
                              <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-200">
                                <span className="font-bold text-emerald-900 flex items-center gap-1 mb-1.5 text-[11px]">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Demonstrated Strengths</span>
                                </span>
                                <ul className="space-y-1 text-emerald-800 list-disc list-inside">
                                  {q.strengths.map((s: string, sIdx: number) => (
                                    <li key={sIdx}>{s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {q.missed_points && q.missed_points.length > 0 && (
                              <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200">
                                <span className="font-bold text-amber-900 flex items-center gap-1 mb-1.5 text-[11px]">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Concepts to Improve</span>
                                </span>
                                <ul className="space-y-1 text-amber-800 list-disc list-inside">
                                  {q.missed_points.map((m: string, mIdx: number) => (
                                    <li key={mIdx}>{m}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {q.feedback && (
                          <div className="p-3.5 bg-white rounded-2xl text-xs text-indigo-950 border border-indigo-200 flex items-start gap-2.5 shadow-2xs">
                            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                            <div>
                              <strong className="block text-indigo-900 mb-0.5 font-bold">Examiner Constructive Feedback:</strong>
                              <p className="leading-relaxed text-gray-700">{q.feedback}</p>
                            </div>
                          </div>
                        )}

                        {/* AI Mentor Deep Explanation Trigger */}
                        <div className="pt-2 border-t border-gray-200/60">
                          <button
                            type="button"
                            onClick={() => toggleAiExplanation(expKey, q.question, "Descriptive", q.student_answer || "", q.model_answer, q.feedback || "")}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-all cursor-pointer tap-press"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{expState?.open ? "Hide AI Mentor Explanation" : "Explain with AI Mentor 🪄"}</span>
                          </button>

                          {expState?.open && (
                            <div className="mt-3 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-xs space-y-2 animate-fade-in">
                              {expState.loading ? (
                                <div className="flex items-center gap-2 text-indigo-700 font-semibold py-2">
                                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                  <span>AI Mentor is synthesizing personalized explanation...</span>
                                </div>
                              ) : expState.data ? (
                                <div className="space-y-2 text-indigo-950">
                                  <div className="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                                    <Award className="w-4 h-4 text-indigo-600" />
                                    <span>Takeaway: {expState.data.summary}</span>
                                  </div>
                                  <p className="leading-relaxed bg-white/80 p-3 rounded-xl border border-indigo-100 text-gray-800">
                                    {expState.data.detailed_explanation}
                                  </p>
                                  {expState.data.common_misconception && (
                                    <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200 text-amber-900">
                                      <strong className="block mb-0.5 text-[11px]">⚠️ Common Pitfall:</strong>
                                      <span>{expState.data.common_misconception}</span>
                                    </div>
                                  )}
                                  {expState.data.pro_tip && (
                                    <div className="p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-200 text-emerald-900">
                                      <strong className="block mb-0.5 text-[11px]">💡 Pro Exam Tip:</strong>
                                      <span>{expState.data.pro_tip}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-rose-600">{expState.error || "Explanation unavailable."}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>


          <div className="flex flex-col sm:flex-row gap-3 no-print">
            <button
              onClick={() => window.print()}
              className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all text-white rounded-2xl font-bold text-base shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="w-5 h-5" />
              <span>Print / Save Official Report Card</span>
            </button>
            <button
              onClick={handleReturnDashboard}
              className="flex-1 py-4 bg-gray-900 hover:bg-black transition-all text-white rounded-2xl font-bold text-base shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Return to Workspace</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isCorrectOption = (opt: string, correctAns: string, idx: number) => {
    if (!correctAns || !opt) return false;
    const o = opt.trim().toLowerCase();
    const c = correctAns.trim().toLowerCase();
    if (o === c) return true;
    const letter = String.fromCharCode(65 + idx).toLowerCase();
    if (c === letter || c === `${letter})` || c.startsWith(`${letter})`) || c.startsWith(`${letter}.`)) {
      if (c === letter || c === `${letter})`) return true;
      const cleanC = c.replace(/^[a-d][\)\.]\s*/, "").trim();
      if (cleanC === o) return true;
    }
    return false;
  };

  const isTimeCritical = timeLeft !== null && timeLeft <= 300; // < 5 minutes remaining

  return (
    <div className="min-h-screen bg-gray-50 pb-24 text-gray-900 relative">
      {/* Sticky Countdown Timer & Live Progress Bar (Live Exam Only) */}
      {quizMode === "exam" && timeLeft !== null && (
        <div
          className={`sticky top-0 z-30 transition-all border-b shadow-sm ${
            isTimeCritical
              ? "bg-rose-600 text-white border-rose-700 animate-pulse"
              : "bg-white/95 backdrop-blur-md text-gray-900 border-gray-200"
          }`}
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-xs sm:text-base">
              <Clock className={`w-4 h-4 sm:w-5 sm:h-5 ${isTimeCritical ? "text-white" : "text-blue-600"}`} />
              <span className="hidden sm:inline">Time Remaining:</span>
              <span
                className={`font-mono text-sm sm:text-lg tracking-wider font-extrabold ${
                  isTimeCritical ? "text-white" : "text-blue-600"
                }`}
              >
                {formatTimer(timeLeft)}
              </span>
            </div>

            {/* Live Real-Time Progress Tracker */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              {isTimeCritical && (
                <span className="hidden sm:inline text-xs font-extrabold uppercase tracking-widest bg-white/20 px-2.5 py-1 rounded-md">
                  Final 5 Min
                </span>
              )}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${isTimeCritical ? "text-white/90" : "text-gray-600"}`}>
                  Answered:{" "}
                  <strong className={isTimeCritical ? "text-white" : "text-blue-600"}>
                    {answeredCount}/{totalExamQuestions}
                  </strong>
                </span>
                <div
                  className={`w-16 sm:w-24 h-2 rounded-full overflow-hidden ${
                    isTimeCritical ? "bg-white/20" : "bg-gray-200"
                  }`}
                >
                  <div
                    className={`h-full transition-all duration-300 ${isTimeCritical ? "bg-white" : "bg-blue-600"}`}
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">
        {/* Mode Switcher & Navigation Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 sm:px-6 sm:py-3.5 rounded-2xl border border-gray-200/80 shadow-xs no-print">
          <button
            type="button"
            onClick={handleReturnDashboard}
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>

          {/* Mode Switcher Pill Tabs or Locked Classroom Badge */}
          {isAssignment ? (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold shadow-2xs">
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Classroom Examination • Single Attempt</span>
            </div>
          ) : (
            <div className="inline-flex p-1 bg-gray-100 rounded-xl border border-gray-200 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setQuizMode("study")}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  quizMode === "study"
                    ? "bg-white text-indigo-700 shadow-xs border border-gray-200/60"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Study Mode</span>
              </button>
              <button
                type="button"
                onClick={() => setQuizMode("exam")}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  quizMode === "exam"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Live Assessment</span>
              </button>
            </div>
          )}
        </div>

        {/* VIEW 1: STUDY MODE (Questions with Answers & Explanations Revealed) */}
        {quizMode === "study" ? (
          <div className={`space-y-6 ${isUrdu ? "font-serif" : ""}`} dir={isUrdu ? "rtl" : "ltr"}>
            {/* Study Mode Hero / Header */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-200/80 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-500" />
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold mb-3">
                <BookOpen className="w-3.5 h-3.5" />
                <span>{isUrdu ? "اردو پرچہ و کلید جوابات" : "Study Mode & Official Answer Key"}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                {metadata?.exam_title || metadata?.subject || "Comprehensive Study Guide"}
              </h1>
              <p className="text-sm sm:text-base text-gray-500 max-w-2xl mx-auto mt-2 font-medium">
                Review questions at your own pace. All correct options, key concepts, model answers, and detailed explanations are revealed below for self-paced revision.
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {metadata?.subject && (
                  <span className="text-xs text-gray-600 font-medium bg-gray-100 px-3 py-1 rounded-full">
                    Subject: {metadata.subject}
                  </span>
                )}
                {metadata?.class_name && (
                  <span className="text-xs text-gray-600 font-medium bg-gray-100 px-3 py-1 rounded-full">
                    Class: {metadata.class_name}
                  </span>
                )}
                <span className="text-xs text-gray-600 font-medium bg-gray-100 px-3 py-1 rounded-full">
                  Total Marks: {metadata?.total_marks || 100}
                </span>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-sm transition-all shadow-2xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print / Save Study Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuizMode("exam");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Start Live Assessment Exam</span>
                </button>
              </div>
            </div>

            {/* Loading state for study data */}
            {loadingStudy && !studyData ? (
              <div className="bg-white p-12 rounded-3xl border border-gray-200/80 text-center shadow-sm">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3" />
                <p className="font-bold text-gray-700">Loading Official Answer Keys & Explanations...</p>
              </div>
            ) : (
              <div className="bg-white p-6 sm:p-10 rounded-3xl shadow-sm border border-gray-200/80 space-y-10">
                {/* Reading Comprehension Passage (If Present) */}
                {(studyData?.reading_passage || quizData?.reading_passage) && (
                  <div className="p-6 sm:p-8 rounded-3xl bg-blue-50/50 border-2 border-blue-200/80 shadow-xs">
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-blue-200/60">
                      <div className="flex items-center gap-2.5 text-blue-950 font-black text-base sm:text-lg">
                        <div className="p-1.5 bg-blue-600 text-white rounded-xl shadow-xs">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <span>Reading Comprehension Passage</span>
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider bg-blue-100/90 text-blue-800 px-3 py-1 rounded-full">
                        Reference Text
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-blue-800/80 italic mb-4 font-medium">
                      Directions: Read the following passage carefully to review the questions and model answers below.
                    </p>
                    <div className="text-gray-800 leading-relaxed space-y-3 font-normal text-sm sm:text-base bg-white/80 p-4 sm:p-6 rounded-2xl border border-blue-100 shadow-2xs">
                      {String(studyData?.reading_passage || quizData?.reading_passage)
                        .split("\n")
                        .map((para: string, idx: number) =>
                          para.trim() ? <p key={idx}>{para.trim()}</p> : null
                        )}
                    </div>
                  </div>
                )}

                {/* Section A: MCQs with Answers */}
                {(studyData?.mcq_questions?.length > 0 || quizData?.mcq_questions?.length > 0) && (
                  <div>
                    <div className="border-b border-indigo-100 pb-3 mb-6 flex items-center justify-between">
                      <h3 className="text-lg sm:text-xl font-extrabold text-blue-900 flex items-center gap-2">
                        <span>Section A: Multiple Choice Questions</span>
                        <span className="text-xs text-gray-400 font-normal">(1 Mark Each)</span>
                      </h3>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                        Answers Revealed
                      </span>
                    </div>
                    <div className="space-y-6">
                      {(studyData?.mcq_questions || quizData?.mcq_questions || []).map((q: any, i: number) => (
                        <div key={i} className="p-5 sm:p-6 bg-gray-50/50 rounded-2xl border border-gray-200/80 shadow-2xs">
                          <p className="font-bold text-base sm:text-lg mb-4 text-gray-900 leading-relaxed">
                            Q{i + 1}. {q.question_text}
                          </p>
                          <div className="space-y-2.5">
                            {q.options?.map((opt: string, j: number) => {
                              const letter = String.fromCharCode(65 + j);
                              const isCorrect = isCorrectOption(opt, q.correct_answer, j);
                              return (
                                <div
                                  key={j}
                                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                                    isCorrect
                                      ? "bg-emerald-50/80 border-2 border-emerald-500 text-emerald-950 font-semibold shadow-xs"
                                      : "bg-white border-gray-200 text-gray-700"
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                                        isCorrect ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600"
                                      }`}
                                    >
                                      {letter}
                                    </span>
                                    <span className="text-sm sm:text-base">{opt}</span>
                                  </div>
                                  {isCorrect && (
                                    <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 bg-emerald-100/90 px-2.5 py-1 rounded-full shrink-0 ml-2">
                                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                                      <span>Correct</span>
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {q.explanation && (
                            <div className="mt-4 p-4 rounded-xl bg-blue-50/80 border border-blue-100 text-xs sm:text-sm text-blue-950 flex items-start gap-2.5">
                              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                              <div>
                                <strong className="font-bold text-blue-900 block mb-0.5">Why this is correct:</strong>
                                <p className="leading-relaxed text-blue-900/90">{q.explanation}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section B: Fill in the Blanks with Answers */}
                {(studyData?.fill_blank_questions?.length > 0 || quizData?.fill_blank_questions?.length > 0) && (
                  <div>
                    <div className="border-b border-purple-100 pb-3 mb-6 flex items-center justify-between">
                      <h3 className="text-lg sm:text-xl font-extrabold text-purple-900 flex items-center gap-2">
                        <span>Section B: Fill in the Blanks</span>
                        <span className="text-xs text-gray-400 font-normal">(1 Mark Each)</span>
                      </h3>
                      <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1 rounded-full">
                        Answers Revealed
                      </span>
                    </div>
                    <div className="space-y-6">
                      {(studyData?.fill_blank_questions || quizData?.fill_blank_questions || []).map((q: any, i: number) => (
                        <div key={i} className="p-5 sm:p-6 bg-gray-50/50 rounded-2xl border border-gray-200/80 shadow-2xs space-y-3">
                          <p className="font-bold text-base sm:text-lg text-gray-900 leading-relaxed">
                            Q{i + 1}. {q.question_text}
                          </p>
                          <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">
                              Correct Missing Word / Phrase:
                            </span>
                            <span className="font-black text-sm sm:text-base text-purple-950 bg-white px-3.5 py-1 rounded-lg border border-purple-200 shadow-2xs">
                              {q.correct_answer || "(Answer on request)"}
                            </span>
                          </div>
                          {q.explanation && (
                            <div className="p-3.5 rounded-xl bg-purple-50/50 border border-purple-100 text-xs text-purple-950 flex items-start gap-2">
                              <HelpCircle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                              <div>
                                <strong className="font-bold text-purple-900 block mb-0.5">Explanation:</strong>
                                <p className="leading-relaxed">{q.explanation}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section C: Short Conceptual Questions with Model Answers */}
                {(studyData?.short_questions?.length > 0 || quizData?.short_questions?.length > 0) && (
                  <div>
                    <div className="border-b border-indigo-100 pb-3 mb-6 flex items-center justify-between">
                      <h3 className="text-lg sm:text-xl font-extrabold text-indigo-900 flex items-center gap-2">
                        <span>Section C: Short Conceptual Questions</span>
                        <span className="text-xs text-gray-400 font-normal">(2 Marks Each)</span>
                      </h3>
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
                        Model Answers
                      </span>
                    </div>
                    <div className="space-y-6">
                      {(studyData?.short_questions || quizData?.short_questions || []).map((q: any, i: number) => {
                        const answerText = q.model_answer || q.correct_answer || q.explanation || "";
                        const explanationText = q.explanation && q.explanation !== answerText ? q.explanation : null;

                        return (
                          <div key={i} className="p-5 sm:p-6 bg-gray-50/50 rounded-2xl border border-gray-200/80 shadow-2xs space-y-3">
                            <p className="font-bold text-base sm:text-lg text-gray-900 leading-relaxed">
                              Q{i + 1}. {q.question_text}
                            </p>
                            <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-200 space-y-2.5">
                              <div>
                                <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider block mb-1">
                                  Ideal Model Answer / Key Concept:
                                </span>
                                <p className="text-sm sm:text-base text-indigo-950 whitespace-pre-wrap font-medium leading-relaxed">
                                  {answerText || "Review comprehensive notes for key definitions."}
                                </p>
                              </div>
                              {explanationText && (
                                <div className="pt-2.5 border-t border-indigo-200/70 text-xs text-indigo-900 flex items-start gap-2">
                                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                                  <div>
                                    <strong className="font-bold block mb-0.5">Key Concept & Pedagogical Context:</strong>
                                    <p className="leading-relaxed">{explanationText}</p>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* 🔀 Student Alternative Swapper (Self-Study & Practice) */}
                            {!isAssignment && (
                              <div className="pt-2.5 border-t border-gray-100">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                      Alternatives
                                    </span>
                                    {q.style_type && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                                        {q.style_type}
                                      </span>
                                    )}
                                    {(q.alternatives || []).length > 0 && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                        {(q.alternatives || []).length} ready
                                      </span>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => toggleAltExpanded(`short-${i}`)}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 py-1 px-2.5 rounded-xl hover:bg-indigo-50 transition-colors cursor-pointer"
                                  >
                                    {altExpanded[`short-${i}`] ? "Hide Alternatives" : "Swap Question"}
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${altExpanded[`short-${i}`] ? "rotate-180" : ""}`} />
                                  </button>
                                </div>

                                {altExpanded[`short-${i}`] && (
                                  <div className="mt-3 p-3.5 bg-white rounded-2xl border border-slate-200 space-y-2.5 shadow-2xs">
                                    {(q.alternatives || []).length > 0 ? (
                                      <div className="space-y-2">
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                                          Available Alternatives:
                                        </span>
                                        {(q.alternatives || []).map((alt: any, altIdx: number) => (
                                          <div key={altIdx} className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                            <div className="flex-1 min-w-0">
                                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wide mr-2 ${
                                                alt.style_type === "coding" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                                alt.style_type === "conceptual" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                                                alt.style_type === "scenario" ? "bg-purple-50 text-purple-700 border border-purple-200" :
                                                alt.style_type === "difference" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                                                "bg-slate-100 text-slate-700 border border-slate-200"
                                              }`}>
                                                {alt.style_type || "Alternative"}
                                              </span>
                                              <p className="text-xs font-semibold text-slate-800 mt-1">{alt.question_text}</p>
                                            </div>
                                            <button
                                              type="button"
                                              disabled={Boolean(swapLoading)}
                                              onClick={() => handleStudentSwap("short", i, altIdx)}
                                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                                            >
                                              {swapLoading === `short-${i}` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>🔄 Swap Question</span>}
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-slate-400 italic">No pre-generated alternatives for this question yet.</p>
                                    )}

                                    <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[11px] font-bold text-slate-600 mr-1">Generate Fresh Alternative:</span>
                                      {[
                                        { id: "conceptual", label: "💡 Conceptual" },
                                        { id: "coding", label: "💻 Coding" },
                                        { id: "scenario", label: "🏢 Scenario" },
                                        { id: "difference", label: "⚖️ Difference" },
                                      ].map((st) => (
                                        <button
                                          key={st.id}
                                          type="button"
                                          disabled={Boolean(swapLoading)}
                                          onClick={() => handleStudentGenerateAlt("short", i, st.id)}
                                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-50 shadow-2xs"
                                        >
                                          {swapLoading === `short-${i}-${st.id}` ? <RefreshCw className="w-3 h-3 animate-spin text-indigo-600 inline mr-1" /> : null}
                                          {st.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Section D: Long Questions with Model Solutions */}
                {(studyData?.long_questions?.length > 0 || quizData?.long_questions?.length > 0) && (
                  <div>
                    <div className="border-b border-amber-100 pb-3 mb-6 flex items-center justify-between">
                      <h3 className="text-lg sm:text-xl font-extrabold text-amber-900 flex items-center gap-2">
                        <span>Section D: Detailed Explanations</span>
                        <span className="text-xs text-gray-400 font-normal">(6 or 10 Marks Each)</span>
                      </h3>
                      <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                        Full Solutions
                      </span>
                    </div>
                    <div className="space-y-6">
                      {(studyData?.long_questions || quizData?.long_questions || []).map((q: any, i: number) => {
                        const longAnswer = q.model_answer || q.correct_answer || "";
                        const keyPoints = Array.isArray(q.key_points) && q.key_points.length > 0 ? q.key_points : null;

                        return (
                          <div key={i} className="p-5 sm:p-6 bg-gray-50/50 rounded-2xl border border-gray-200/80 shadow-2xs space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-bold text-base sm:text-lg text-gray-900 leading-relaxed">
                                Q{i + 1}. {q.question_text}
                              </p>
                              <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                {q.marks || 6} Marks
                              </span>
                            </div>
                            <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
                              <div>
                                <span className="text-xs font-bold text-amber-900 uppercase tracking-wider block mb-1.5">
                                  Comprehensive Reference Solution:
                                </span>
                                <p className="text-sm sm:text-base text-gray-900 whitespace-pre-wrap font-medium leading-relaxed">
                                  {longAnswer || "Detailed step-by-step breakdown available in lecture notes."}
                                </p>
                              </div>
                              {keyPoints && (
                                <div className="pt-3 border-t border-amber-200/80">
                                  <span className="text-xs font-bold text-amber-900 uppercase tracking-wider block mb-1">
                                    Key Marking Criteria / Points:
                                  </span>
                                  <ul className="list-disc list-inside space-y-1 text-xs text-amber-950 font-medium">
                                    {keyPoints.map((kp: string, kidx: number) => (
                                      <li key={kidx}>{kp}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {/* 🔀 Student Alternative Swapper for Long Questions */}
                            {!isAssignment && (
                              <div className="pt-2.5 border-t border-gray-100">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                      Alternatives
                                    </span>
                                    {q.style_type && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                                        {q.style_type}
                                      </span>
                                    )}
                                    {(q.alternatives || []).length > 0 && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                        {(q.alternatives || []).length} ready
                                      </span>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => toggleAltExpanded(`long-${i}`)}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 py-1 px-2.5 rounded-xl hover:bg-indigo-50 transition-colors cursor-pointer"
                                  >
                                    {altExpanded[`long-${i}`] ? "Hide Alternatives" : "Swap Question"}
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${altExpanded[`long-${i}`] ? "rotate-180" : ""}`} />
                                  </button>
                                </div>

                                {altExpanded[`long-${i}`] && (
                                  <div className="mt-3 p-3.5 bg-white rounded-2xl border border-slate-200 space-y-2.5 shadow-2xs">
                                    {(q.alternatives || []).length > 0 ? (
                                      <div className="space-y-2">
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                                          Available Comprehensive Alternatives:
                                        </span>
                                        {(q.alternatives || []).map((alt: any, altIdx: number) => (
                                          <div key={altIdx} className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                            <div className="flex-1 min-w-0">
                                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wide mr-2 ${
                                                alt.style_type === "coding" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                                alt.style_type === "conceptual" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                                                alt.style_type === "scenario" ? "bg-purple-50 text-purple-700 border border-purple-200" :
                                                alt.style_type === "difference" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                                                "bg-slate-100 text-slate-700 border border-slate-200"
                                              }`}>
                                                {alt.style_type || "Alternative"}
                                              </span>
                                              <p className="text-xs font-semibold text-slate-800 mt-1">{alt.question_text}</p>
                                            </div>
                                            <button
                                              type="button"
                                              disabled={Boolean(swapLoading)}
                                              onClick={() => handleStudentSwap("long", i, altIdx)}
                                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                                            >
                                              {swapLoading === `long-${i}` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>🔄 Swap Question</span>}
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-slate-400 italic">No pre-generated alternatives for this question yet.</p>
                                    )}

                                    <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[11px] font-bold text-slate-600 mr-1">Generate Fresh Alternative:</span>
                                      {[
                                        { id: "scenario", label: "🏢 Scenario Dilemma" },
                                        { id: "coding", label: "💻 Coding Implementation" },
                                        { id: "conceptual", label: "💡 Conceptual Analysis" },
                                        { id: "difference", label: "⚖️ Comparative Trade-off" },
                                      ].map((st) => (
                                        <button
                                          key={st.id}
                                          type="button"
                                          disabled={Boolean(swapLoading)}
                                          onClick={() => handleStudentGenerateAlt("long", i, st.id)}
                                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-50 shadow-2xs"
                                        >
                                          {swapLoading === `long-${i}-${st.id}` ? <RefreshCw className="w-3 h-3 animate-spin text-indigo-600 inline mr-1" /> : null}
                                          {st.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Bottom Action Card */}
                <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-teal-600 rounded-3xl p-6 sm:p-8 text-white text-center shadow-xl space-y-4 no-print">
                  <h3 className="text-2xl font-extrabold tracking-tight">Ready to Test Your Knowledge?</h3>
                  <p className="text-blue-100 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
                    Now that you have revised questions, options, and model answers, start the live timed assessment to put your skills to the test and receive an official AI evaluated grade report.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuizMode("exam");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="px-8 py-4 bg-white text-blue-700 hover:bg-blue-50 font-black rounded-2xl shadow-lg transition-all inline-flex items-center gap-2.5 text-base cursor-pointer"
                  >
                    <Clock className="w-5 h-5" />
                    <span>Start Live Assessment (Timed Exam)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* VIEW 2: LIVE ASSESSMENT EXAM FORM */
          <div className={`bg-white p-6 sm:p-10 rounded-3xl shadow-sm border border-gray-200/80 ${isUrdu ? "font-serif" : ""}`} dir={isUrdu ? "rtl" : "ltr"}>
            {/* Exam Header */}
            <div className="text-center border-b border-gray-200 pb-6 mb-8 relative">
              {isUrdu && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold mb-3">
                  <span>🇵🇰</span> <span>اردو امتحانی پرچہ (Urdu Assessment)</span>
                </div>
              )}
              {challengeCode && (
                <div className="absolute top-0 right-0 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Challenge Mode</span>
                </div>
              )}

              <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wide text-gray-900">
                {metadata?.institution_name || "Assessment Exam"}
              </h1>
              <h2 className="text-lg sm:text-xl text-gray-600 mt-2 font-semibold">
                {metadata?.subject && metadata?.class_name
                  ? `${metadata.subject} — ${metadata.class_name}`
                  : metadata?.exam_title}
              </h2>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {metadata?.teacher_name && metadata?.institution_name !== "Self-Study Assessment" && (
                  <span className="text-xs text-gray-600 font-medium bg-gray-100 px-3 py-1 rounded-full">
                    Examiner: {metadata.teacher_name}
                  </span>
                )}
                <span className="text-xs text-gray-600 font-medium bg-gray-100 px-3 py-1 rounded-full">
                  Duration: {metadata?.duration_minutes || 30} mins
                </span>
                <span className="text-xs text-gray-600 font-medium bg-gray-100 px-3 py-1 rounded-full">
                  Total Marks: {metadata?.total_marks || 100}
                </span>
              </div>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-10">
              {/* Student Name Card */}
              <div className="p-5 sm:p-6 bg-blue-50/60 rounded-2xl border border-blue-100">
                <label className="font-bold text-base text-blue-900 block mb-2">Student Name (Required for Grading):</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-base shadow-xs"
                  placeholder="Enter your full name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>

              {/* Reading Comprehension Passage (If Present) */}
              {quizData?.reading_passage && (
                <div className="p-6 sm:p-8 rounded-3xl bg-blue-50/50 border-2 border-blue-200/80 shadow-xs">
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-blue-200/60">
                    <div className="flex items-center gap-2.5 text-blue-950 font-black text-base sm:text-lg">
                      <div className="p-1.5 bg-blue-600 text-white rounded-xl shadow-xs">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <span>Reading Comprehension Passage</span>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider bg-blue-100/90 text-blue-800 px-3 py-1 rounded-full">
                      Reference Text
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-blue-800/80 italic mb-4 font-medium">
                    Directions: Read the following passage carefully before answering the questions below.
                  </p>
                  <div className="text-gray-800 leading-relaxed space-y-3 font-normal text-sm sm:text-base bg-white/80 p-4 sm:p-6 rounded-2xl border border-blue-100 shadow-2xs">
                    {String(quizData.reading_passage)
                      .split("\n")
                      .map((para: string, idx: number) =>
                        para.trim() ? <p key={idx}>{para.trim()}</p> : null
                      )}
                  </div>
                </div>
              )}

              {/* MCQs */}
              {quizData?.mcq_questions?.length > 0 && (
                <div>
                  <h3 className="text-xl font-extrabold text-blue-800 mb-6 border-b border-blue-100 pb-3 flex items-center gap-2">
                    <span>Section A: Multiple Choice Questions</span>
                    <span className="text-xs font-bold text-gray-400 font-normal">(1 Mark Each)</span>
                  </h3>
                  <div className="space-y-6">
                    {quizData.mcq_questions.map((q: any, i: number) => (
                      <div key={i} className="p-5 sm:p-6 bg-white rounded-2xl border border-gray-200/80 shadow-xs hover:border-blue-200 transition-all">
                        <p className="font-bold text-base sm:text-lg mb-4 text-gray-900 leading-relaxed">
                          Q{i + 1}. {q.question_text}
                        </p>
                        <div className="space-y-2.5">
                          {q.options.map((opt: string, j: number) => {
                            const letter = String.fromCharCode(65 + j);
                            const isSelected = answers[`mcq_${i}`] === opt;
                            return (
                              <label
                                key={j}
                                className={`flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border min-h-[52px] cursor-pointer transition-all tap-press select-none ${
                                  isSelected
                                    ? "bg-blue-50/90 border-2 border-blue-600 shadow-xs text-blue-950"
                                    : "bg-white border-gray-200/90 hover:bg-gray-50/80 hover:border-gray-300 text-gray-800"
                                }`}
                              >
                                <div className="flex items-center gap-3 w-full">
                                  <input
                                    type="radio"
                                    name={`mcq_${i}`}
                                    value={opt}
                                    checked={isSelected}
                                    onChange={() => handleInputChange(`mcq_${i}`, opt)}
                                    className="sr-only"
                                  />
                                  <div
                                    className={`w-7 h-7 rounded-xl text-xs font-black flex items-center justify-center shrink-0 transition-colors ${
                                      isSelected ? "bg-blue-600 text-white shadow-xs" : "bg-gray-100 text-gray-600"
                                    }`}
                                  >
                                    {letter}
                                  </div>
                                  <span className="text-sm sm:text-base font-medium leading-snug flex-1">
                                    {opt}
                                  </span>
                                  {isSelected && (
                                    <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 ml-2 shadow-xs">
                                      <Check className="w-3 h-3 stroke-[3]" />
                                    </div>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fill in the Blanks */}
              {quizData?.fill_blank_questions?.length > 0 && (
                <div>
                  <h3 className="text-xl font-extrabold text-purple-800 mb-6 border-b border-purple-100 pb-3 mt-10 flex items-center gap-2">
                    <span>Section B: Fill in the Blanks</span>
                    <span className="text-xs font-bold text-gray-400 font-normal">(1 Mark Each)</span>
                  </h3>
                  <div className="space-y-6">
                    {quizData.fill_blank_questions.map((q: any, i: number) => (
                      <div key={i} className="p-5 sm:p-6 bg-white rounded-2xl border border-gray-200/80 shadow-xs hover:border-purple-200 transition-all">
                        <p className="font-bold text-base sm:text-lg mb-4 text-gray-900 leading-relaxed">
                          Q{i + 1}. {q.question_text}
                        </p>
                        <input
                          type="text"
                          value={answers[`fb_${i}`] || ""}
                          onChange={(e) => handleInputChange(`fb_${i}`, e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50/80 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white text-base transition-all font-medium"
                          placeholder="Type missing word or phrase (optional to skip)..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Short Questions */}
              {quizData?.short_questions?.length > 0 && (
                <div>
                  <h3 className="text-xl font-extrabold text-indigo-800 mb-6 border-b border-indigo-100 pb-3 mt-10 flex items-center gap-2">
                    <span>Section C: Short Conceptual Questions</span>
                    <span className="text-xs font-bold text-gray-400 font-normal">(2 Marks Each)</span>
                  </h3>
                  <div className="space-y-6">
                    {quizData.short_questions.map((q: any, i: number) => (
                      <div key={i} className="p-5 sm:p-6 bg-white rounded-2xl border border-gray-200/80 shadow-xs hover:border-indigo-200 transition-all">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <p className="font-bold text-base sm:text-lg text-gray-900 leading-relaxed">
                            Q{i + 1}. {q.question_text}
                          </p>
                          <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                            2 Marks
                          </span>
                        </div>
                        <textarea
                          rows={3}
                          value={answers[`short_${i}`] || ""}
                          onChange={(e) => handleInputChange(`short_${i}`, e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50/80 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-base transition-all resize-none font-medium"
                          placeholder="Write a concise answer (1-2 sentences)..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Long Questions */}
              {quizData?.long_questions?.length > 0 && (
                <div>
                  <h3 className="text-xl font-extrabold text-amber-800 mb-6 border-b border-amber-100 pb-3 mt-10 flex items-center gap-2">
                    <span>Section D: Detailed Explanations</span>
                    <span className="text-xs font-bold text-gray-400 font-normal">(6 or 10 Marks Each)</span>
                  </h3>
                  <div className="space-y-6">
                    {quizData.long_questions.map((q: any, i: number) => (
                      <div key={i} className="p-5 sm:p-6 bg-white rounded-2xl border border-gray-200/80 shadow-xs hover:border-amber-200 transition-all">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <p className="font-bold text-base sm:text-lg text-gray-900 leading-relaxed">
                            Q{i + 1}. {q.question_text}
                          </p>
                          <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                            {q.marks || 6} Marks
                          </span>
                        </div>
                        <textarea
                          rows={5}
                          value={answers[`long_${i}`] || ""}
                          onChange={(e) => handleInputChange(`long_${i}`, e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50/80 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-base transition-all resize-y font-medium"
                          placeholder="Provide your comprehensive explanation here..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-8 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 sm:py-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white font-extrabold text-base sm:text-xl rounded-2xl transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-3 cursor-pointer tap-press min-h-[56px]"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>AI is Evaluating and Grading Your Exam...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-6 h-6" />
                      <span>Submit Exam & Get AI Graded</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}