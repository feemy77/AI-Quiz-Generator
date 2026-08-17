"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

// 📱 DYNAMIC API URL CONFIGURATION (FOR ANDROID COMPATIBILITY)
// Production ke liye hum environment variable use karenge, fallback to local network
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.0.103:8000";

// TAYYAR SHUDA SELECTED FILE TYPE
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
  const [mode, setMode] = useState("preparation"); 
  
  // 🪄 QUIZ GENERATION STATES
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
  
  const [quizData, setQuizData] = useState<any>(null);
  const [quizId, setQuizId] = useState<number | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const [customPopup, setCustomPopup] = useState({ show: false, title: "", message: "", type: "success" });

  const [stats, setStats] = useState<{ streak: { current_streak: number, longest_streak: number }, badges: { badge_name: string }[], dueFlashcards: number }>({
    streak: { current_streak: 0, longest_streak: 0 }, badges: [], dueFlashcards: 0
  });

  useEffect(() => {
    setIsMounted(true);
    const token = localStorage.getItem("token");
    const userRole = localStorage.getItem("role");

    if (!token) { router.push("/"); } 
    else if (userRole === "teacher") { router.push("/teacher-dashboard"); }
    
    setStudentName(localStorage.getItem("name") || "Student");
    if (token) fetchUserStats(token);
  }, [router]);

  const fetchUserStats = async (token: string) => {
    try {
      const statRes = await fetch(`${API_BASE_URL}/user/dashboard`, { headers: { "Authorization": `Bearer ${token}` } });
      const cardRes = await fetch(`${API_BASE_URL}/flashcards/due`, { headers: { "Authorization": `Bearer ${token}` } });

      if (statRes.ok && cardRes.ok) {
        const statData = await statRes.json();
        const cardData = await cardRes.json();
        setStats({ streak: statData.streak, badges: statData.badges, dueFlashcards: cardData.due_count });
      }
    } catch (e) { console.log("Stats error:", e); }
  };

  if (!isMounted) return null;

  const handleLogout = () => { localStorage.clear(); router.push("/"); };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/student/classrooms/join`, {
            method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ join_code: joinCode.trim() })
        });
        const data = await res.json();
        if (res.ok) {
            setCustomPopup({ show: true, title: "Awesome! 🎉", message: "You joined the classroom.", type: "success" });
            setJoinCode("");
        } else {
            setCustomPopup({ show: true, title: "Oops!", message: data.detail || "Failed to join.", type: "error" });
        }
    } catch (e) {
        setCustomPopup({ show: true, title: "Error", message: "Could not connect to server.", type: "error" });
    } finally { setJoining(false); }
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

  const handleGenerateSelfStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((inputType === 'document' || inputType === 'snap') && selectedFiles.length === 0) return setMessage("Please select at least one file.");
    if (inputType === 'youtube' && !youtubeUrl.trim()) return setMessage("Please enter a YouTube Link.");
    if (numMcq + numFillBlank + numShort + numLong <= 0) return setMessage("Please select question counts.");

    setLoading(true); setMessage(""); setQuizData(null); setQuizId(null);
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
    formData.append("institution_name", "Self-Study Assessment");

    try {
      const response = await fetch(`${API_BASE_URL}/quiz/generate`, { method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: formData });
      const data = await response.json();
      
      if (response.ok) {
        setQuizData(data.quiz_data); setQuizId(data.quiz_id); setMessage("Generation Complete.");
        
        // 🚀 FAHEEM BHAI: YEH RAHA APKA REDIRECTION MAGIC LOGIC 🚀
        if (mode === 'test') {
           // Agar test mode tha, toh foran test environment mein bhej do
           router.push(`/quiz/${data.quiz_id}`);
        } else {
           // Agar preparation mode tha, toh thori der message dikha kar page ko scroll down karo
           setTimeout(() => {
               window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
           }, 500);
        }
      } else { setMessage(`Error: ${data.detail || "Generation failed"}`); }
    } catch (error) { setMessage("Network error. Backend might be offline."); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      
      {/* Header */}
      <div className="max-w-5xl mx-auto flex justify-between items-center mb-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Student Workspace</h1>
          <p className="text-gray-500 mt-1">Welcome back, {studentName}. Create assessments from documents or videos.</p>
        </div>
        <button onClick={handleLogout} className="px-5 py-2 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 transition-colors">Logout</button>
      </div>

      {/* 🏫 JOIN CLASS SECTION */}
      <div className="max-w-5xl mx-auto mb-6 bg-purple-50 p-5 rounded-2xl border border-purple-100 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in-up">
         <div>
            <h3 className="font-bold text-purple-900 text-lg flex items-center"><span className="mr-2">🏫</span> Join a Classroom</h3>
            <p className="text-sm text-purple-700 mt-1">Enter the 7-digit code provided by your teacher to join their class.</p>
         </div>
         <form onSubmit={handleJoinClass} className="flex gap-2 w-full md:w-auto">
            <input type="text" placeholder="e.g. HCVICAI" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={7} className="px-4 py-2 border border-purple-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 font-bold tracking-widest uppercase text-center w-40" required />
            <button type="submit" disabled={joining} className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50">{joining ? "Joining..." : "Join"}</button>
         </form>
      </div>

      {/* 🏆 GAMIFICATION STATS PANEL */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
         <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100 flex items-center">
            <div className="bg-orange-100 p-3 rounded-full mr-4"><span className="text-2xl">🔥</span></div>
            <div>
               <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">Current Streak</p>
               <p className="text-2xl font-bold text-orange-600">{stats.streak.current_streak} Days</p>
               <p className="text-xs text-orange-400 mt-1">Best: {stats.streak.longest_streak} Days</p>
            </div>
         </div>
         <div className="bg-white p-5 rounded-2xl shadow-sm border border-blue-100 flex items-center">
            <div className="bg-blue-100 p-3 rounded-full mr-4"><span className="text-2xl">🎯</span></div>
            <div className="w-full">
               <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider mb-1">Badges Earned ({stats.badges.length})</p>
               <div className="flex gap-2 flex-wrap">
                  {stats.badges.length > 0 ? stats.badges.slice(0, 2).map((b, i) => (<span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md border border-blue-200">{b.badge_name}</span>)) : <span className="text-xs text-gray-400">Complete a quiz to earn badges!</span>}
               </div>
            </div>
         </div>
         <div className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100 flex items-center justify-between">
            <div className="flex items-center">
               <div className="bg-purple-100 p-3 rounded-full mr-4"><span className="text-2xl">🗂️</span></div>
               <div>
                  <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">Due Flashcards</p>
                  <p className="text-2xl font-bold text-purple-600">{stats.dueFlashcards}</p>
               </div>
            </div>
            {stats.dueFlashcards > 0 && <button onClick={() => router.push('/flashcards')} className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition-colors shadow-sm">Review</button>}
         </div>
      </div>

      {/* GENERATOR FORM */}
      <div className="max-w-5xl mx-auto space-y-6">
        <form onSubmit={handleGenerateSelfStudy} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          
          <h2 className="text-2xl font-bold mb-8 text-gray-800 flex items-center border-b pb-4">
            <svg className="w-8 h-8 text-blue-600 mr-3 bg-blue-100 p-1.5 rounded-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
            AI Knowledge Extractor
          </h2>
          
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
                      <button type="button" onClick={() => removeFile(sf.id)} className="text-red-500 hover:text-red-700 font-bold px-3 py-1 rounded-lg hover:bg-red-100 transition-colors">X</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {inputType === 'youtube' && (
            <div className="mb-8 animate-fade-in-up">
              <label className="block text-sm font-semibold mb-3 text-gray-700">Paste YouTube URL</label>
              <div className="relative mb-6">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                </div>
                <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="w-full pl-12 pr-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-500 outline-none transition-all text-gray-800 bg-gray-50 focus:bg-white" />
              </div>

              <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl shadow-sm">
                <label className="block text-sm font-bold mb-3 text-blue-900 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  Extraction Time Range (Minutes)
                </label>
                
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1 bg-white border border-blue-200 rounded-lg p-2 shadow-sm">
                    <span className="text-xs text-gray-500 block mb-1 font-semibold ml-1">Start Minute</span>
                    <div className="flex items-center">
                      <input type="number" min="0" value={ytStartMin} onChange={(e) => setYtStartMin(parseInt(e.target.value) || 0)} className="w-full px-2 py-1 outline-none text-gray-800 font-bold" />
                    </div>
                  </div>
                  <span className="text-blue-400 font-bold">TO</span>
                  <div className="flex-1 bg-white border border-blue-200 rounded-lg p-2 shadow-sm">
                    <span className="text-xs text-gray-500 block mb-1 font-semibold ml-1">End Minute</span>
                    <div className="flex items-center">
                      <input type="number" min="1" value={ytEndMin} onChange={(e) => setYtEndMin(parseInt(e.target.value) || 0)} className="w-full px-2 py-1 outline-none text-gray-800 font-bold" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {inputType === 'snap' && (
            <div className="mb-8 animate-fade-in-up">
              <label className="block text-sm font-semibold mb-3 text-gray-700">Take a Photo or Select Image</label>
              {!imagePreview ? (
                <div className="w-full border-2 border-dashed border-purple-300 bg-purple-50 rounded-xl p-8 text-center cursor-pointer hover:bg-purple-100 transition-all flex flex-col items-center justify-center" onClick={() => fileInputRef.current?.click()}>
                  <svg className="w-12 h-12 text-purple-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  <p className="font-semibold text-purple-700">Tap to open Camera or Gallery</p>
                  <p className="text-xs text-purple-500 mt-2 text-center max-w-xs">Supported: JPG, PNG. Make sure the text in the image is clear and readable.</p>
                </div>
              ) : (
                <div className="relative border rounded-xl overflow-hidden shadow-sm bg-gray-100 flex justify-center items-center h-64">
                   <img src={imagePreview} alt="Captured preview" className="h-full object-contain" />
                   <button type="button" onClick={clearImageSelection} className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 shadow-md transition-all">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                   </button>
                </div>
              )}
              <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            </div>
          )}

          <div className="mb-8">
             <label className="block text-sm font-semibold mb-3 text-gray-700">2. Configure Output</label>
             <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
               <div><label className="block text-xs text-gray-500 mb-1">MCQs (1m)</label><input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numMcq} onChange={e => setNumMcq(parseInt(e.target.value) || 0)} /></div>
               <div><label className="block text-xs text-gray-500 mb-1">Blanks (1m)</label><input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numFillBlank} onChange={e => setNumFillBlank(parseInt(e.target.value) || 0)} /></div>
               <div><label className="block text-xs text-gray-500 mb-1">Short (2m)</label><input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numShort} onChange={e => setNumShort(parseInt(e.target.value) || 0)} /></div>
               <div><label className="block text-xs text-gray-500 mb-1">Long (5m)</label><input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numLong} onChange={e => setNumLong(parseInt(e.target.value) || 0)} /></div>
               <div>
                 <label className="block text-xs text-gray-500 mb-1">Difficulty</label>
                 <select className="w-full px-2 py-2 bg-gray-50 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                   <option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option>
                 </select>
               </div>
               <div>
                 <label className="block text-xs text-blue-600 mb-1 font-bold">Question Style</label>
                 <select className="w-full px-2 py-2 bg-blue-50 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-blue-900 font-semibold" value={questionStyle} onChange={e => setQuestionStyle(e.target.value)}>
                   <option value="Auto">✨ Auto Detect</option>
                   <option value="Conceptual">🧠 Conceptual</option>
                   <option value="Programming">💻 Coding</option>
                   <option value="Comprehension">📖 Comprehension</option>
                   <option value="Scenario">🌍 Scenario</option>
                   <option value="Comparison">⚖️ Comparison</option>
                   <option value="Exam">🎓 Exam Style</option>
                 </select>
               </div>
             </div>
          </div>

          <div className="mb-8">
            <label className="block text-sm font-semibold mb-3 text-gray-700">3. Select Action</label>
            <div className="flex gap-4">
              <label className={`flex-1 flex items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition-all ${mode === 'preparation' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-200'}`}>
                <input type="radio" name="mode" className="hidden" checked={mode === 'preparation'} onChange={() => setMode('preparation')} />
                <span className="font-bold">Generate Study Notes</span>
              </label>

              <label className={`flex-1 flex items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition-all ${mode === 'test' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 hover:border-teal-200'}`}>
                <input type="radio" name="mode" className="hidden" checked={mode === 'test'} onChange={() => setMode('test')} />
                <span className="font-bold">Start Graded Exam</span>
              </label>
            </div>
          </div>

          {message && <div className={`mb-4 p-3 rounded-lg text-center font-medium text-sm border ${message.includes("Complete") ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>{message}</div>}

          <button type="submit" disabled={loading} className="w-full py-4 bg-gradient-to-r from-gray-800 to-gray-900 hover:from-black hover:to-gray-800 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-70 flex items-center justify-center">
            {loading ? "Generating Assessment..." : "Generate Assessment"}
          </button>
        </form>

        {/* 📚 STUDY NOTES (Preparation Mode Results) */}
        {quizData && mode === 'preparation' && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 animate-fade-in-up mt-8">
            <h2 className="text-2xl font-bold mb-6 text-blue-600 border-b pb-4">Study Notes Generated</h2>
            
            <div className="space-y-6">
               {quizData.mcq_questions?.map((q: any, i: number) => (
                  <div key={i} className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                     <p className="font-bold text-gray-800 mb-2">Q: {q.question_text}</p>
                     <p className="text-sm text-green-700 font-semibold mb-1">Ans: {q.correct_answer}</p>
                     {q.explanation && <p className="text-xs text-gray-600 italic">Why: {q.explanation}</p>}
                  </div>
               ))}
               
               {quizData.short_questions?.map((q: any, i: number) => (
                  <div key={i} className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                     <p className="font-bold text-gray-800 mb-2">Q: {q.question_text}</p>
                     <p className="text-sm text-purple-700 font-semibold mb-1">Ans: {q.correct_answer}</p>
                  </div>
               ))}

               {quizData.long_questions?.map((q: any, i: number) => (
                  <div key={i} className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                     <p className="font-bold text-gray-800 mb-2">Q: {q.question_text}</p>
                     <p className="text-sm text-orange-700 font-semibold mb-1">Model Ans: {q.model_answer}</p>
                  </div>
               ))}
            </div>

            <div className="mt-8 pt-6 border-t flex flex-col items-center">
               <p className="text-gray-500 mb-4 font-medium">Ready to test your knowledge?</p>
               <button onClick={() => router.push(`/quiz/${quizId}`)} className="px-8 py-3 bg-gradient-to-r from-green-500 to-teal-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all">
                  Take the Graded Exam Now
               </button>
            </div>
          </div>
        )}

      </div>

      {/* 🎨 CUSTOM POPUP MODAL */}
      {customPopup.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl transform transition-all text-center">
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-5 shadow-inner ${customPopup.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {customPopup.type === 'success' ? (
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
              ) : (
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
              )}
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{customPopup.title}</h3>
            <p className="text-gray-500 mb-8 leading-relaxed">{customPopup.message}</p>
            <button onClick={() => setCustomPopup({ ...customPopup, show: false })} className={`w-full py-4 text-white font-bold rounded-xl transition-all shadow-md ${customPopup.type === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
              Okay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}