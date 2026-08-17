"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

// 📱 DYNAMIC API URL CONFIGURATION (FOR ANDROID COMPATIBILITY)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.0.103:8000";

// TAYYAR SHUDA SELECTED FILE TYPE
type SelectedFile = { id: string; file: File; totalPages: number | null; startPage: number; endPage: number; isAnalyzing: boolean; isImage: boolean; };

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

  const [examTitle, setExamTitle] = useState("");
  const [examSubject, setExamSubject] = useState("");
  const [examClass, setExamClass] = useState("");
  
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exportingId, setExportingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [customPopup, setCustomPopup] = useState({ show: false, title: "", message: "", type: "success" });
  const [exportConfirm, setExportConfirm] = useState<{ show: boolean; quizId: number | null; format: "docx" | "pdf" | ""; }>({ show: false, quizId: null, format: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; quizId: number | null; }>({ show: false, quizId: null });

  const [editModal, setEditModal] = useState<{ show: boolean; quizId: number | null; quiz: any | null; activeSec: string }>({ show: false, quizId: null, quiz: null, activeSec: 'mcq' });
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [regenLoading, setRegenLoading] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const token = localStorage.getItem("token");
    if (!token) router.push("/"); 
    setTeacherName(localStorage.getItem("name") || "Teacher");
    if (token) fetchDashboardData(token);
  }, [router]);

  const fetchDashboardData = async (token: string) => {
    setLoading(true);
    try {
      const quizRes = await fetch(`${API_BASE_URL}/teacher/quizzes`, { headers: { "Authorization": `Bearer ${token}` } });
      if (quizRes.ok) setQuizzes((await quizRes.json()).quizzes);

      const overviewRes = await fetch(`${API_BASE_URL}/teacher/overview`, { headers: { "Authorization": `Bearer ${token}` } });
      if (overviewRes.ok) setOverview(await overviewRes.json());

      const classRes = await fetch(`${API_BASE_URL}/teacher/classrooms`, { headers: { "Authorization": `Bearer ${token}` } });
      if (classRes.ok) setClasses((await classRes.json()).classes);

      const analyticsRes = await fetch(`${API_BASE_URL}/teacher/analytics/recent-attempts`, { headers: { "Authorization": `Bearer ${token}` } });
      if (analyticsRes.ok) setRecentAttempts((await analyticsRes.json()).attempts);

      const brandRes = await fetch(`${API_BASE_URL}/teacher/branding`, { headers: { "Authorization": `Bearer ${token}` } });
      if (brandRes.ok) {
        const bData = await brandRes.json();
        if (bData) { setAcademyName(bData.academy_name || ""); setLogoBase64(bData.logo_path || ""); }
      }
    } catch (error) { console.log(error); } finally { setLoading(false); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesArray = Array.from(e.target.files || []);
    if (filesArray.length === 0) return;

    if (inputType === 'snap') {
       const selectedFile = filesArray[0];
       setImagePreview(URL.createObjectURL(selectedFile));
       setSelectedFiles([{ id: Math.random().toString(36).substring(7), file: selectedFile, totalPages: null, startPage: 1, endPage: 1, isAnalyzing: false, isImage: true }]);
       return; 
    }

    const newSelectedFiles: SelectedFile[] = filesArray.map(f => ({ id: Math.random().toString(36).substring(7), file: f, totalPages: null, startPage: 1, endPage: 1, isAnalyzing: false, isImage: f.type.startsWith('image/') }));
    setSelectedFiles(prev => [...prev, ...newSelectedFiles]);

    for (const newFile of newSelectedFiles) {
      if (!newFile.isImage) {
        setSelectedFiles(prev => prev.map(pf => pf.id === newFile.id ? { ...pf, isAnalyzing: true } : pf));
        const fd = new FormData(); fd.append("file", newFile.file); 
        try {
          const res = await fetch(`${API_BASE_URL}/quiz/analyze-document`, { method: "POST", body: fd });
          if (res.ok) {
            const data = await res.json();
            setSelectedFiles(prev => prev.map(pf => pf.id === newFile.id ? { ...pf, totalPages: data.total_pages, endPage: data.total_pages, isAnalyzing: false } : pf));
          } else { setSelectedFiles(prev => prev.map(pf => pf.id === newFile.id ? { ...pf, isAnalyzing: false } : pf)); }
        } catch(err) { setSelectedFiles(prev => prev.map(pf => pf.id === newFile.id ? { ...pf, isAnalyzing: false } : pf)); }
      }
    }
    if (e.target) e.target.value = '';
  };

  const removeFile = (id: string) => { setSelectedFiles(prev => prev.filter(f => f.id !== id)); };
  const updateRange = (id: string, field: 'startPage' | 'endPage', value: number) => { setSelectedFiles(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f)); };
  const clearImageSelection = () => { setSelectedFiles([]); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const handleGenerateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((inputType === 'document' || inputType === 'snap') && selectedFiles.length === 0) return setCustomPopup({ show: true, title: "Error", message: "Please select at least one file.", type: "error" });
    if (inputType === 'youtube' && !youtubeUrl.trim()) return setCustomPopup({ show: true, title: "Error", message: "Please enter a YouTube Link.", type: "error" });
    if (numMcq + numFillBlank + numShort + numLong <= 0) return setCustomPopup({ show: true, title: "Error", message: "Select question types.", type: "error" });
    
    setGeneratingQuiz(true);
    const token = localStorage.getItem("token");
    const formData = new FormData();
    
    if ((inputType === 'document' || inputType === 'snap') && selectedFiles.length > 0) {
        selectedFiles.forEach(sf => formData.append("files", sf.file));
        const ranges = selectedFiles.map(sf => ({ filename: sf.file.name, start: sf.startPage, end: sf.endPage }));
        formData.append("file_ranges", JSON.stringify(ranges));
    } else if (inputType === 'youtube') {
        formData.append("youtube_url", youtubeUrl); formData.append("yt_start_min", ytStartMin.toString()); formData.append("yt_end_min", ytEndMin.toString());
    }

    formData.append("num_mcq", numMcq.toString()); formData.append("num_fill_blank", numFillBlank.toString());
    formData.append("num_short", numShort.toString()); formData.append("num_long", numLong.toString());
    formData.append("difficulty", difficulty);
    formData.append("question_style", questionStyle); 
    formData.append("exam_title", examTitle); formData.append("subject", examSubject); formData.append("class_name", examClass);
    formData.append("institution_name", academyName || "Academy");

    try {
      const response = await fetch(`${API_BASE_URL}/quiz/generate`, { method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: formData });
      if (response.ok) {
        setCustomPopup({ show: true, title: "Success! 🎉", message: "Quiz generated successfully.", type: "success" });
        fetchDashboardData(token!); setActiveTab("quizzes"); 
        setSelectedFiles([]); setExamTitle(""); setExamSubject(""); setExamClass(""); setYoutubeUrl(""); setImagePreview(null);
      } else {
        const data = await response.json();
        setCustomPopup({ show: true, title: "Generation Failed", message: data.detail || "Something went wrong.", type: "error" });
      }
    } catch (error) { setCustomPopup({ show: true, title: "Error", message: "Network error.", type: "error" }); } 
    finally { setGeneratingQuiz(false); }
  };

  const executeDelete = async () => {
    const quizId = deleteConfirm.quizId;
    setDeleteConfirm({ show: false, quizId: null });
    const token = localStorage.getItem("token");
    try {
      await fetch(`${API_BASE_URL}/quiz/${quizId}`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } });
      setQuizzes(quizzes.filter(q => q.id !== quizId));
      setOverview(prev => ({...prev, total_quizzes: prev.total_quizzes - 1}));
    } catch (error) { }
  };

  const executeExport = async (includeAnswerKey: boolean) => {
    const { quizId, format } = exportConfirm;
    setExportConfirm({ show: false, quizId: null, format: "" });
    if (!quizId || !format) return;
    const token = localStorage.getItem("token");
    setExportingId(quizId);
    try {
      const response = await fetch(`${API_BASE_URL}/quiz/${quizId}/export/${format}`, {
        method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ include_answer_key: includeAnswerKey })
      });
      if (!response.ok) return setCustomPopup({ show: true, title: "Export Failed", message: "Error.", type: "error" });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Worksheet_${quizId}.${format}`;
      document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); a.remove();
    } catch (error) { } finally { setExportingId(null); }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setCreatingClass(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE_URL}/teacher/classrooms`, { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: newClassName }) });
      if (res.ok) {
        const data = await res.json();
        setClasses([{ id: data.class_id, name: data.name, join_code: data.join_code, created_at: new Date().toISOString(), student_count: 0 }, ...classes]);
        setNewClassName(""); setOverview(prev => ({...prev, total_classes: prev.total_classes + 1}));
        setCustomPopup({ show: true, title: "Class Created!", message: `Join code: ${data.join_code}`, type: "success" });
      } else { setCustomPopup({ show: true, title: "Error", message: "Failed to create class.", type: "error" }); }
    } catch (error) { setCustomPopup({ show: true, title: "Error", message: "Network Error.", type: "error" }); } finally { setCreatingClass(false); }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBranding(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE_URL}/teacher/branding`, { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ academy_name: academyName.trim(), logo_path: logoBase64 }) });
      if (res.ok) { setCustomPopup({ show: true, title: "Saved!", message: "Branding updated.", type: "success" }); } 
      else { setCustomPopup({ show: true, title: "Error", message: "Failed.", type: "error" }); }
    } catch (error) { setCustomPopup({ show: true, title: "Error", message: "Network Error.", type: "error" }); } finally { setSavingBranding(false); }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024 * 2) return setCustomPopup({ show: true, title: "File Too Large", message: "Max 2MB.", type: "error" });
      const reader = new FileReader();
      reader.onloadend = () => { setLogoBase64(reader.result as string); };
      reader.readAsDataURL(file);
    }
  };

  const handleExportClick = (quizId: number, format: "docx" | "pdf") => { setExportConfirm({ show: true, quizId, format }); };

  const openEditor = async (id: number) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE_URL}/quiz/${id}`, { headers: { "Authorization": `Bearer ${token}` } });
      const data = await res.json();
      setEditModal({ show: true, quizId: id, quiz: data, activeSec: 'mcq' });
    } catch (e) { alert("Failed to load quiz."); }
  };

  const handleEditChange = (section: string, index: number, field: string, value: any) => {
    const updatedQuiz = { ...editModal.quiz };
    const secKey = section === 'mcq' ? 'mcq_questions' : section === 'blank' ? 'fill_blank_questions' : section === 'short' ? 'short_questions' : 'long_questions';
    updatedQuiz.quiz_data[secKey][index][field] = value;
    setEditModal({ ...editModal, quiz: updatedQuiz });
  };

  const handleMove = (section: string, index: number, direction: number) => {
    const updatedQuiz = { ...editModal.quiz };
    const secKey = section === 'mcq' ? 'mcq_questions' : section === 'blank' ? 'fill_blank_questions' : section === 'short' ? 'short_questions' : 'long_questions';
    const arr = updatedQuiz.quiz_data[secKey];
    if (index + direction < 0 || index + direction >= arr.length) return;
    const temp = arr[index]; arr[index] = arr[index + direction]; arr[index + direction] = temp;
    setEditModal({ ...editModal, quiz: updatedQuiz });
  };

  const handleRemove = (section: string, index: number) => {
    const updatedQuiz = { ...editModal.quiz };
    const secKey = section === 'mcq' ? 'mcq_questions' : section === 'blank' ? 'fill_blank_questions' : section === 'short' ? 'short_questions' : 'long_questions';
    updatedQuiz.quiz_data[secKey].splice(index, 1);
    setEditModal({ ...editModal, quiz: updatedQuiz });
  };

  const handleAddQuestion = (section: string) => {
    const updatedQuiz = { ...editModal.quiz };
    const secKey = section === 'mcq' ? 'mcq_questions' : section === 'blank' ? 'fill_blank_questions' : section === 'short' ? 'short_questions' : 'long_questions';
    if (!updatedQuiz.quiz_data[secKey]) updatedQuiz.quiz_data[secKey] = [];
    let newQ = {};
    if (section === 'mcq') newQ = { question_text: "New Question?", options: ["A", "B", "C", "D"], correct_answer: "A", explanation: "" };
    if (section === 'blank') newQ = { question_text: "The ___ is blue.", correct_answer: "sky", explanation: "" };
    if (section === 'short') newQ = { question_text: "Explain...", correct_answer: "...", explanation: "" };
    if (section === 'long') newQ = { question_text: "Discuss...", model_answer: "...", key_points: ["point"], explanation: "" };
    updatedQuiz.quiz_data[secKey].push(newQ);
    setEditModal({ ...editModal, quiz: updatedQuiz });
  };

  const handleRegenerate = async (section: string, index: number) => {
    setRegenLoading(`${section}-${index}`);
    const token = localStorage.getItem("token");
    const backendSecKey = section === 'mcq' ? 'mcq' : section === 'blank' ? 'fill_blank' : section === 'short' ? 'short_answer' : 'long_answer';
    const arrKey = section === 'mcq' ? 'mcq_questions' : section === 'blank' ? 'fill_blank_questions' : section === 'short' ? 'short_questions' : 'long_questions';
    try {
      const res = await fetch(`${API_BASE_URL}/quiz/${editModal.quizId}/regenerate-question`, {
        method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ question_type: backendSecKey, difficulty: "Medium", question_style: questionStyle }) 
      });
      if (res.ok) {
        const data = await res.json();
        const updatedQuiz = { ...editModal.quiz };
        updatedQuiz.quiz_data[arrKey][index] = data.new_question;
        setEditModal({ ...editModal, quiz: updatedQuiz });
      } else { alert("Regeneration failed. Context might be missing."); }
    } catch (e) { alert("Network error"); } finally { setRegenLoading(null); }
  };

  const handleSaveEdits = async () => {
    setSavingQuiz(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE_URL}/quiz/${editModal.quizId}`, {
        method: "PUT", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ quiz_data: editModal.quiz.quiz_data, exam_metadata: editModal.quiz.exam_metadata })
      });
      if (res.ok) {
        setCustomPopup({ show: true, title: "Saved! 💾", message: "Edits saved.", type: "success" });
        setEditModal({ show: false, quizId: null, quiz: null, activeSec: 'mcq' });
      }
    } catch (e) { alert("Network error"); } finally { setSavingQuiz(false); }
  };

  const handleBookmark = async (qData: any, type: string) => {
    const token = localStorage.getItem("token");
    try {
      await fetch(`${API_BASE_URL}/bookmarks`, {
        method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ quiz_id: editModal.quizId, question_type: type, question_data: qData })
      });
      alert("⭐ Question Bookmarked!");
    } catch (e) { alert("Error saving bookmark."); }
  };

  if (!isMounted) return null;

  const handleLogout = () => { localStorage.clear(); router.push("/"); };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans relative">
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <span className="text-2xl mr-2">👨‍🏫</span>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">Teacher Pro Workspace</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500 font-medium">Hello, {teacherName}</span>
              <button onClick={handleLogout} className="px-4 py-2 bg-red-50 text-red-600 text-sm font-bold rounded-lg hover:bg-red-100 transition-colors">Logout</button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
            <button onClick={() => setActiveTab("overview")} className={`w-full flex px-4 py-3 rounded-xl font-semibold transition-all ${activeTab === "overview" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>📊 Overview</button>
            <button onClick={() => setActiveTab("create_quiz")} className={`w-full flex px-4 py-3 rounded-xl font-semibold transition-all ${activeTab === "create_quiz" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>🪄 Create Quiz</button>
            <button onClick={() => setActiveTab("quizzes")} className={`w-full flex px-4 py-3 rounded-xl font-semibold transition-all ${activeTab === "quizzes" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>📝 My Quizzes</button>
            <button onClick={() => setActiveTab("classes")} className={`w-full flex px-4 py-3 rounded-xl font-semibold transition-all ${activeTab === "classes" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>🏫 Classrooms</button>
            <button onClick={() => setActiveTab("analytics")} className={`w-full flex px-4 py-3 rounded-xl font-semibold transition-all ${activeTab === "analytics" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>📈 Analytics</button>
            <button onClick={() => setActiveTab("settings")} className={`w-full flex px-4 py-3 rounded-xl font-semibold transition-all ${activeTab === "settings" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>⚙️ Academy Branding</button>
          </div>
        </aside>

        <main className="flex-1">
          {loading ? (
            <div className="flex justify-center items-center h-64"><p className="text-gray-500 font-bold animate-pulse">Loading...</p></div>
          ) : (
            <>
              {activeTab === "overview" && (
                <div className="space-y-6 animate-fade-in-up">
                  <div><h2 className="text-2xl font-bold text-gray-800">Dashboard Overview</h2></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100 flex flex-col justify-center items-center text-center"><p className="text-3xl font-extrabold text-blue-700">{overview.total_quizzes}</p><p className="text-sm text-gray-500 font-medium">Quizzes</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100 flex flex-col justify-center items-center text-center"><p className="text-3xl font-extrabold text-purple-700">{overview.total_classes}</p><p className="text-sm text-gray-500 font-medium">Classrooms</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100 flex flex-col justify-center items-center text-center"><p className="text-3xl font-extrabold text-orange-700">{overview.total_attempts}</p><p className="text-sm text-gray-500 font-medium">Attempts</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100 flex flex-col justify-center items-center text-center"><p className="text-3xl font-extrabold text-green-700">{overview.avg_score}%</p><p className="text-sm text-gray-500 font-medium">Avg Score</p></div>
                  </div>
                </div>
              )}

              {/* 🪄 TAB: CREATE QUIZ (SMART DROPDOWN ADDED) */}
              {activeTab === "create_quiz" && (
                <div className="space-y-6 animate-fade-in-up">
                  <form onSubmit={handleGenerateQuiz} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-2xl font-bold mb-8 text-gray-800 flex items-center border-b pb-4">AI Assessment Generator</h2>
                    
                    <div className="mb-8">
                      <label className="block text-sm font-semibold mb-3 text-gray-700">1. Select Source Material</label>
                      <div className="flex bg-gray-100 p-1.5 rounded-xl flex-wrap md:flex-nowrap gap-1">
                        <button type="button" onClick={() => { setInputType('document'); clearImageSelection(); }} className={`flex-1 min-w-[120px] flex items-center justify-center py-3 rounded-lg font-bold text-sm transition-all ${inputType === 'document' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>📁 Universal Document</button>
                        <button type="button" onClick={() => { setInputType('youtube'); clearImageSelection(); }} className={`flex-1 min-w-[120px] flex items-center justify-center py-3 rounded-lg font-bold text-sm transition-all ${inputType === 'youtube' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>▶️ YouTube Video</button>
                        <button type="button" onClick={() => { setInputType('snap'); clearImageSelection(); }} className={`flex-1 min-w-[120px] flex items-center justify-center py-3 rounded-lg font-bold text-sm transition-all ${inputType === 'snap' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>📸 Snap & Quiz</button>
                      </div>
                    </div>

                    {inputType === 'document' && (
                      <div className="mb-8 animate-fade-in-up">
                        <label className="block text-sm font-semibold mb-3 text-gray-700">Upload Files (Select multiple PDF, DOCX, TXT)</label>
                        <input type="file" accept=".pdf,.docx,.doc,.txt" multiple onChange={handleFileChange} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all"/>
                        {selectedFiles.length > 0 && (
                          <div className="mt-4 space-y-3">
                            <label className="block text-sm font-semibold mb-2 text-blue-800">Selected Files & Ranges</label>
                            {selectedFiles.map(sf => (
                              <div key={sf.id} className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex-1 truncate font-medium text-blue-900 flex items-center">{sf.isImage ? "📸" : "📄"} <span className="ml-2 truncate">{sf.file.name}</span></div>
                                {sf.isAnalyzing && <span className="text-sm text-blue-600 animate-pulse font-bold">Scanning pages...</span>}
                                {sf.totalPages !== null && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">Pages:</span>
                                    <input type="number" min="1" max={sf.totalPages} value={sf.startPage} onChange={(e) => updateRange(sf.id, 'startPage', parseInt(e.target.value) || 1)} className="w-16 px-2 py-1 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-center text-sm font-bold" />
                                    <span className="text-gray-400 font-bold">-</span>
                                    <input type="number" min="1" max={sf.totalPages} value={sf.endPage} onChange={(e) => updateRange(sf.id, 'endPage', parseInt(e.target.value) || 1)} className="w-16 px-2 py-1 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-center text-sm font-bold" />
                                    <span className="text-xs text-gray-500 ml-1">of {sf.totalPages}</span>
                                  </div>
                                )}
                                <button type="button" onClick={() => removeFile(sf.id)} className="text-red-500 font-bold px-3 py-1 hover:bg-red-100 transition-colors">X</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {inputType === 'youtube' && (
                      <div className="mb-8 animate-fade-in-up">
                        <label className="block text-sm font-semibold mb-3 text-gray-700">Paste YouTube URL</label>
                        <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="w-full pl-4 pr-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-500 outline-none transition-all text-gray-800 bg-gray-50 focus:bg-white mb-4" />
                        <div className="flex items-center gap-4">
                           <div className="flex-1"><label className="text-xs font-semibold ml-1">Start Min</label><input type="number" min="0" value={ytStartMin} onChange={(e) => setYtStartMin(parseInt(e.target.value) || 0)} className="w-full px-2 py-2 border rounded-lg" /></div>
                           <div className="flex-1"><label className="text-xs font-semibold ml-1">End Min</label><input type="number" min="1" value={ytEndMin} onChange={(e) => setYtEndMin(parseInt(e.target.value) || 0)} className="w-full px-2 py-2 border rounded-lg" /></div>
                        </div>
                      </div>
                    )}

                    {inputType === 'snap' && (
                      <div className="mb-8 animate-fade-in-up">
                        <label className="block text-sm font-semibold mb-3 text-gray-700">Take a Photo</label>
                        {!imagePreview ? (
                          <div className="w-full border-2 border-dashed border-purple-300 bg-purple-50 rounded-xl p-8 text-center cursor-pointer hover:bg-purple-100" onClick={() => fileInputRef.current?.click()}><p className="font-semibold text-purple-700">Tap to open Camera/Gallery</p></div>
                        ) : (
                          <div className="relative border rounded-xl overflow-hidden shadow-sm bg-gray-100 flex justify-center items-center h-64"><img src={imagePreview} alt="Captured preview" className="h-full object-contain" /><button type="button" onClick={clearImageSelection} className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 shadow-md">X</button></div>
                        )}
                        <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                      </div>
                    )}

                    <div className="mb-8">
                       <label className="block text-sm font-semibold mb-3 text-gray-700">2. Exam Details (Metadata)</label>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div><label className="block text-xs font-bold text-gray-500 mb-1">Exam Title</label><input type="text" placeholder="e.g. Midterm Exam" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={examTitle} onChange={e => setExamTitle(e.target.value)} /></div>
                         <div><label className="block text-xs font-bold text-gray-500 mb-1">Subject</label><input type="text" placeholder="e.g. Computer Science" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={examSubject} onChange={e => setExamSubject(e.target.value)} /></div>
                         <div><label className="block text-xs font-bold text-gray-500 mb-1">Class / Semester</label><input type="text" placeholder="e.g. BSCS 5th Semester" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={examClass} onChange={e => setExamClass(e.target.value)} /></div>
                       </div>
                    </div>

                    <div className="mb-8">
                       <label className="block text-sm font-semibold mb-3 text-gray-700">3. Configure Output format</label>
                       <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                         <div><label className="block text-xs font-bold text-gray-500 mb-1">MCQs</label><input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numMcq} onChange={e => setNumMcq(parseInt(e.target.value) || 0)} /></div>
                         <div><label className="block text-xs font-bold text-gray-500 mb-1">Blanks</label><input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numFillBlank} onChange={e => setNumFillBlank(parseInt(e.target.value) || 0)} /></div>
                         <div><label className="block text-xs font-bold text-gray-500 mb-1">Short</label><input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numShort} onChange={e => setNumShort(parseInt(e.target.value) || 0)} /></div>
                         <div><label className="block text-xs font-bold text-gray-500 mb-1">Long</label><input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numLong} onChange={e => setNumLong(parseInt(e.target.value) || 0)} /></div>
                         <div>
                           <label className="block text-xs font-bold text-gray-500 mb-1">Difficulty</label>
                           <select className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option></select>
                         </div>
                         <div>
                           <label className="block text-xs font-black text-blue-700 mb-1">Question Style</label>
                           <select className="w-full px-2 py-2 bg-blue-50 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-blue-900 font-bold" value={questionStyle} onChange={e => setQuestionStyle(e.target.value)}>
                             <option value="Auto">✨ Auto Select</option>
                             <option value="Conceptual">🧠 Conceptual</option>
                             <option value="Programming">💻 Coding</option>
                             <option value="Comprehension">📖 Comprehension</option>
                             <option value="Scenario">🌍 Scenario-Based</option>
                             <option value="Comparison">⚖️ Comparison</option>
                             <option value="Exam">🎓 Exam Style</option>
                           </select>
                         </div>
                       </div>
                    </div>

                    <button type="submit" disabled={generatingQuiz} className="w-full py-4 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-70">
                      {generatingQuiz ? "Generating Assessment..." : "Generate & Save to Library"}
                    </button>
                  </form>
                </div>
              )}

              {/* TAB: MY QUIZZES */}
              {activeTab === "quizzes" && (
                <div className="space-y-6 animate-fade-in-up">
                  <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div><h2 className="text-2xl font-bold text-gray-800">Quiz Library</h2><p className="text-sm text-gray-500 mt-1">Manage, Edit, and Export your assessments.</p></div>
                    <button onClick={() => setActiveTab("create_quiz")} className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-md">➕ Create New Quiz</button>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {quizzes.length > 0 ? quizzes.map((quiz) => (
                      <div key={quiz.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-blue-200 transition-all">
                        <div>
                          <h3 className="text-xl font-bold text-gray-800">{quiz.title}</h3>
                          <p className="text-sm text-gray-500 mt-1 font-medium bg-gray-100 inline-block px-3 py-1 rounded-full">Subject: {quiz.subject} | Created: {quiz.date}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => openEditor(quiz.id)} className="px-4 py-2 bg-yellow-50 text-yellow-700 font-bold rounded-lg hover:bg-yellow-100 border border-yellow-100 text-sm">👁️ Preview & Edit</button>
                          <button onClick={() => handleExportClick(quiz.id, "docx")} disabled={exportingId === quiz.id} className="px-4 py-2 bg-blue-50 text-blue-700 font-semibold rounded-lg hover:bg-blue-100 border border-blue-100 text-sm">📄 Word (.docx)</button>
                          <button onClick={() => handleExportClick(quiz.id, "pdf")} disabled={exportingId === quiz.id} className="px-4 py-2 bg-red-50 text-red-700 font-semibold rounded-lg hover:bg-red-100 border border-red-100 text-sm">🖨️ PDF</button>
                          <button onClick={() => setDeleteConfirm({ show: true, quizId: quiz.id })} className="ml-1 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100" title="Delete">🗑️</button>
                        </div>
                      </div>
                    )) : (<div className="text-center p-12 bg-white rounded-2xl border border-dashed border-gray-300">No quizzes found.</div>)}
                  </div>
                </div>
              )}

              {/* 🏫 TAB: CLASSROOMS */}
              {activeTab === "classes" && (
                <div className="space-y-6 animate-fade-in-up">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-2xl font-bold text-gray-800">Classroom Management</h2>
                    <form onSubmit={handleCreateClass} className="flex gap-4 mt-6">
                      <input type="text" required placeholder="e.g. BSCS AI - 8th Semester" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="submit" disabled={creatingClass} className="px-6 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50">{creatingClass ? "Creating..." : "Create Class"}</button>
                    </form>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {classes.map((cls) => (
                      <div key={cls.id} className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100 flex flex-col justify-between">
                        <div><h3 className="text-xl font-bold text-gray-800">{cls.name}</h3><p className="text-xs text-gray-500 mt-1">Created: {cls.created_at.split(" ")[0]}</p></div>
                        <div className="mt-3 mb-2 flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-100"><span className="text-sm font-semibold text-gray-600">Students Enrolled:</span><span className="text-sm font-bold bg-green-100 text-green-700 px-3 py-1 rounded-full">{cls.student_count || 0}</span></div>
                        <div className="mt-2 p-4 bg-purple-50 rounded-xl border border-purple-100 flex justify-between items-center"><span className="text-sm font-semibold text-purple-800">JOIN CODE:</span><span className="text-2xl font-black text-purple-600 tracking-widest">{cls.join_code}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 📈 TAB: ANALYTICS */}
              {activeTab === "analytics" && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-xl font-bold text-gray-800 mb-6">Recent Student Activity</h2>
                    <table className="w-full text-left border-collapse">
                      <thead><tr className="bg-gray-50 text-gray-500 text-sm border-b"><th className="p-4 font-semibold">Student Name</th><th className="p-4 font-semibold">Quiz Title</th><th className="p-4 font-semibold">Score</th><th className="p-4 font-semibold">Date</th></tr></thead>
                      <tbody>
                        {recentAttempts.map((att, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50"><td className="p-4 font-bold text-gray-800">{att.student_name}</td><td className="p-4 text-gray-600">{att.quiz_title}</td><td className="p-4"><span className={`px-3 py-1 rounded-full text-sm font-bold ${att.score_percent >= 80 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{att.score_percent}%</span></td><td className="p-4 text-gray-500 text-sm">{att.date}</td></tr>
                        ))}
                      </tbody>
                    </table>
                </div>
              )}

              {/* ⚙️ TAB: BRANDING */}
              {activeTab === "settings" && (
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-2xl mx-auto">
                    <div className="text-center mb-8"><h2 className="text-2xl font-bold text-gray-800">Academy Branding</h2><p className="text-sm text-gray-500 mt-2">Customize your exported PDF/Word worksheets.</p></div>
                    <form onSubmit={handleSaveBranding} className="space-y-6">
                      <div><label className="block text-sm font-bold text-gray-700 mb-2">Academy / School Name</label><input type="text" value={academyName} onChange={(e) => setAcademyName(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 font-medium" /></div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Optional Academy Logo</label>
                        <input type="file" accept="image/*" onChange={handleLogoChange} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                        {logoBase64 && <button type="button" onClick={() => setLogoBase64("")} className="text-xs text-red-500 mt-2 font-bold hover:underline">Remove Selected Logo</button>}
                      </div>
                      <button type="submit" disabled={savingBranding} className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-colors">{savingBranding ? "Saving..." : "Save Branding Settings"}</button>
                    </form>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* 🪄 FULL SCREEN EDITOR MODAL */}
      {editModal.show && editModal.quiz && (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
           {/* Editor Header */}
           <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm">
              <div>
                 <h2 className="text-xl font-bold text-gray-800">Quiz Editor</h2>
                 <p className="text-sm text-gray-500">Review, manually edit, reorder, or regenerate AI questions.</p>
              </div>
              <div className="flex items-center gap-3">
                 <label className="flex items-center gap-2 text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg cursor-pointer border border-indigo-200">
                    <input type="checkbox" checked={editModal.quiz.exam_metadata?.shuffle_enabled || false} onChange={(e) => setEditModal({...editModal, quiz: {...editModal.quiz, exam_metadata: {...editModal.quiz.exam_metadata, shuffle_enabled: e.target.checked}}})} className="rounded text-indigo-600 focus:ring-indigo-500"/>
                    🔀 Shuffle Questions in Export
                 </label>
                 <button onClick={() => setEditModal({ show: false, quizId: null, quiz: null, activeSec: 'mcq' })} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Cancel</button>
                 <button onClick={handleSaveEdits} disabled={savingQuiz} className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md">
                   {savingQuiz ? "Saving..." : "💾 Save Changes"}
                 </button>
              </div>
           </div>

           {/* Editor Body */}
           <div className="flex-1 flex overflow-hidden">
              {/* Sidebar Tabs */}
              <div className="w-64 bg-white border-r p-4 space-y-2 overflow-y-auto">
                 <button onClick={() => setEditModal({...editModal, activeSec: 'mcq'})} className={`w-full text-left px-4 py-3 rounded-xl font-bold ${editModal.activeSec === 'mcq' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>MCQs</button>
                 <button onClick={() => setEditModal({...editModal, activeSec: 'blank'})} className={`w-full text-left px-4 py-3 rounded-xl font-bold ${editModal.activeSec === 'blank' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>Fill in the Blanks</button>
                 <button onClick={() => setEditModal({...editModal, activeSec: 'short'})} className={`w-full text-left px-4 py-3 rounded-xl font-bold ${editModal.activeSec === 'short' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>Short Questions</button>
                 <button onClick={() => setEditModal({...editModal, activeSec: 'long'})} className={`w-full text-left px-4 py-3 rounded-xl font-bold ${editModal.activeSec === 'long' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>Long Questions</button>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
                 <div className="max-w-3xl mx-auto space-y-6">
                    {/* Dynamic Section Renderer */}
                    {editModal.quiz.quiz_data[editModal.activeSec === 'mcq' ? 'mcq_questions' : editModal.activeSec === 'blank' ? 'fill_blank_questions' : editModal.activeSec === 'short' ? 'short_questions' : 'long_questions']?.map((q: any, index: number) => (
                       <div key={index} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 group relative">
                          <div className="absolute top-4 right-4 flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                             <button onClick={() => handleBookmark(q, editModal.activeSec)} className="p-2 bg-gray-100 text-yellow-500 rounded hover:bg-gray-200 font-bold" title="Save/Bookmark">⭐</button>
                             <button onClick={() => handleRegenerate(editModal.activeSec, index)} disabled={regenLoading === `${editModal.activeSec}-${index}`} className="p-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-bold" title="Regenerate single question from AI">🔄 {regenLoading === `${editModal.activeSec}-${index}` ? '...' : ''}</button>
                             <button onClick={() => handleMove(editModal.activeSec, index, -1)} className="p-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 font-bold" title="Move Up">↑</button>
                             <button onClick={() => handleMove(editModal.activeSec, index, 1)} className="p-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 font-bold" title="Move Down">↓</button>
                             <button onClick={() => handleRemove(editModal.activeSec, index)} className="p-2 bg-red-50 text-red-600 rounded hover:bg-red-100 font-bold" title="Delete">🗑️</button>
                          </div>

                          <p className="text-sm font-bold text-blue-500 mb-2 uppercase tracking-wide">Question {index + 1}</p>
                          <textarea value={q.question_text} onChange={(e) => handleEditChange(editModal.activeSec, index, 'question_text', e.target.value)} className="w-full text-lg font-semibold text-gray-800 p-2 border border-transparent hover:border-gray-200 focus:border-blue-500 outline-none rounded resize-none" rows={2}/>

                          {editModal.activeSec === 'mcq' && (
                             <div className="mt-4 grid grid-cols-1 gap-2 pl-4 border-l-2 border-blue-100">
                                {q.options.map((opt: string, oIdx: number) => (
                                   <div key={oIdx} className="flex items-center gap-2">
                                      <span className="font-bold text-gray-400">{String.fromCharCode(65+oIdx)}.</span>
                                      <input type="text" value={opt} onChange={(e) => { const newOpts = [...q.options]; newOpts[oIdx] = e.target.value; handleEditChange(editModal.activeSec, index, 'options', newOpts); }} className="flex-1 p-2 bg-gray-50 border border-transparent hover:border-gray-200 focus:bg-white outline-none rounded text-sm"/>
                                   </div>
                                ))}
                             </div>
                          )}

                          <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-100">
                             <p className="text-xs font-bold text-green-800 uppercase mb-1">Correct / Model Answer</p>
                             <textarea value={q.correct_answer || q.model_answer || ""} onChange={(e) => handleEditChange(editModal.activeSec, index, q.correct_answer !== undefined ? 'correct_answer' : 'model_answer', e.target.value)} className="w-full bg-transparent p-1 outline-none text-sm font-medium text-green-900 resize-none"/>
                          </div>
                       </div>
                    ))}

                    <button onClick={() => handleAddQuestion(editModal.activeSec)} className="w-full py-4 border-2 border-dashed border-gray-300 text-gray-500 font-bold rounded-2xl hover:bg-white hover:border-blue-300 hover:text-blue-600 transition-colors">
                       + Add New Manual Question
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MODALS */}
      {customPopup.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in"><div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"><h3 className="text-2xl font-bold text-gray-900 mb-2">{customPopup.title}</h3><p className="text-gray-500 mb-8">{customPopup.message}</p><button onClick={() => setCustomPopup({ ...customPopup, show: false })} className="w-full py-4 text-white font-bold rounded-xl bg-blue-600">Okay</button></div></div>
      )}
      {exportConfirm.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"><div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"><h3 className="text-2xl font-bold text-gray-900 mb-2">Export Document</h3><p className="text-gray-500 mb-8">Include Answer Key?</p><div className="flex flex-col gap-3"><button onClick={() => executeExport(true)} className="w-full py-3 text-white font-bold rounded-xl bg-blue-600">Yes</button><button onClick={() => executeExport(false)} className="w-full py-3 text-blue-600 font-bold rounded-xl border-2 border-blue-100">No</button><button onClick={() => setExportConfirm({ show: false, quizId: null, format: "" })} className="text-sm mt-2 text-gray-400">Cancel</button></div></div></div>
      )}
      {deleteConfirm.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"><div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"><h3 className="text-2xl font-bold text-gray-900 mb-2">Delete Quiz?</h3><p className="text-gray-500 mb-8">This action cannot be undone.</p><div className="flex flex-col gap-3"><button onClick={executeDelete} className="w-full py-3 text-white font-bold rounded-xl bg-red-600">Yes, Delete It</button><button onClick={() => setDeleteConfirm({ show: false, quizId: null })} className="text-sm mt-2 text-gray-400">Cancel</button></div></div></div>
      )}

    </div>
  );
}