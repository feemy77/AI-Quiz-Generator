"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, apiFetch, clearAuth, switchUserRole } from "@/lib/api";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Sparkles,
  FileText,
  School,
  Bookmark,
  BarChart3,
  Settings,
  LogOut,
  Plus,
  Trash2,
  Edit3,
  Download,
  Copy,
  Check,
  Calendar,
  Clock,
  BookOpen,
  X,
  Upload,
  Video,
  Camera,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Star,
  Users,
  Eye,
  CheckCircle2,
  ShieldCheck,
  GraduationCap,
  Info,
  ChevronDown,
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

export default function TeacherDashboard() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [teacherName, setTeacherName] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [overview, setOverview] = useState({ total_quizzes: 0, total_classes: 0, total_attempts: 0, avg_score: 0 });
  const [classes, setClasses] = useState<any[]>([]);
  const [newClassName, setNewClassName] = useState("");
  const [creatingClass, setCreatingClass] = useState(false);
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [academyName, setAcademyName] = useState("");
  const [logoBase64, setLogoBase64] = useState("");
  const [savingBranding, setSavingBranding] = useState(false);

  // Question Bank / Bookmarks State
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [bookmarkFilter, setBookmarkFilter] = useState("all");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Classroom Assignment Modal
  const [assignModal, setAssignModal] = useState<{
    show: boolean;
    classId: number | null;
    className: string;
    selectedQuizId: number | "";
    dueDate: string;
  }>({
    show: false,
    classId: null,
    className: "",
    selectedQuizId: "",
    dueDate: "",
  });
  const [assigning, setAssigning] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);

  // Submissions & Gradebook Modal
  const [submissionsModal, setSubmissionsModal] = useState<{
    show: boolean;
    assignmentId: number | null;
    loading: boolean;
    data: any | null;
    selectedSubmission: any | null;
  }>({
    show: false,
    assignmentId: null,
    loading: false,
    data: null,
    selectedSubmission: null,
  });

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
  const [altExpanded, setAltExpanded] = useState<Record<string, boolean>>({});
  const [swapLoading, setSwapLoading] = useState<string | null>(null);

  const [examTitle, setExamTitle] = useState("");
  const [examSubject, setExamSubject] = useState("");
  const [examClass, setExamClass] = useState("");
  const [examInstitution, setExamInstitution] = useState("");
  const [paperType, setPaperType] = useState<"exam" | "quiz">("exam");
  const [quizNumber, setQuizNumber] = useState("01");
  const [courseCode, setCourseCode] = useState("");

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exportingId, setExportingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Popups & Confirmations
  const [customPopup, setCustomPopup] = useState({ show: false, title: "", message: "", type: "success" });
  const [exportModal, setExportModal] = useState<{
    show: boolean;
    quizId: number | null;
    quizTitle: string;
    format: "pdf" | "docx";
    academicTier: "University" | "College" | "School";
    paperType: "exam" | "quiz";
    quizNumber: string;
    institutionName: string;
    departmentName: string;
    examTitle: string;
    courseCode: string;
    subject: string;
    className: string;
    teacherName: string;
    durationMinutes: number;
    totalMarks: number;
    examSet: "Set A" | "Set B" | "Standard";
    examCategory: "THEORY" | "PRACTICAL";
    includeInstructions: boolean;
    includeAnswerKey: boolean;
    includeClo: boolean;
  }>({
    show: false,
    quizId: null,
    quizTitle: "",
    format: "pdf",
    academicTier: "University",
    paperType: "exam",
    quizNumber: "01",
    institutionName: "",
    departmentName: "",
    examTitle: "",
    courseCode: "",
    subject: "",
    className: "",
    teacherName: "",
    durationMinutes: 90,
    totalMarks: 20,
    examSet: "Set A",
    examCategory: "THEORY",
    includeInstructions: true,
    includeAnswerKey: true,
    includeClo: true,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; quizId: number | null }>({
    show: false,
    quizId: null,
  });

  // Editor Modal State
  const [editModal, setEditModal] = useState<{ show: boolean; quizId: number | null; quiz: any | null; activeSec: string }>({
    show: false,
    quizId: null,
    quiz: null,
    activeSec: "mcq",
  });
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [regenLoading, setRegenLoading] = useState<string | null>(null);

  // 🔒 Prevent background scrolling when any modal is open
  useEffect(() => {
    const isAnyModalOpen =
      assignModal.show ||
      submissionsModal.show ||
      customPopup.show ||
      exportModal.show ||
      deleteConfirm.show ||
      editModal.show;

    if (isAnyModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow || "unset";
      };
    }
  }, [
    assignModal.show,
    submissionsModal.show,
    customPopup.show,
    exportModal.show,
    deleteConfirm.show,
    editModal.show,
  ]);

  useEffect(() => {
    setIsMounted(true);
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }
    setTeacherName(localStorage.getItem("name") || "Teacher");
    fetchDashboardData();
  }, [router]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [quizRes, overviewRes, classRes, analyticsRes, brandRes, bookmarkRes] = await Promise.all([
        apiFetch("/teacher/quizzes"),
        apiFetch("/teacher/overview"),
        apiFetch("/teacher/classrooms"),
        apiFetch("/teacher/analytics/recent-attempts"),
        apiFetch("/teacher/branding"),
        apiFetch("/bookmarks"),
      ]);

      if (quizRes.ok) setQuizzes(quizRes.data.quizzes || []);
      if (overviewRes.ok) setOverview(overviewRes.data);
      if (classRes.ok) setClasses(classRes.data.classes || []);
      if (analyticsRes.ok) setRecentAttempts(analyticsRes.data.attempts || []);
      if (brandRes.ok && brandRes.data) {
        const aName = brandRes.data.academy_name || "";
        setAcademyName(aName);
        setLogoBase64(brandRes.data.logo_path || "");
        setExamInstitution((prev) => prev || aName);
      }
      if (bookmarkRes.ok) setBookmarks(bookmarkRes.data.bookmarks || []);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
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

  const handleGenerateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((inputType === "document" || inputType === "snap") && selectedFiles.length === 0)
      return setCustomPopup({ show: true, title: "Error", message: "Please select at least one file.", type: "error" });
    if (inputType === "youtube" && !youtubeUrl.trim())
      return setCustomPopup({ show: true, title: "Error", message: "Please enter a YouTube Link.", type: "error" });
    if (numMcq + numFillBlank + numShort + numLong <= 0)
      return setCustomPopup({ show: true, title: "Error", message: "Select at least 1 question count.", type: "error" });

    setGeneratingQuiz(true);
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
    formData.append("academic_tier", academicTier);
    formData.append("exam_track", examTrack);
    formData.append("include_comprehension", includeComprehension ? "true" : "false");

    const finalExamTitle =
      paperType === "quiz"
        ? (examTitle.trim() || `Quiz No. ${quizNumber ? quizNumber.padStart(2, "0") : "01"}`)
        : (examTitle.trim() || "Mid Term Examination (Fall-2026)");

    formData.append("exam_title", finalExamTitle);
    formData.append("paper_type", paperType);
    formData.append("quiz_number", quizNumber.trim());
    formData.append("course_code", academicTier === "University" ? courseCode.trim() : "");
    formData.append("subject", examSubject.trim() || "General Subject");
    formData.append("class_name", examClass.trim());
    formData.append("institution_name", examInstitution.trim() || academyName.trim() || "Academic Examination Department");

    try {
      const response = await fetch(`${API_BASE_URL}/quiz/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (response.ok) {
        setCustomPopup({ show: true, title: "Quiz Generated Successfully", message: "Your assessment has been generated and added to your quizzes.", type: "success" });
        fetchDashboardData();
        setActiveTab("quizzes");
        setSelectedFiles([]);
        setExamTitle("");
        setExamSubject("");
        setExamClass("");
        setCourseCode("");
        setQuizNumber("01");
        setYoutubeUrl("");
        setImagePreview(null);
      } else {
        const data = await response.json();
        setCustomPopup({
          show: true,
          title: "Generation Failed",
          message: data.detail || "Something went wrong.",
          type: "error",
        });
      }
    } catch {
      setCustomPopup({ show: true, title: "Error", message: "Network connection error.", type: "error" });
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const executeDelete = async () => {
    const quizId = deleteConfirm.quizId;
    setDeleteConfirm({ show: false, quizId: null });
    try {
      const { ok } = await apiFetch(`/quiz/${quizId}`, { method: "DELETE" });
      if (ok) {
        setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
        setOverview((prev) => ({ ...prev, total_quizzes: prev.total_quizzes - 1 }));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const openExportModal = (quiz: any, format: "pdf" | "docx" = "pdf") => {
    const rawQuizData = quiz.quiz_data || {};
    const totalQCount =
      (rawQuizData.mcq_questions?.length || 0) +
      (rawQuizData.fill_blank_questions?.length || 0) +
      (rawQuizData.short_questions?.length || 0) +
      (rawQuizData.long_questions?.length || 0);

    const isDiagramOrDsaQuestion = (q: any) => {
      const text = `${q?.question_text || ""} ${q?.model_answer || ""}`.toLowerCase();
      const keywords = [
        "graph", "tree", "diagram", "draw", "sketch", "flowchart", "plot", "visualize",
        "dijkstra", "kruskal", "prim", "bfs", "dfs", "avl", "b-tree", "b+ tree",
        "binary search tree", "bst", "heap", "min-heap", "max-heap", "red-black",
        "state machine", "transition diagram", "er diagram", "erd", "schema diagram",
        "architecture diagram", "dynamic programming table", "knapsack", "recursion tree",
        "trace the algorithm", "step-by-step trace", "traversal", "topological"
      ];
      return keywords.some((kw) => text.includes(kw));
    };

    const determineLqMarks = (q: any) => {
      if (q?.marks && (q.marks === 6 || q.marks === 10)) return Number(q.marks);
      return isDiagramOrDsaQuestion(q) ? 10 : 6;
    };

    let calculatedMarks = 0;
    if (totalQCount > 0) {
      calculatedMarks += (rawQuizData.mcq_questions?.length || 0) * 1;
      calculatedMarks += (rawQuizData.fill_blank_questions?.length || 0) * 1;
      calculatedMarks += (rawQuizData.short_questions || []).reduce((acc: number, sq: any) => acc + (sq.marks ? Number(sq.marks) : 2), 0);
      calculatedMarks += (rawQuizData.long_questions || []).reduce((acc: number, lq: any) => acc + determineLqMarks(lq), 0);
    } else {
      calculatedMarks = 20;
    }

    const meta = quiz.exam_metadata || {};
    const defaultCategory = (meta.exam_category || (meta.exam_track?.toLowerCase() === "practical" ? "PRACTICAL" : "THEORY")) as "THEORY" | "PRACTICAL";
    const tier = (meta.academic_tier || academicTier || "University") as "University" | "College" | "School";

    const rawTitle = quiz.title || meta.exam_title || "";
    const isQuiz = meta.paper_type === "quiz" || /quiz/i.test(rawTitle);
    const quizMatch = rawTitle.match(/quiz\s*(?:no\.?|#)?\s*(\d+)/i) || (meta.quiz_number ? [null, meta.quiz_number] : null);
    const detectedQuizNum = quizMatch ? String(quizMatch[1]).padStart(2, "0") : (meta.quiz_number ? String(meta.quiz_number).padStart(2, "0") : "01");

    let cleanTitle = "";
    if (isQuiz) {
      cleanTitle = `Quiz No. ${detectedQuizNum}`;
    } else if (/mid\s*term/i.test(rawTitle) || /midterm/i.test(rawTitle)) {
      cleanTitle = "Mid Term Examination (Fall-2026)";
    } else if (/final\s*term/i.test(rawTitle) || /final/i.test(rawTitle)) {
      cleanTitle = "Final Term Examination (Fall-2026)";
    } else if (rawTitle && !rawTitle.toLowerCase().includes("assessment examination")) {
      cleanTitle = rawTitle;
    } else {
      cleanTitle = "Mid Term Examination (Fall-2026)";
    }

    const effectiveInstName = academyName.trim() || meta.institution_name || "Academic Examination Department";

    setExportModal({
      show: true,
      quizId: quiz.id,
      quizTitle: quiz.title || "Examination Paper",
      format: format,
      academicTier: tier,
      paperType: isQuiz ? "quiz" : "exam",
      quizNumber: detectedQuizNum,
      institutionName: effectiveInstName,
      departmentName: meta.department || meta.department_name || "Examination Branch",
      examTitle: cleanTitle,
      courseCode: tier === "University" ? (meta.course_code || "CSC-204") : "",
      subject: meta.subject || quiz.subject || "Computer Science",
      className: meta.class_name || (tier === "University" ? "BSCS 5th" : tier === "School" ? "10th" : "1st Year"),
      teacherName: meta.teacher_name || teacherName.trim() || "Course Instructor",
      durationMinutes: meta.duration_minutes || (isQuiz ? 20 : 75),
      totalMarks: totalQCount > 0 ? calculatedMarks : (meta.total_marks || (isQuiz ? 10 : 20)),
      examSet: "Set A",
      examCategory: defaultCategory,
      includeInstructions: true,
      includeAnswerKey: true,
      includeClo: true,
    });
  };

  const executeExport = async (targetFormat?: "docx" | "pdf") => {
    const format = targetFormat || exportModal.format || "pdf";
    const { quizId } = exportModal;
    if (!quizId) return;

    const token = localStorage.getItem("token");
    setExportingId(quizId);
    try {
      const payload = {
        institution_name: exportModal.institutionName,
        department_name: exportModal.departmentName,
        exam_title: exportModal.examTitle,
        exam_category: exportModal.examCategory,
        course_code: exportModal.academicTier === "University" ? exportModal.courseCode : "",
        subject: exportModal.subject,
        class_name: exportModal.className,
        teacher_name: exportModal.teacherName,
        duration_minutes: Number(exportModal.durationMinutes) || (exportModal.paperType === "quiz" ? 20 : 90),
        total_marks: Number(exportModal.totalMarks) || (exportModal.paperType === "quiz" ? 10 : 20),
        exam_set: exportModal.examSet,
        include_instructions: exportModal.includeInstructions,
        include_answer_key: exportModal.includeAnswerKey,
        include_clo: exportModal.includeClo,
        academic_tier: exportModal.academicTier,
        paper_type: exportModal.paperType,
        quiz_number: exportModal.quizNumber,
      };

      const response = await fetch(`${API_BASE_URL}/quiz/${quizId}/export/${format}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return setCustomPopup({
          show: true,
          title: "Export Failed",
          message: errData.detail || "Error generating examination paper.",
          type: "error",
        });
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const disposition = response.headers.get("Content-Disposition");
      let filename = `Exam_${exportModal.subject || "Paper"}_${exportModal.examSet.replace(/\s+/g, "_")}.${format}`;
      if (disposition && disposition.indexOf("filename=") !== -1) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, "");
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast.success(`${format.toUpperCase()} Examination Paper (${exportModal.examSet}) generated!`);
      setExportModal((prev) => ({ ...prev, show: false }));
    } catch {
      setCustomPopup({ show: true, title: "Error", message: "Failed to download paper file.", type: "error" });
    } finally {
      setExportingId(null);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setCreatingClass(true);
    try {
      const { ok, data, error } = await apiFetch("/teacher/classrooms", {
        method: "POST",
        body: JSON.stringify({ name: newClassName }),
      });
      if (ok) {
        setClasses((prev) => [
          {
            id: data.class_id,
            name: data.name,
            join_code: data.join_code,
            created_at: new Date().toISOString(),
            student_count: 0,
          },
          ...prev,
        ]);
        setNewClassName("");
        setOverview((prev) => ({ ...prev, total_classes: prev.total_classes + 1 }));
        setCustomPopup({
          show: true,
          title: "Class Created!",
          message: `Join Code for students: ${data.join_code}`,
          type: "success",
        });
      } else {
        setCustomPopup({ show: true, title: "Error", message: error || "Failed to create class.", type: "error" });
      }
    } catch {
      setCustomPopup({ show: true, title: "Error", message: "Network Error.", type: "error" });
    } finally {
      setCreatingClass(false);
    }
  };

  const handleAssignQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModal.classId || !assignModal.selectedQuizId) {
      toast.warning("Please select a quiz to assign.");
      return;
    }
    setAssigning(true);
    try {
      const { ok, error } = await apiFetch(`/teacher/classrooms/${assignModal.classId}/assign`, {
        method: "POST",
        body: JSON.stringify({
          quiz_id: assignModal.selectedQuizId,
          due_date: assignModal.dueDate,
        }),
      });

      if (ok) {
        toast.success(`Quiz assigned to ${assignModal.className} successfully`);
        setAssignModal({ show: false, classId: null, className: "", selectedQuizId: "", dueDate: "" });
        fetchDashboardData();
      } else {
        toast.error(error || "Failed to assign quiz.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setAssigning(false);
    }
  };

  const handleOpenSubmissions = async (assignmentId: number) => {
    setSubmissionsModal({
      show: true,
      assignmentId,
      loading: true,
      data: null,
      selectedSubmission: null,
    });
    try {
      const { ok, data, error } = await apiFetch(`/teacher/assignments/${assignmentId}/submissions`);
      if (ok && data) {
        setSubmissionsModal({
          show: true,
          assignmentId,
          loading: false,
          data,
          selectedSubmission: null,
        });
      } else {
        toast.error(error || "Could not load submissions.");
        setSubmissionsModal((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      toast.error("Network error loading submissions.");
      setSubmissionsModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBranding(true);
    try {
      const { ok } = await apiFetch("/teacher/branding", {
        method: "POST",
        body: JSON.stringify({ academy_name: academyName.trim(), logo_path: logoBase64 }),
      });
      if (ok) {
        setCustomPopup({ show: true, title: "Saved!", message: "Branding updated successfully.", type: "success" });
      } else {
        setCustomPopup({ show: true, title: "Error", message: "Failed to update branding.", type: "error" });
      }
    } catch {
      setCustomPopup({ show: true, title: "Error", message: "Network Error.", type: "error" });
    } finally {
      setSavingBranding(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024 * 2)
        return setCustomPopup({ show: true, title: "File Too Large", message: "Max logo size is 2MB.", type: "error" });
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // ✅ CRITICAL BUG FIX: Fetches from /teacher/quiz/${id} so answers and explanations are preserved!
  const openEditor = async (id: number) => {
    try {
      const { ok, data, error } = await apiFetch(`/teacher/quiz/${id}`);
      if (ok) {
        setEditModal({ show: true, quizId: id, quiz: data, activeSec: "mcq" });
      } else {
        toast.error(error || "Failed to load quiz details.");
      }
    } catch {
      toast.error("Failed to load quiz.");
    }
  };

  const handleEditChange = (section: string, index: number, field: string, value: any) => {
    const updatedQuiz = { ...editModal.quiz };
    const secKey =
      section === "mcq"
        ? "mcq_questions"
        : section === "blank"
        ? "fill_blank_questions"
        : section === "short"
        ? "short_questions"
        : "long_questions";
    updatedQuiz.quiz_data[secKey][index][field] = value;
    setEditModal({ ...editModal, quiz: updatedQuiz });
  };

  const handleMove = (section: string, index: number, direction: number) => {
    const updatedQuiz = { ...editModal.quiz };
    const secKey =
      section === "mcq"
        ? "mcq_questions"
        : section === "blank"
        ? "fill_blank_questions"
        : section === "short"
        ? "short_questions"
        : "long_questions";
    const arr = updatedQuiz.quiz_data[secKey];
    if (index + direction < 0 || index + direction >= arr.length) return;
    const temp = arr[index];
    arr[index] = arr[index + direction];
    arr[index + direction] = temp;
    setEditModal({ ...editModal, quiz: updatedQuiz });
  };

  const handleRemove = (section: string, index: number) => {
    const updatedQuiz = { ...editModal.quiz };
    const secKey =
      section === "mcq"
        ? "mcq_questions"
        : section === "blank"
        ? "fill_blank_questions"
        : section === "short"
        ? "short_questions"
        : "long_questions";
    updatedQuiz.quiz_data[secKey].splice(index, 1);
    setEditModal({ ...editModal, quiz: updatedQuiz });
  };

  const handleAddQuestion = (section: string) => {
    const updatedQuiz = { ...editModal.quiz };
    const secKey =
      section === "mcq"
        ? "mcq_questions"
        : section === "blank"
        ? "fill_blank_questions"
        : section === "short"
        ? "short_questions"
        : "long_questions";
    if (!updatedQuiz.quiz_data[secKey]) updatedQuiz.quiz_data[secKey] = [];
    let newQ = {};
    if (section === "mcq")
      newQ = { question_text: "New Question?", options: ["A", "B", "C", "D"], correct_answer: "A", explanation: "" };
    if (section === "blank") newQ = { question_text: "The ____ is blue.", correct_answer: "sky", explanation: "" };
    if (section === "short") newQ = { question_text: "Explain...", correct_answer: "...", explanation: "" };
    if (section === "long")
      newQ = { question_text: "Discuss in detail...", model_answer: "...", key_points: ["Key concept"], explanation: "" };
    updatedQuiz.quiz_data[secKey].push(newQ);
    setEditModal({ ...editModal, quiz: updatedQuiz });
  };

  const handleRegenerate = async (section: string, index: number) => {
    setRegenLoading(`${section}-${index}`);
    const backendSecKey =
      section === "mcq" ? "mcq" : section === "blank" ? "fill_blank" : section === "short" ? "short_answer" : "long_answer";
    const arrKey =
      section === "mcq"
        ? "mcq_questions"
        : section === "blank"
        ? "fill_blank_questions"
        : section === "short"
        ? "short_questions"
        : "long_questions";
    try {
      const { ok, data, error } = await apiFetch(`/quiz/${editModal.quizId}/regenerate-question`, {
        method: "POST",
        body: JSON.stringify({ question_type: backendSecKey, difficulty: "Medium", question_style: questionStyle }),
      });
      if (ok) {
        const updatedQuiz = { ...editModal.quiz };
        updatedQuiz.quiz_data[arrKey][index] = data.new_question;
        setEditModal({ ...editModal, quiz: updatedQuiz });
        toast.success("Question regenerated with fresh AI content! ✨");
      } else {
        toast.error(error || "Regeneration failed.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setRegenLoading(null);
    }
  };

  const toggleAltExpanded = (key: string) => {
    setAltExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAlternative = async (section: string, index: number, altIndex: number) => {
    const key = `${section}-${index}`;
    setSwapLoading(key);
    try {
      const { ok, data, error } = await apiFetch(`/quiz/${editModal.quizId}/swap-question`, {
        method: "POST",
        body: JSON.stringify({
          section,
          index,
          action: "select_alternative",
          alternative_index: altIndex,
        }),
      });
      if (ok && data?.quiz_data) {
        const updatedQuiz = { ...editModal.quiz, quiz_data: data.quiz_data };
        setEditModal({ ...editModal, quiz: updatedQuiz });
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

  const handleGenerateAlternative = async (section: string, index: number, targetStyle: string) => {
    const key = `${section}-${index}-${targetStyle}`;
    setSwapLoading(key);
    try {
      const { ok, data, error } = await apiFetch(`/quiz/${editModal.quizId}/swap-question`, {
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
        const updatedQuiz = { ...editModal.quiz, quiz_data: data.quiz_data };
        setEditModal({ ...editModal, quiz: updatedQuiz });
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

  const handleSaveEdits = async () => {
    setSavingQuiz(true);
    try {
      const { ok, error } = await apiFetch(`/quiz/${editModal.quizId}`, {
        method: "PUT",
        body: JSON.stringify({
          quiz_data: editModal.quiz.quiz_data,
          exam_metadata: editModal.quiz.exam_metadata,
        }),
      });
      if (ok) {
        toast.success("All quiz edits and answers saved safely! 💾");
        setEditModal({ show: false, quizId: null, quiz: null, activeSec: "mcq" });
      } else {
        toast.error(error || "Failed to save edits.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleBookmark = async (qData: any, type: string) => {
    try {
      const { ok } = await apiFetch("/bookmarks", {
        method: "POST",
        body: JSON.stringify({ quiz_id: editModal.quizId, question_type: type, question_data: qData }),
      });
      if (ok) {
        toast.success("⭐ Question Bookmarked to Question Bank!");
        fetchDashboardData();
      }
    } catch {
      toast.error("Error saving bookmark.");
    }
  };

  const handleDeleteBookmark = async (bookmarkId: number) => {
    try {
      const { ok } = await apiFetch(`/bookmarks/${bookmarkId}`, { method: "DELETE" });
      if (ok) {
        setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
        toast.success("Question removed from bank.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete bookmark.");
    }
  };

  const handleCopyQuestion = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (!isMounted) return null;

  const handleLogout = () => {
    clearAuth();
    router.push("/");
  };

  const handleSwitchToStudent = async () => {
    setSwitchingRole(true);
    try {
      const { ok, error } = await switchUserRole("student");
      if (ok) {
        toast.success("Switched to Student Learning Mode! 🎒");
        router.push("/student-dashboard");
      } else {
        toast.error(error || "Failed to switch mode.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setSwitchingRole(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans relative">
      {/* Top Navbar */}
      <nav className="bg-white shadow-xs border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Teacher Pro Workspace
                </h1>
                <span className="text-xs text-gray-400 font-medium">AI Quiz & Exam Architect</span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span className="hidden sm:inline text-sm text-gray-600 font-medium">
                Hello, <strong className="text-gray-900">{teacherName}</strong>
              </span>

              {/* Mode Switcher */}
              <button
                onClick={handleSwitchToStudent}
                disabled={switchingRole}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 tap-press cursor-pointer"
                title="Switch to Student Learning Hub"
              >
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                <span>{switchingRole ? "Switching..." : "Switch to Student Mode"}</span>
              </button>

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors tap-press cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col md:flex-row gap-6 md:gap-8">
        {/* Mobile Horizontal Navigation Chips (md:hidden) */}
        <div className="md:hidden flex overflow-x-auto no-scrollbar gap-2 p-1.5 bg-white rounded-2xl border border-gray-200/80 shadow-xs">
          <button
            onClick={() => setActiveTab("overview")}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all tap-press cursor-pointer ${
              activeTab === "overview" ? "bg-blue-600 text-white shadow-xs" : "text-gray-600 bg-gray-50"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab("create_quiz")}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all tap-press cursor-pointer ${
              activeTab === "create_quiz" ? "bg-blue-600 text-white shadow-xs" : "text-gray-600 bg-gray-50"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Quiz</span>
          </button>
          <button
            onClick={() => setActiveTab("quizzes")}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all tap-press cursor-pointer ${
              activeTab === "quizzes" ? "bg-blue-600 text-white shadow-xs" : "text-gray-600 bg-gray-50"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Quizzes ({quizzes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("classes")}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all tap-press cursor-pointer ${
              activeTab === "classes" ? "bg-blue-600 text-white shadow-xs" : "text-gray-600 bg-gray-50"
            }`}
          >
            <School className="w-3.5 h-3.5" />
            <span>Classes ({classes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("bookmarks")}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all tap-press cursor-pointer ${
              activeTab === "bookmarks" ? "bg-blue-600 text-white shadow-xs" : "text-gray-600 bg-gray-50"
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Bank ({bookmarks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all tap-press cursor-pointer ${
              activeTab === "analytics" ? "bg-blue-600 text-white shadow-xs" : "text-gray-600 bg-gray-50"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Analytics</span>
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all tap-press cursor-pointer ${
              activeTab === "settings" ? "bg-blue-600 text-white shadow-xs" : "text-gray-600 bg-gray-50"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Branding</span>
          </button>
        </div>

        {/* Sidebar Nav (Desktop Only) */}
        <aside className="hidden md:block w-64 shrink-0">
          <div className="bg-white rounded-3xl shadow-xs border border-gray-200/80 p-3 space-y-1.5 sticky top-24">
            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all tap-press cursor-pointer ${
                activeTab === "overview" ? "bg-blue-50 text-blue-700 shadow-xs" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview</span>
            </button>
            <button
              onClick={() => setActiveTab("create_quiz")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all tap-press cursor-pointer ${
                activeTab === "create_quiz" ? "bg-blue-50 text-blue-700 shadow-xs" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Create AI Quiz</span>
            </button>
            <button
              onClick={() => setActiveTab("quizzes")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all tap-press cursor-pointer ${
                activeTab === "quizzes" ? "bg-blue-50 text-blue-700 shadow-xs" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>My Quizzes ({quizzes.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("classes")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all tap-press cursor-pointer ${
                activeTab === "classes" ? "bg-blue-50 text-blue-700 shadow-xs" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <School className="w-4 h-4" />
              <span>Classrooms ({classes.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("bookmarks")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all tap-press cursor-pointer ${
                activeTab === "bookmarks" ? "bg-blue-50 text-blue-700 shadow-xs" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Bookmark className="w-4 h-4" />
              <span>Question Bank ({bookmarks.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all tap-press cursor-pointer ${
                activeTab === "analytics" ? "bg-blue-50 text-blue-700 shadow-xs" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Student Analytics</span>
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all tap-press cursor-pointer ${
                activeTab === "settings" ? "bg-blue-50 text-blue-700 shadow-xs" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Branding & Logo</span>
            </button>
          </div>
        </aside>

        {/* Main View Area */}
        <main className="flex-1">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
            </div>
          ) : (
            <>
              {/* TAB: OVERVIEW */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Dashboard Overview</h2>
                    <p className="text-sm text-gray-500 mt-1">High-level activity metrics across your assessments.</p>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-6 rounded-3xl shadow-xs border border-blue-100/80 flex flex-col items-center justify-center text-center">
                      <p className="text-3xl font-black text-blue-600">{overview.total_quizzes}</p>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Quizzes Generated</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-xs border border-purple-100/80 flex flex-col items-center justify-center text-center">
                      <p className="text-3xl font-black text-purple-600">{overview.total_classes}</p>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Active Classrooms</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-xs border border-amber-100/80 flex flex-col items-center justify-center text-center">
                      <p className="text-3xl font-black text-amber-600">{overview.total_attempts}</p>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Total Submissions</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-xs border border-emerald-100/80 flex flex-col items-center justify-center text-center">
                      <p className="text-3xl font-black text-emerald-600">{overview.avg_score}%</p>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-1">Class Average</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: CREATE QUIZ */}
              {activeTab === "create_quiz" && (
                <div className="space-y-6">
                  <form onSubmit={handleGenerateQuiz} className="bg-white p-6 sm:p-8 rounded-3xl shadow-xs border border-gray-200/80">
                    <h2 className="text-2xl font-black text-gray-900 border-b pb-4 mb-6 tracking-tight">
                      AI Assessment Generator
                    </h2>

                    <div className="mb-6">
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                        1. Select Source Material
                      </label>
                      <div className="grid grid-cols-3 gap-2 bg-gray-100 p-1.5 rounded-2xl">
                        <button
                          type="button"
                          onClick={() => {
                            setInputType("document");
                            clearImageSelection();
                          }}
                          className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                            inputType === "document" ? "bg-white text-blue-600 shadow-xs" : "text-gray-500 hover:text-gray-800"
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
                          className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                            inputType === "youtube" ? "bg-white text-rose-600 shadow-xs" : "text-gray-500 hover:text-gray-800"
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
                          className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                            inputType === "snap" ? "bg-white text-purple-600 shadow-xs" : "text-gray-500 hover:text-gray-800"
                          }`}
                        >
                          <Camera className="w-4 h-4" />
                          <span>Snap & Quiz</span>
                        </button>
                      </div>
                    </div>

                    {inputType === "document" && (
                      <div className="mb-6 p-4 sm:p-5 bg-gradient-to-br from-blue-50/60 via-indigo-50/40 to-purple-50/30 rounded-2xl border-2 border-dashed border-blue-200/90 transition-all hover:border-blue-400">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2.5">
                          <label className="block text-xs font-bold uppercase tracking-wider text-blue-950">
                            Upload PowerPoint Slides or Exam Documents
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
                          accept=".pdf,.pptx,.ppt,.docx,.doc,.txt,.text,.md,.rtf,.csv,.tsv,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/rtf,text/csv"
                          multiple
                          onChange={handleFileChange}
                          className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-extrabold file:bg-blue-600 file:text-white hover:file:bg-blue-700 transition-all border border-gray-200 rounded-xl p-2 bg-white shadow-xs cursor-pointer"
                        />
                        {selectedFiles.length > 0 && (
                          <div className="mt-4 space-y-2">
                            {selectedFiles.map((sf) => {
                              const isSlide = sf.file.name.toLowerCase().endsWith(".pptx") || sf.file.name.toLowerCase().endsWith(".ppt");
                              const isWord = sf.file.name.toLowerCase().endsWith(".docx") || sf.file.name.toLowerCase().endsWith(".doc");
                              const isPdf = sf.file.name.toLowerCase().endsWith(".pdf");

                              return (
                                <div
                                  key={sf.id}
                                  className="p-3.5 bg-white border border-gray-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm shadow-xs"
                                >
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="text-base shrink-0">
                                      {isSlide ? "📊" : isWord ? "📝" : isPdf ? "📄" : "📋"}
                                    </span>
                                    <div className="flex flex-col overflow-hidden">
                                      <span className="font-semibold text-blue-950 truncate max-w-[220px] sm:max-w-xs">{sf.file.name}</span>
                                      <span className="text-[10px] text-gray-400 font-medium">
                                        {isSlide ? "PowerPoint Presentation" : isWord ? "Word Document" : isPdf ? "PDF Document" : "Text Document"}
                                      </span>
                                    </div>
                                  </div>

                                  {sf.isAnalyzing && (
                                    <span className="text-xs text-blue-600 font-bold animate-pulse">Analyzing slides/pages...</span>
                                  )}
                                  {sf.totalPages !== null && (
                                    <div className="flex items-center gap-2 text-xs font-medium bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200">
                                      <span className="font-bold text-indigo-700">
                                        {isSlide ? "Slides:" : "Pages:"}
                                      </span>
                                      <input
                                        type="number"
                                        min="1"
                                        max={sf.totalPages}
                                        value={sf.startPage}
                                        onChange={(e) => updateRange(sf.id, "startPage", parseInt(e.target.value) || 1)}
                                        className="w-14 px-2 py-1 bg-white border rounded-lg text-center font-bold"
                                      />
                                      <span>-</span>
                                      <input
                                        type="number"
                                        min="1"
                                        max={sf.totalPages}
                                        value={sf.endPage}
                                        onChange={(e) => updateRange(sf.id, "endPage", parseInt(e.target.value) || 1)}
                                        className="w-14 px-2 py-1 bg-white border rounded-lg text-center font-bold"
                                      />
                                      <span className="text-gray-500 font-bold">/ {sf.totalPages} {isSlide ? "slides" : "pages"}</span>
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeFile(sf.id)}
                                    className="text-rose-500 font-bold hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs transition-colors shrink-0"
                                  >
                                    Remove
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {inputType === "youtube" && (
                      <div className="mb-6 space-y-4">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                            Paste YouTube Video Link
                          </label>
                          <input
                            type="url"
                            value={youtubeUrl}
                            onChange={(e) => setYoutubeUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm font-medium"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">Start Min</label>
                            <input
                              type="number"
                              min="0"
                              value={ytStartMin}
                              onChange={(e) => setYtStartMin(parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 border rounded-xl bg-gray-50"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">End Min</label>
                            <input
                              type="number"
                              min="1"
                              value={ytEndMin}
                              onChange={(e) => setYtEndMin(parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 border rounded-xl bg-gray-50"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {inputType === "snap" && (
                      <div className="mb-6">
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                          Take a Photo / Upload Textbook Page
                        </label>
                        {!imagePreview ? (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-purple-200 bg-purple-50/50 rounded-2xl p-8 text-center cursor-pointer hover:bg-purple-100/50 transition-all"
                          >
                            <Camera className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                            <p className="font-bold text-sm text-purple-800">Tap to Capture with Camera or Select Image</p>
                          </div>
                        ) : (
                          <div className="relative border rounded-2xl overflow-hidden bg-gray-100 flex justify-center items-center h-64">
                            <img src={imagePreview} alt="Preview" className="h-full object-contain" />
                            <button
                              type="button"
                              onClick={clearImageSelection}
                              className="absolute top-3 right-3 bg-rose-600 text-white p-2 rounded-full hover:bg-rose-700 shadow-md"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </div>
                    )}

                    <div className="mb-6 bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-blue-600" />
                          2. Assessment & Paper Type Configuration
                        </label>
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" /> Auto-Branding Active
                        </span>
                      </div>

                      {/* Institution / University Name (Pre-filled from Teacher Branding) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-gray-700">
                            Institution / Academy / University Name
                          </label>
                          {academyName && (
                            <span className="text-[10px] text-blue-600 font-semibold">
                              ✓ Auto-filled from your Branding profile
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={examInstitution || academyName}
                          onChange={(e) => setExamInstitution(e.target.value)}
                          placeholder="e.g. Arid Agriculture University of Rawalpindi"
                          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-900"
                        />
                      </div>

                      {/* Paper Type Preset Selector */}
                      <div>
                        <label className="text-[11px] font-bold text-gray-700 block mb-1.5">
                          Paper Format Preset
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { id: "midterm", label: "Mid Term Exam", title: "Mid Term Exam" },
                            { id: "final", label: "Final Term Exam", title: "Final Term Exam" },
                            { id: "quiz", label: "Quiz Paper", title: `Quiz No. ${quizNumber.padStart(2, "0")}` },
                            { id: "custom", label: "Class Test / Custom", title: "Class Assessment Test" },
                          ].map((p) => {
                            const isCurrent =
                              (p.id === "quiz" && paperType === "quiz") ||
                              (p.id === "midterm" && paperType === "exam" && (examTitle.toLowerCase().includes("mid") || (!examTitle && p.id === "midterm"))) ||
                              (p.id === "final" && paperType === "exam" && examTitle.toLowerCase().includes("final")) ||
                              (p.id === "custom" && paperType === "exam" && !examTitle.toLowerCase().includes("mid") && !examTitle.toLowerCase().includes("final"));
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  if (p.id === "quiz") {
                                    setPaperType("quiz");
                                    setExamTitle(`Quiz No. ${quizNumber.padStart(2, "0")}`);
                                  } else {
                                    setPaperType("exam");
                                    setExamTitle(p.title);
                                  }
                                }}
                                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                                  isCurrent
                                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                    : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                                }`}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Dynamic Inputs: Title/Quiz Number, Subject, Class/Semester */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {paperType === "quiz" ? (
                          <div>
                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                              Quiz Number
                            </label>
                            <input
                              type="text"
                              value={quizNumber}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQuizNumber(val);
                                setExamTitle(`Quiz No. ${val ? val.padStart(2, "0") : "01"}`);
                              }}
                              placeholder="01"
                              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-center text-gray-900"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                              Examination Title
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Mid Term Exam (Fall-2026)"
                              value={examTitle}
                              onChange={(e) => setExamTitle(e.target.value)}
                              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-900"
                            />
                          </div>
                        )}

                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            Course / Subject Name
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Operating Systems / Physics"
                            value={examSubject}
                            onChange={(e) => setExamSubject(e.target.value)}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-900"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            {academicTier === "University"
                              ? "Semester & Degree"
                              : academicTier === "College"
                              ? "Class / Year"
                              : "Class / Grade"}
                          </label>
                          <input
                            type="text"
                            placeholder={
                              academicTier === "University"
                                ? "e.g. BSCS 5th Semester"
                                : academicTier === "College"
                                ? "e.g. 1st Year (FSc Pre-Engineering)"
                                : "e.g. 10th Class (Section A)"
                            }
                            value={examClass}
                            onChange={(e) => setExamClass(e.target.value)}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-900"
                          />
                        </div>

                        {academicTier === "University" && (
                          <div className="sm:col-span-3">
                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                              Course Code & Number (University Only)
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. CSC-204 / CS-301"
                              value={courseCode}
                              onChange={(e) => setCourseCode(e.target.value)}
                              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-900"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 🎓 Academic Level & Examination Track Presets */}
                    <div className="mb-6 bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
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
                          <span><strong>Quick Quiz Mode:</strong> Standard balanced test with MCQs, fill-in-the-blanks, and short questions.</span>
                        )}
                      </div>
                    </div>

                    <div className="mb-8">
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                        3. Question Counts & Configuration
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                        <div>
                          <label className="font-bold text-gray-500 block mb-1">MCQs</label>
                          <input
                            type="number"
                            min="0"
                            value={numMcq}
                            onChange={(e) => setNumMcq(parseInt(e.target.value) || 0)}
                            className="w-full px-2.5 py-2 border rounded-xl font-bold text-center"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-gray-500 block mb-1">Blanks</label>
                          <input
                            type="number"
                            min="0"
                            value={numFillBlank}
                            onChange={(e) => setNumFillBlank(parseInt(e.target.value) || 0)}
                            className="w-full px-2.5 py-2 border rounded-xl font-bold text-center"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-gray-500 block mb-1">Short</label>
                          <input
                            type="number"
                            min="0"
                            value={numShort}
                            onChange={(e) => setNumShort(parseInt(e.target.value) || 0)}
                            className="w-full px-2.5 py-2 border rounded-xl font-bold text-center"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-gray-500 block mb-1">Long</label>
                          <input
                            type="number"
                            min="0"
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
                            className="w-full px-2 py-2 border rounded-xl font-bold text-xs"
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
                      disabled={generatingQuiz}
                      className="w-full py-4 bg-gray-900 hover:bg-black text-white font-extrabold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {generatingQuiz ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          <span>AI Engine Generating Questions...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5 text-amber-400" />
                          <span>Generate Assessment</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* TAB: MY QUIZZES */}
              {activeTab === "quizzes" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-black text-gray-900 tracking-tight">My Created Assessments</h2>
                      <p className="text-sm text-gray-500 mt-0.5">Manage, export to PDF/DOCX, or edit question bank.</p>
                    </div>
                    <button
                      onClick={() => setActiveTab("create_quiz")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Quiz</span>
                    </button>
                  </div>

                  {quizzes.length === 0 ? (
                    <div className="bg-white p-12 rounded-3xl text-center border border-gray-100">
                      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="font-bold text-gray-600">No quizzes created yet.</p>
                      <p className="text-xs text-gray-400 mt-1">Generate your first AI assessment from the sidebar.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {quizzes.map((q) => (
                        <div
                          key={q.id}
                          className="bg-white p-5 rounded-3xl border border-gray-200/80 shadow-xs hover:border-blue-200 transition-all flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex justify-between items-start gap-2 mb-2">
                              <h3 className="font-extrabold text-base text-gray-900 line-clamp-1">{q.title}</h3>
                              <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full shrink-0">
                                {q.subject || "General"}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400 block mb-4">Created: {q.date}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
                            <button
                              onClick={() => openEditor(q.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => openExportModal(q, "pdf")}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors"
                              title="Export Print-Ready PDF Question Paper"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>PDF Paper</span>
                            </button>
                            <button
                              onClick={() => openExportModal(q, "docx")}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors"
                              title="Export Editable Word (.docx) Question Paper"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Word (.docx)</span>
                            </button>
                            <button
                              onClick={() => setDeleteConfirm({ show: true, quizId: q.id })}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-colors ml-auto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: CLASSROOMS (WITH DIRECT ASSIGNMENT) */}
              {activeTab === "classes" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Classrooms & Assignments</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Create student batches and assign homework or exams directly.
                    </p>
                  </div>

                  <form onSubmit={handleCreateClass} className="flex gap-3">
                    <input
                      type="text"
                      placeholder="New Batch Name (e.g. BSCS Fall 2026)"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                      className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                    />
                    <button
                      type="submit"
                      disabled={creatingClass}
                      className="px-6 py-3 bg-blue-600 text-white font-bold text-sm rounded-2xl hover:bg-blue-700 transition-all shadow-xs"
                    >
                      {creatingClass ? "Creating..." : "Create Class"}
                    </button>
                  </form>

                  <div className="space-y-4">
                    {classes.map((c) => (
                      <div key={c.id} className="bg-white p-6 rounded-3xl border border-gray-200/80 shadow-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
                          <div>
                            <h3 className="font-black text-lg text-gray-900">{c.name}</h3>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                              <span>
                                Join Code: <strong className="font-mono text-blue-700 font-bold">{c.join_code}</strong>
                              </span>
                              <span>•</span>
                              <span>{c.student_count || 0} Enrolled Students</span>
                            </div>
                          </div>

                          <button
                            onClick={() =>
                              setAssignModal({
                                show: true,
                                classId: c.id,
                                className: c.name,
                                selectedQuizId: quizzes[0]?.id || "",
                                dueDate: "",
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Assign Quiz</span>
                          </button>
                        </div>

                        {/* Assigned Quizzes Section */}
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                              Assigned Quizzes ({c.assignments?.length || 0})
                            </h4>
                          </div>

                          {!c.assignments || c.assignments.length === 0 ? (
                            <p className="text-xs text-gray-400 italic bg-gray-50/60 p-3 rounded-2xl border border-gray-100">
                              No quizzes assigned to this classroom yet. Click "Assign Quiz" above to assign an exam.
                            </p>
                          ) : (
                            <div className="space-y-2.5">
                              {c.assignments.map((asgn: any) => (
                                <div
                                  key={asgn.id}
                                  className="p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                                >
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h5 className="font-bold text-sm text-slate-900">{asgn.quiz_title}</h5>
                                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        {asgn.submission_count || 0} / {c.student_count || 0} Submitted
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                      <span>{asgn.subject || "General"}</span>
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

                                  <button
                                    onClick={() => handleOpenSubmissions(asgn.id)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer tap-press self-start sm:self-auto"
                                  >
                                    <Users className="w-3.5 h-3.5" />
                                    <span>View Gradebook ({asgn.submission_count || 0})</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB: QUESTION BANK / BOOKMARKS */}
              {activeTab === "bookmarks" && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-black text-gray-900 tracking-tight">Question Bank & Bookmarks</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Your library of starred and high-value exam questions.
                      </p>
                    </div>

                    <div className="inline-flex p-1 bg-gray-100 rounded-xl self-start">
                      {["all", "mcq", "fill_blank", "short_answer", "long_answer"].map((type) => (
                        <button
                          key={type}
                          onClick={() => setBookmarkFilter(type)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all ${
                            bookmarkFilter === type ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          {type.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {bookmarks.length === 0 ? (
                    <div className="bg-white p-12 rounded-3xl text-center border border-gray-100">
                      <Bookmark className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="font-bold text-gray-600">No bookmarked questions yet.</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Click the star icon (⭐) when editing any quiz to save questions into your question bank.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {bookmarks
                        .filter((b) => (bookmarkFilter === "all" ? true : b.question_type === bookmarkFilter))
                        .map((b) => (
                          <div key={b.id} className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                                {b.question_type.replace("_", " ")}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleCopyQuestion(b.question_data?.question_text || "", b.id)}
                                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                  title="Copy text"
                                >
                                  {copiedId === b.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => handleDeleteBookmark(b.id)}
                                  className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Delete bookmark"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <p className="font-bold text-base text-gray-900 mb-2">
                              {b.question_data?.question_text}
                            </p>

                            {b.question_data?.correct_answer && (
                              <p className="text-xs text-emerald-800 font-medium bg-emerald-50 px-3 py-1.5 rounded-xl inline-block">
                                Answer: {b.question_data.correct_answer}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: ANALYTICS */}
              {activeTab === "analytics" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Recent Student Attempts</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Live log of submitted exams across your classrooms.</p>
                  </div>

                  <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-extrabold text-gray-500">
                          <tr>
                            <th className="px-6 py-4">Student</th>
                            <th className="px-6 py-4">Quiz Title</th>
                            <th className="px-6 py-4">Score</th>
                            <th className="px-6 py-4">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {recentAttempts.map((a) => (
                            <tr key={a.id} className="hover:bg-gray-50/60">
                              <td className="px-6 py-4 font-bold text-gray-900">{a.student_name}</td>
                              <td className="px-6 py-4 text-gray-700">{a.quiz_title}</td>
                              <td className="px-6 py-4">
                                <span
                                  className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                                    a.score_percent >= 70
                                      ? "bg-emerald-100 text-emerald-800"
                                      : a.score_percent >= 50
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {a.score_percent}%
                                </span>
                              </td>
                              <td className="px-6 py-4 text-gray-400 text-xs">{a.date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: SETTINGS & BRANDING */}
              {activeTab === "settings" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Academy Branding & Header</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Configure institutional headers for PDF and Word exports.</p>
                  </div>

                  <form onSubmit={handleSaveBranding} className="bg-white p-8 rounded-3xl border border-gray-200/80 shadow-xs space-y-6 max-w-xl">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                        Academy / Institution Name
                      </label>
                      <input
                        type="text"
                        value={academyName}
                        onChange={(e) => setAcademyName(e.target.value)}
                        placeholder="e.g. Apex Learning Institute"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                        Optional Academy Logo (Max 2MB)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700"
                      />
                      {logoBase64 && (
                        <div className="mt-3 flex items-center gap-3">
                          <img src={logoBase64} alt="Logo" className="w-12 h-12 object-contain rounded-lg border p-1" />
                          <button
                            type="button"
                            onClick={() => setLogoBase64("")}
                            className="text-xs text-rose-500 font-bold hover:underline"
                          >
                            Remove Logo
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={savingBranding}
                      className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black transition-all shadow-md"
                    >
                      {savingBranding ? "Saving..." : "Save Branding Settings"}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ASSIGN QUIZ MODAL */}
      {assignModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white max-w-md w-full p-6 sm:p-8 rounded-3xl shadow-xl border border-gray-100">
            <h3 className="text-xl font-black text-gray-900 mb-1">Assign Quiz to Batch</h3>
            <p className="text-xs text-gray-500 mb-5">Class: <strong>{assignModal.className}</strong></p>

            <form onSubmit={handleAssignQuiz} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Select Quiz</label>
                <select
                  value={assignModal.selectedQuizId}
                  onChange={(e) => setAssignModal({ ...assignModal, selectedQuizId: parseInt(e.target.value) || "" })}
                  className="w-full px-3 py-2.5 border rounded-xl font-medium text-sm bg-gray-50"
                  required
                >
                  <option value="" disabled>-- Select Assessment --</option>
                  {quizzes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title} ({q.subject || "General"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Due Date (Optional)</label>
                <input
                  type="date"
                  value={assignModal.dueDate}
                  onChange={(e) => setAssignModal({ ...assignModal, dueDate: e.target.value })}
                  className="w-full px-3 py-2.5 border rounded-xl font-medium text-sm bg-gray-50"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setAssignModal({ show: false, classId: null, className: "", selectedQuizId: "", dueDate: "" })}
                  className="flex-1 py-3 text-gray-600 font-bold rounded-xl hover:bg-gray-100 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 text-sm shadow-md"
                >
                  {assigning ? "Assigning..." : "Assign to Class"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL SCREEN QUIZ EDITOR MODAL */}
      {editModal.show && editModal.quiz && (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
          <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-xs">
            <div>
              <h2 className="text-lg font-black text-gray-900">Quiz Editor & Question Customizer</h2>
              <p className="text-xs text-gray-500">Edit text, tweak correct answers, or regenerate with AI.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setEditModal({ show: false, quizId: null, quiz: null, activeSec: "mcq" })}
                className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdits}
                disabled={savingQuiz}
                className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-sm text-xs"
              >
                {savingQuiz ? "Saving..." : "Save All Changes"}
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Editor Sidebar */}
            <div className="w-56 bg-white border-r p-4 space-y-2">
              <button
                onClick={() => setEditModal({ ...editModal, activeSec: "mcq" })}
                className={`w-full text-left px-4 py-2.5 rounded-xl font-bold text-xs ${
                  editModal.activeSec === "mcq" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Multiple Choice
              </button>
              <button
                onClick={() => setEditModal({ ...editModal, activeSec: "blank" })}
                className={`w-full text-left px-4 py-2.5 rounded-xl font-bold text-xs ${
                  editModal.activeSec === "blank" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Fill in Blanks
              </button>
              <button
                onClick={() => setEditModal({ ...editModal, activeSec: "short" })}
                className={`w-full text-left px-4 py-2.5 rounded-xl font-bold text-xs ${
                  editModal.activeSec === "short" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Short Questions
              </button>
              <button
                onClick={() => setEditModal({ ...editModal, activeSec: "long" })}
                className={`w-full text-left px-4 py-2.5 rounded-xl font-bold text-xs ${
                  editModal.activeSec === "long" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Long Explanations
              </button>
            </div>

            {/* Editor Content Area */}
            <div className="flex-1 p-6 sm:p-8 overflow-y-auto bg-gray-50">
              <div className="max-w-3xl mx-auto space-y-6">
                {editModal.quiz.quiz_data[
                  editModal.activeSec === "mcq"
                    ? "mcq_questions"
                    : editModal.activeSec === "blank"
                    ? "fill_blank_questions"
                    : editModal.activeSec === "short"
                    ? "short_questions"
                    : "long_questions"
                ]?.map((q: any, index: number) => (
                  <div key={index} className="bg-white p-6 rounded-3xl shadow-xs border border-gray-200/80 group relative">
                    <div className="absolute top-4 right-4 flex opacity-80 group-hover:opacity-100 transition-opacity gap-1">
                      <button
                        onClick={() => handleBookmark(q, editModal.activeSec)}
                        className="p-2 bg-gray-50 text-amber-500 rounded-lg hover:bg-amber-50"
                        title="Star / Save to Question Bank"
                      >
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      </button>
                      <button
                        onClick={() => handleRegenerate(editModal.activeSec, index)}
                        disabled={regenLoading === `${editModal.activeSec}-${index}`}
                        className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                        title="Regenerate with AI"
                      >
                        <RefreshCw className={`w-4 h-4 ${regenLoading === `${editModal.activeSec}-${index}` ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        onClick={() => handleMove(editModal.activeSec, index, -1)}
                        className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100"
                        title="Move Up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMove(editModal.activeSec, index, 1)}
                        className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100"
                        title="Move Down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemove(editModal.activeSec, index)}
                        className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100"
                        title="Delete Question"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-black text-blue-600 uppercase tracking-widest">
                        Question {index + 1}
                      </p>
                      {editModal.activeSec === "mcq" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          1 Mark
                        </span>
                      )}
                      {editModal.activeSec === "blank" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          1 Mark
                        </span>
                      )}
                      {editModal.activeSec === "short" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          2 Marks
                        </span>
                      )}
                      {editModal.activeSec === "long" && (() => {
                        const isDiagram = [
                          "graph", "tree", "diagram", "draw", "sketch", "flowchart", "plot", "visualize",
                          "dijkstra", "kruskal", "prim", "bfs", "dfs", "avl", "b-tree", "b+ tree",
                          "binary search tree", "bst", "heap", "min-heap", "max-heap", "red-black",
                          "state machine", "transition diagram", "er diagram", "erd", "schema diagram",
                          "architecture diagram", "dynamic programming table", "knapsack", "recursion tree",
                          "trace the algorithm", "step-by-step trace", "traversal", "topological"
                        ].some(kw => `${q.question_text || ""} ${q.model_answer || ""}`.toLowerCase().includes(kw));
                        const marksVal = q.marks === 6 || q.marks === 10 ? q.marks : (isDiagram ? 10 : 6);
                        return (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${marksVal === 10 ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                            {marksVal} Marks {marksVal === 10 ? "⚡ (Diagram / DSA / Visual)" : "(Comprehensive)"}
                          </span>
                        );
                      })()}
                    </div>
                    <textarea
                      value={q.question_text || ""}
                      onChange={(e) => handleEditChange(editModal.activeSec, index, "question_text", e.target.value)}
                      className="w-full text-base font-bold text-gray-900 p-2 border border-transparent hover:border-gray-200 focus:border-blue-500 outline-none rounded-xl resize-none"
                      rows={2}
                    />

                    {editModal.activeSec === "mcq" && (
                      <div className="mt-3 space-y-2 pl-4 border-l-2 border-blue-200">
                        {q.options?.map((opt: string, oIdx: number) => (
                          <div key={oIdx} className="flex items-center gap-2">
                            <span className="font-bold text-xs text-gray-400">{String.fromCharCode(65 + oIdx)}.</span>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const newOpts = [...q.options];
                                newOpts[oIdx] = e.target.value;
                                handleEditChange(editModal.activeSec, index, "options", newOpts);
                              }}
                              className="flex-1 p-2 bg-gray-50 border rounded-xl text-xs font-medium"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-100">
                      <p className="text-xs font-bold text-emerald-800 uppercase mb-1">Correct / Model Answer</p>
                      <textarea
                        value={q.correct_answer || q.model_answer || ""}
                        onChange={(e) =>
                          handleEditChange(
                            editModal.activeSec,
                            index,
                            q.correct_answer !== undefined ? "correct_answer" : "model_answer",
                            e.target.value
                          )
                        }
                        className="w-full bg-transparent p-1 outline-none text-xs font-bold text-emerald-900 resize-none"
                        rows={2}
                      />
                    </div>

                    <div className="mt-2 p-3 bg-blue-50/50 rounded-2xl border border-blue-100">
                      <p className="text-xs font-bold text-blue-800 uppercase mb-1">Explanation / Rationale</p>
                      <textarea
                        value={q.explanation || (q.key_points ? q.key_points.join(", ") : "")}
                        onChange={(e) => handleEditChange(editModal.activeSec, index, "explanation", e.target.value)}
                        className="w-full bg-transparent p-1 outline-none text-xs font-medium text-blue-900 resize-none"
                        rows={2}
                      />
                    </div>

                    {/* 🔀 ALTERNATIVE QUESTIONS & STYLE SWAPPER */}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            Alternative Questions
                          </span>
                          {q.style_type && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                              Active: {q.style_type}
                            </span>
                          )}
                          {(q.alternatives || []).length > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              {(q.alternatives || []).length} Ready
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleAltExpanded(`${editModal.activeSec}-${index}`)}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 py-1 px-2.5 rounded-xl hover:bg-indigo-50 transition-colors cursor-pointer"
                        >
                          {altExpanded[`${editModal.activeSec}-${index}`] ? "Hide Alternatives" : "Show / Swap Alternatives"}
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${altExpanded[`${editModal.activeSec}-${index}`] ? "rotate-180" : ""}`} />
                        </button>
                      </div>

                      {altExpanded[`${editModal.activeSec}-${index}`] && (
                        <div className="mt-3 p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-3">
                          {/* Ready-to-Swap Alternatives */}
                          {(q.alternatives || []).length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                Ready-to-Swap Alternatives:
                              </p>
                              {(q.alternatives || []).map((alt: any, altIdx: number) => (
                                <div
                                  key={altIdx}
                                  className="p-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wide ${
                                        alt.style_type === "coding" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                        alt.style_type === "conceptual" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                                        alt.style_type === "scenario" ? "bg-purple-50 text-purple-700 border border-purple-200" :
                                        alt.style_type === "difference" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                                        alt.style_type === "definition" ? "bg-teal-50 text-teal-700 border border-teal-200" :
                                        "bg-slate-100 text-slate-700 border border-slate-200"
                                      }`}>
                                        {alt.style_type || "Alternative"}
                                      </span>
                                      {alt.clo && <span className="text-[10px] font-semibold text-slate-400">[{alt.clo}]</span>}
                                    </div>
                                    <p className="text-xs font-semibold text-slate-800 line-clamp-2">{alt.question_text}</p>
                                    {(alt.correct_answer || alt.model_answer) && (
                                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-1 italic">
                                        Answer: {alt.correct_answer || alt.model_answer}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    disabled={swapLoading === `${editModal.activeSec}-${index}`}
                                    onClick={() => handleSelectAlternative(editModal.activeSec, index, altIdx)}
                                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                                  >
                                    {swapLoading === `${editModal.activeSec}-${index}` ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <span>🔄 Select This Question</span>
                                    )}
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic">No pre-generated alternatives for this question yet.</p>
                          )}

                          {/* Live Generate New Alternative Buttons */}
                          <div className="pt-2.5 border-t border-slate-200/60">
                            <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                              Generate Fresh Alternative with AI:
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {[
                                { id: "conceptual", label: "💡 Conceptual" },
                                { id: "coding", label: "💻 Coding / Tracing" },
                                { id: "scenario", label: "🏢 Scenario Dilemma" },
                                { id: "difference", label: "⚖️ Differentiate" },
                                { id: "definition", label: "📖 Core Definition" },
                              ].map((st) => (
                                <button
                                  key={st.id}
                                  type="button"
                                  disabled={Boolean(swapLoading)}
                                  onClick={() => handleGenerateAlternative(editModal.activeSec, index, st.id)}
                                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 hover:border-indigo-400 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                                >
                                  {swapLoading === `${editModal.activeSec}-${index}-${st.id}` ? (
                                    <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
                                  ) : null}
                                  <span>{st.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => handleAddQuestion(editModal.activeSec)}
                  className="w-full py-4 border-2 border-dashed border-gray-300 text-gray-500 font-bold rounded-2xl hover:bg-white hover:border-blue-300 hover:text-blue-600 transition-colors text-xs"
                >
                  + Add New Manual Question
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBMISSIONS GRADEBOOK MODAL */}
      {submissionsModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 uppercase">
                    Official Gradebook
                  </span>
                  {submissionsModal.data?.classroom_name && (
                    <span className="text-xs text-gray-500 font-bold">
                      Batch: {submissionsModal.data.classroom_name}
                    </span>
                  )}
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight mt-1">
                  {submissionsModal.data?.quiz_title || "Assignment Submissions"}
                </h3>
              </div>
              <button
                onClick={() => setSubmissionsModal({ show: false, assignmentId: null, loading: false, data: null, selectedSubmission: null })}
                className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {submissionsModal.loading ? (
              <div className="py-16 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"></div>
                <p className="text-sm font-semibold text-gray-600">Loading Student Submissions & Marks...</p>
              </div>
            ) : submissionsModal.selectedSubmission ? (
              /* INDIVIDUAL STUDENT EXAM INSPECTION VIEW */
              <div className="space-y-5 animate-fade-in">
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                  <div>
                    <h4 className="font-extrabold text-base text-slate-900">
                      {submissionsModal.selectedSubmission.student_name}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {submissionsModal.selectedSubmission.student_email} • Submitted: {submissionsModal.selectedSubmission.submitted_at}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-lg font-black text-indigo-700">
                        {submissionsModal.selectedSubmission.score} / {submissionsModal.selectedSubmission.max_score}
                      </span>
                      <span className="block text-xs font-bold text-gray-500">
                        {submissionsModal.selectedSubmission.score_percent}%
                      </span>
                    </div>
                    <button
                      onClick={() => setSubmissionsModal((prev) => ({ ...prev, selectedSubmission: null }))}
                      className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      Back to List
                    </button>
                  </div>
                </div>

                {/* Question-by-question breakdown for Teacher */}
                <div className="space-y-4">
                  {submissionsModal.selectedSubmission.results?.mcq?.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Multiple Choice Questions</h5>
                      <div className="space-y-2.5">
                        {submissionsModal.selectedSubmission.results.mcq.map((q: any, i: number) => (
                          <div key={i} className="p-3.5 rounded-xl border border-gray-200 bg-white text-xs space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-gray-900">Q{i + 1}. {q.question}</span>
                              <span className={`px-2 py-0.5 rounded-md font-bold ${q.is_correct ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                {q.is_correct ? "Correct (+1)" : "Incorrect (0)"}
                              </span>
                            </div>
                            <p className="text-gray-600">Student Choice: <strong className={q.is_correct ? "text-emerald-700" : "text-rose-600"}>{q.selected || "(Blank)"}</strong></p>
                            {!q.is_correct && <p className="text-emerald-700">Correct Answer: {q.correct_answer}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {submissionsModal.selectedSubmission.results?.fill_blank?.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Fill in the Blanks</h5>
                      <div className="space-y-2.5">
                        {submissionsModal.selectedSubmission.results.fill_blank.map((q: any, i: number) => (
                          <div key={i} className="p-3.5 rounded-xl border border-gray-200 bg-white text-xs space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-gray-900">Q{i + 1}. {q.question}</span>
                              <span className={`px-2 py-0.5 rounded-md font-bold ${q.is_correct ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                {q.is_correct ? "Correct (+1)" : "Incorrect (0)"}
                              </span>
                            </div>
                            <p className="text-gray-600">Student Answer: <strong className={q.is_correct ? "text-emerald-700" : "text-rose-600"}>{q.student_answer || "(Blank)"}</strong></p>
                            {!q.is_correct && <p className="text-emerald-700">Correct Answer: {q.correct_answer}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {[...(submissionsModal.selectedSubmission.results?.short || []), ...(submissionsModal.selectedSubmission.results?.long || [])].length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Descriptive Answers (AI Evaluated)</h5>
                      <div className="space-y-2.5">
                        {[...(submissionsModal.selectedSubmission.results?.short || []), ...(submissionsModal.selectedSubmission.results?.long || [])].map((q: any, i: number) => (
                          <div key={i} className="p-3.5 rounded-xl border border-gray-200 bg-white text-xs space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-bold text-gray-900">Q{i + 1}. {q.question}</span>
                              <span className="px-2 py-0.5 rounded-md font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                AI Score: {q.score_percent}%
                              </span>
                            </div>
                            <p className="text-gray-700 bg-gray-50 p-2 rounded-lg">Student Written: {q.student_answer || "(No Answer Given)"}</p>
                            <p className="text-emerald-800 font-medium">Model Answer: {q.model_answer}</p>
                            {q.feedback && <p className="text-indigo-900 bg-indigo-50/40 p-2 rounded-lg border border-indigo-100">AI Feedback: {q.feedback}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : !submissionsModal.data?.submissions || submissionsModal.data.submissions.length === 0 ? (
              <div className="py-12 bg-gray-50 rounded-2xl text-center border border-gray-200">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <h4 className="font-bold text-gray-700">No Submissions Yet</h4>
                <p className="text-xs text-gray-400 mt-1">
                  Enrolled students have not submitted this quiz yet. Scores will appear here automatically once submitted.
                </p>
              </div>
            ) : (
              /* SUBMISSIONS TABLE */
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100">
                    <span className="text-xs font-bold text-indigo-700 uppercase block mb-1">Total Submissions</span>
                    <span className="text-2xl font-black text-indigo-950">{submissionsModal.data.submissions.length}</span>
                  </div>
                  <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100">
                    <span className="text-xs font-bold text-emerald-700 uppercase block mb-1">Average Score</span>
                    <span className="text-2xl font-black text-emerald-950">
                      {Math.round(
                        submissionsModal.data.submissions.reduce((acc: number, s: any) => acc + (s.score_percent || 0), 0) /
                          submissionsModal.data.submissions.length
                      )}%
                    </span>
                  </div>
                  <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-100">
                    <span className="text-xs font-bold text-purple-700 uppercase block mb-1">Highest Score</span>
                    <span className="text-2xl font-black text-purple-950">
                      {Math.max(...submissionsModal.data.submissions.map((s: any) => s.score_percent || 0))}%
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-gray-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-extrabold text-gray-500">
                      <tr>
                        <th className="px-5 py-3.5">Student Name</th>
                        <th className="px-5 py-3.5">Email</th>
                        <th className="px-5 py-3.5">Score</th>
                        <th className="px-5 py-3.5">Percentage</th>
                        <th className="px-5 py-3.5">Submission Date</th>
                        <th className="px-5 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {submissionsModal.data.submissions.map((sub: any) => (
                        <tr key={sub.attempt_id} className="hover:bg-gray-50/60">
                          <td className="px-5 py-3.5 font-bold text-gray-900">{sub.student_name}</td>
                          <td className="px-5 py-3.5 text-gray-500 text-xs">{sub.student_email}</td>
                          <td className="px-5 py-3.5 font-bold text-gray-800">
                            {sub.score} / {sub.max_score}
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                                sub.score_percent >= 70
                                  ? "bg-emerald-100 text-emerald-800"
                                  : sub.score_percent >= 50
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {sub.score_percent}%
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-gray-400 text-xs">{sub.submitted_at}</td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => setSubmissionsModal((prev) => ({ ...prev, selectedSubmission: sub }))}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Paper</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONFIRMATION POPUP */}
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

      {/* EXECUTIVE EXAMINATION PAPER STUDIO MODAL */}
      {exportModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white max-w-2xl w-full rounded-3xl shadow-2xl border border-gray-100 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 px-6 py-5 text-white relative">
              <button
                onClick={() => setExportModal((prev) => ({ ...prev, show: false }))}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[11px] font-semibold tracking-wide uppercase mb-1.5 border border-blue-400/30">
                <School className="w-3.5 h-3.5" />
                <span>Executive University Examination Studio</span>
              </div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                Configure Examination Paper
              </h3>
              <p className="text-xs text-blue-200/80 mt-0.5">
                Generate official photocopy/print-ready Word (.docx) & PDF question papers formatted to royal university standards.
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              
              {/* ANTI-CHEATING SET SELECTOR */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Anti-Cheating Paper Variant (Row Alternation)
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setExportModal((prev) => ({ ...prev, examSet: "Set A" }))}
                    className={`p-3 rounded-2xl border text-left transition-all relative ${
                      exportModal.examSet === "Set A"
                        ? "border-blue-600 bg-blue-50/50 shadow-xs ring-2 ring-blue-500/20"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black text-blue-900">SET A (Primary)</span>
                      {exportModal.examSet === "Set A" && (
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 leading-tight">
                      Standard question order for Rows 1, 3, 5.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportModal((prev) => ({ ...prev, examSet: "Set B" }))}
                    className={`p-3 rounded-2xl border text-left transition-all relative ${
                      exportModal.examSet === "Set B"
                        ? "border-purple-600 bg-purple-50/50 shadow-xs ring-2 ring-purple-500/20"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black text-purple-900">SET B (Anti-Cheat)</span>
                      {exportModal.examSet === "Set B" && (
                        <CheckCircle2 className="w-4 h-4 text-purple-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 leading-tight">
                      Shuffled questions & options for Rows 2, 4, 6.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportModal((prev) => ({ ...prev, examSet: "Standard" }))}
                    className={`p-3 rounded-2xl border text-left transition-all relative ${
                      exportModal.examSet === "Standard"
                        ? "border-slate-700 bg-slate-50 shadow-xs ring-2 ring-slate-500/20"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black text-slate-800">Standard</span>
                      {exportModal.examSet === "Standard" && (
                        <CheckCircle2 className="w-4 h-4 text-slate-700" />
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 leading-tight">
                      Standard exam without Set labels.
                    </p>
                  </button>
                </div>
              </div>

              {/* ACADEMIC TIER & PAPER FORMAT SELECTION */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                    <span>Academic Format & Paper Standard</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    {exportModal.academicTier} Tier Active
                  </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      Academic Tier
                    </label>
                    <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-gray-200">
                      {[
                        { id: "University", label: "University", icon: "🎓" },
                        { id: "College", label: "College", icon: "🏛️" },
                        { id: "School", label: "School", icon: "🏫" },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            const newTier = t.id as "University" | "College" | "School";
                            setExportModal((prev) => ({
                              ...prev,
                              academicTier: newTier,
                              courseCode: newTier === "University" ? (prev.courseCode || "CSC-204") : "",
                              className: prev.className || (newTier === "University" ? "BSCS 5th" : newTier === "School" ? "10th" : "1st Year"),
                            }));
                          }}
                          className={`py-1.5 px-2 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            exportModal.academicTier === t.id
                              ? "bg-blue-600 text-white shadow-xs"
                              : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          <span>{t.icon}</span> <span>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      Paper Format
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-xl border border-gray-200">
                      <button
                        type="button"
                        onClick={() => {
                          setExportModal((prev) => ({
                            ...prev,
                            paperType: "exam",
                            examTitle: "Mid Term Examination (Fall-2026)",
                            durationMinutes: 75,
                            totalMarks: 50,
                          }));
                        }}
                        className={`py-1.5 px-2 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          exportModal.paperType === "exam"
                            ? "bg-blue-600 text-white shadow-xs"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        📄 Term Exam
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const qNum = exportModal.quizNumber || "01";
                          setExportModal((prev) => ({
                            ...prev,
                            paperType: "quiz",
                            examTitle: `Quiz No. ${qNum.padStart(2, "0")}`,
                            durationMinutes: 20,
                            totalMarks: 10,
                          }));
                        }}
                        className={`py-1.5 px-2 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          exportModal.paperType === "quiz"
                            ? "bg-blue-600 text-white shadow-xs"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        ⚡ Quiz
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* INSTITUTION & DEPARTMENT HEADER FIELDS */}
              <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                    <School className="w-3.5 h-3.5 text-blue-600" />
                    <span>Institutional Header Details</span>
                  </div>
                  {academyName && (
                    <span className="text-[10px] text-blue-600 font-semibold">
                      ✓ Auto-filled from Teacher Branding
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      Institution / University / Academy Name
                    </label>
                    <input
                      type="text"
                      value={exportModal.institutionName}
                      onChange={(e) => setExportModal((prev) => ({ ...prev, institutionName: e.target.value }))}
                      placeholder="e.g. Arid Agriculture University of Rawalpindi"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      Department / Faculty
                    </label>
                    <input
                      type="text"
                      value={exportModal.departmentName}
                      onChange={(e) => setExportModal((prev) => ({ ...prev, departmentName: e.target.value }))}
                      placeholder="e.g. Department of Computer Science & Engineering"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* COURSE & EXAM METADATA */}
              <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100 space-y-3">
                <div className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>Course & Examination Paper Metadata</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {exportModal.paperType === "quiz" ? (
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        Quiz Number (e.g. 01, 02)
                      </label>
                      <input
                        type="text"
                        value={exportModal.quizNumber}
                        onChange={(e) => {
                          const val = e.target.value;
                          setExportModal((prev) => ({
                            ...prev,
                            quizNumber: val,
                            examTitle: `Quiz No. ${val ? val.padStart(2, "0") : "01"}`,
                          }));
                        }}
                        placeholder="01"
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-bold text-gray-600">
                          Examination Title
                        </label>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setExportModal((prev) => ({ ...prev, examTitle: "Mid Term Examination (Fall-2026)" }))}
                            className="text-[10px] text-blue-600 font-bold hover:underline"
                          >
                            Midterm
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            type="button"
                            onClick={() => setExportModal((prev) => ({ ...prev, examTitle: "Final Term Examination (Fall-2026)" }))}
                            className="text-[10px] text-blue-600 font-bold hover:underline"
                          >
                            Final
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={exportModal.examTitle}
                        onChange={(e) => setExportModal((prev) => ({ ...prev, examTitle: e.target.value }))}
                        placeholder="e.g. Mid Term Examination (Fall-2026)"
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      Examination Category (Format Header)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setExportModal((prev) => ({ ...prev, examCategory: "THEORY" }))}
                        className={`flex-1 py-2 px-3 rounded-xl border text-xs font-black transition-all ${
                          exportModal.examCategory === "THEORY"
                            ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        THEORY
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportModal((prev) => ({ ...prev, examCategory: "PRACTICAL" }))}
                        className={`flex-1 py-2 px-3 rounded-xl border text-xs font-black transition-all ${
                          exportModal.examCategory === "PRACTICAL"
                            ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        PRACTICAL
                      </button>
                    </div>
                  </div>

                  {/* Course Code ONLY FOR UNIVERSITY */}
                  {exportModal.academicTier === "University" ? (
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        Course Code & Number (University Only)
                      </label>
                      <input
                        type="text"
                        value={exportModal.courseCode}
                        onChange={(e) => setExportModal((prev) => ({ ...prev, courseCode: e.target.value }))}
                        placeholder="e.g. CSC-204 / CS-301"
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center px-3 py-2 bg-indigo-50/50 border border-indigo-100 rounded-xl text-[11px] text-indigo-700">
                      ℹ️ Course Code is omitted automatically for {exportModal.academicTier} format.
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      Course / Subject
                    </label>
                    <input
                      type="text"
                      value={exportModal.subject}
                      onChange={(e) => setExportModal((prev) => ({ ...prev, subject: e.target.value }))}
                      placeholder="e.g. Mobile Application Development"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      {exportModal.academicTier === "University"
                        ? "Semester & Degree"
                        : exportModal.academicTier === "College"
                        ? "Class / Year"
                        : "Class / Grade"}
                    </label>
                    <input
                      type="text"
                      value={exportModal.className}
                      onChange={(e) => setExportModal((prev) => ({ ...prev, className: e.target.value }))}
                      placeholder={
                        exportModal.academicTier === "University"
                          ? "e.g. BSCS 5th Semester"
                          : exportModal.academicTier === "College"
                          ? "e.g. 1st Year (FSc)"
                          : "e.g. 10th Class"
                      }
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">
                      Instructor / Examiner Name
                    </label>
                    <input
                      type="text"
                      value={exportModal.teacherName}
                      onChange={(e) => setExportModal((prev) => ({ ...prev, teacherName: e.target.value }))}
                      placeholder="e.g. Prof. Dr. Muhammad Ali"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        Time (Mins)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={exportModal.durationMinutes}
                        onChange={(e) => setExportModal((prev) => ({ ...prev, durationMinutes: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1">
                        Total Marks
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={exportModal.totalMarks}
                        onChange={(e) => setExportModal((prev) => ({ ...prev, totalMarks: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* PAPER TOGGLE OPTIONS */}
              <div className="space-y-2.5 pt-1">
                <label className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-200/80 cursor-pointer hover:bg-gray-100/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={exportModal.includeInstructions}
                    onChange={(e) => setExportModal((prev) => ({ ...prev, includeInstructions: e.target.checked }))}
                    className="w-4 h-4 mt-0.5 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <div>
                    <span className="block text-xs font-bold text-gray-800">
                      Include Official Instructions & Code of Conduct Box
                    </span>
                    <span className="block text-[11px] text-gray-500 leading-tight">
                      Adds Candidate Details line (Name, Roll No., Signature) and official examination rules.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-200/80 cursor-pointer hover:bg-gray-100/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={exportModal.includeClo}
                    onChange={(e) => setExportModal((prev) => ({ ...prev, includeClo: e.target.checked }))}
                    className="w-4 h-4 mt-0.5 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <div>
                    <span className="block text-xs font-bold text-gray-800">
                      Include CLO (Outcome-Based Education) Codes & Breakdown
                    </span>
                    <span className="block text-[11px] text-gray-500 leading-tight">
                      Prints right-aligned Course Learning Outcome markers e.g. <span className="font-mono text-blue-700 font-bold">(CLO - 03) (06)</span> or <span className="font-mono text-blue-700 font-bold">(1 + 2 + 2 + 3)</span> against questions.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-200/80 cursor-pointer hover:bg-gray-100/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={exportModal.includeAnswerKey}
                    onChange={(e) => setExportModal((prev) => ({ ...prev, includeAnswerKey: e.target.checked }))}
                    className="w-4 h-4 mt-0.5 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <div>
                    <span className="block text-xs font-bold text-gray-800">
                      Include Confidential Teacher Marking Scheme & Solutions
                    </span>
                    <span className="block text-[11px] text-gray-500 leading-tight">
                      Appends a clean, separate final page with answers and rationales for examiner grading only.
                    </span>
                  </div>
                </label>
              </div>

            </div>

            {/* Modal Footer with Download Buttons */}
            <div className="p-5 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setExportModal((prev) => ({ ...prev, show: false }))}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={exportingId !== null}
                  onClick={() => executeExport("pdf")}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{exportingId ? "Generating..." : "Download PDF Paper"}</span>
                </button>

                <button
                  type="button"
                  disabled={exportingId !== null}
                  onClick={() => executeExport("docx")}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{exportingId ? "Generating..." : "Download Word (.docx)"}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white max-w-sm w-full p-6 rounded-3xl shadow-xl border border-gray-100 text-center">
            <Trash2 className="w-10 h-10 text-rose-600 mx-auto mb-2" />
            <h3 className="text-lg font-black text-gray-900 mb-2">Delete Assessment?</h3>
            <p className="text-xs text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm({ show: false, quizId: null })}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="flex-1 py-2.5 bg-rose-600 text-white font-bold rounded-xl text-xs hover:bg-rose-700 transition-colors shadow-xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}