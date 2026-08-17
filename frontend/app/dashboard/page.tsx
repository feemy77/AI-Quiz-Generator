"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

// 📱 DYNAMIC API URL CONFIGURATION (FOR ANDROID COMPATIBILITY)
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
  const [analyzingFile, setAnalyzingFile] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("preparation"); 
  
  const [inputType, setInputType] = useState("document"); 
  const [youtubeUrl, setYoutubeUrl] = useState("");
  
  const [ytStartMin, setYtStartMin] = useState(0);
  const [ytEndMin, setYtEndMin] = useState(25);
  
  const [numMcq, setNumMcq] = useState(5);
  const [numFillBlank, setNumFillBlank] = useState(2);
  const [numShort, setNumShort] = useState(2);
  const [numLong, setNumLong] = useState(1);
  const [difficulty, setDifficulty] = useState("Medium");
  
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  
  const [quizData, setQuizData] = useState<any>(null);
  const [quizId, setQuizId] = useState<number | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🏫 STATE: For Joining a Class
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // 🏆 STATE: Gamification & Flashcards Data
  const [stats, setStats] = useState<{
    streak: { current_streak: number, longest_streak: number },
    badges: { badge_name: string }[],
    dueFlashcards: number
  }>({
    streak: { current_streak: 0, longest_streak: 0 },
    badges: [],
    dueFlashcards: 0
  });

  useEffect(() => {
    setIsMounted(true);
    const token = localStorage.getItem("token");
    const userRole = localStorage.getItem("role");

    if (!token) {
      router.push("/"); 
    } else if (userRole === "teacher") {
      router.push("/teacher-dashboard"); 
    }
    
    const storedName = localStorage.getItem("name") || "Student";
    setStudentName(storedName);

    if (token) {
      fetchUserStats(token);
    }
  }, [router]);

  const fetchUserStats = async (token: string) => {
    try {
      const statRes = await fetch(`${API_BASE_URL}/user/dashboard`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const cardRes = await fetch(`${API_BASE_URL}/flashcards/due`, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (statRes.ok && cardRes.ok) {
        const statData = await statRes.json();
        const cardData = await cardRes.json();
        setStats({
          streak: statData.streak,
          badges: statData.badges,
          dueFlashcards: cardData.due_count
        });
      }
    } catch (e) {
      console.log("Could not load stats", e);
    }
  };

  if (!isMounted) return null;

  const handleLogout = () => {
    localStorage.clear();
    router.push("/");
  };

  // 🏫 FUNCTION: Join Class
  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    
    setJoining(true);
    try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/student/classrooms/join`, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${token}`, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({ join_code: joinCode.trim() })
        });
        const data = await res.json();
        
        if (res.ok) {
            alert("🎉 Successfully joined the class!");
            setJoinCode("");
        } else {
            alert(data.detail || "Failed to join class. Please check the code.");
        }
    } catch (e) {
        alert("Network error.");
    } finally {
        setJoining(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setTotalPages(null);
    setStartPage(1);
    setEndPage(1);
    setMessage("");
    setImagePreview(null);

    if (inputType === 'snap' && selectedFile) {
       const url = URL.createObjectURL(selectedFile);
       setImagePreview(url);
       return; 
    }

    if (selectedFile && inputType === 'document') {
      setAnalyzingFile(true);
      const fd = new FormData();
      fd.append("file", selectedFile); 
      try {
        const res = await fetch(`${API_BASE_URL}/quiz/analyze-document`, {
          method: "POST",
          body: fd
        });
        if (res.ok) {
          const data = await res.json();
          setTotalPages(data.total_pages);
          setEndPage(data.total_pages); 
        } else {
          setMessage("Failed to analyze Document.");
        }
      } catch(e) {
        setMessage("Network error while analyzing Document.");
      } finally {
        setAnalyzingFile(false);
      }
    }
  };

  const clearImageSelection = () => {
      setFile(null);
      setImagePreview(null);
      if (fileInputRef.current) {
          fileInputRef.current.value = '';
      }
  };

  const handleGenerateSelfStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (inputType === 'document' && !file) {
      setMessage("Please upload your study material first.");
      return;
    }
    if (inputType === 'snap' && !file) {
      setMessage("Please take a photo or select an image first.");
      return;
    }
    if (inputType === 'youtube' && !youtubeUrl.trim()) {
      setMessage("Please enter a valid YouTube Video Link.");
      return;
    }

    if (numMcq + numFillBlank + numShort + numLong <= 0) {
      setMessage("Please select at least one question type.");
      return;
    }
    if (inputType === 'document' && (startPage > endPage || !totalPages)) {
      setMessage("Invalid page range selected.");
      return;
    }

    setLoading(true);
    setMessage("");
    setQuizData(null);
    setQuizId(null);

    const token = localStorage.getItem("token");
    const formData = new FormData();
    
    if ((inputType === 'document' || inputType === 'snap') && file) {
        formData.append("file", file); 
        formData.append("start_page", startPage.toString());
        formData.append("end_page", endPage.toString());
    } else if (inputType === 'youtube') {
        formData.append("youtube_url", youtubeUrl);
        formData.append("yt_start_min", ytStartMin.toString());
        formData.append("yt_end_min", ytEndMin.toString());
    }

    formData.append("num_mcq", numMcq.toString());
    formData.append("num_fill_blank", numFillBlank.toString());
    formData.append("num_short", numShort.toString());
    formData.append("num_long", numLong.toString());
    formData.append("difficulty", difficulty);
    formData.append("institution_name", "Self-Study Assessment");

    try {
      const response = await fetch(`${API_BASE_URL}/quiz/generate`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setQuizData(data.quiz_data);
        setQuizId(data.quiz_id);
        setMessage("Generation Complete.");
      } else {
        setMessage(`Error: ${data.detail || "Generation failed"}`);
      }
    } catch (error) {
      setMessage("Network error. Backend might be offline.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      
      {/* Header */}
      <div className="max-w-5xl mx-auto flex justify-between items-center mb-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Student Workspace
          </h1>
          <p className="text-gray-500 mt-1">Welcome back, {studentName}. Create assessments from documents or videos.</p>
        </div>
        <button onClick={handleLogout} className="px-5 py-2 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 transition-colors">
          Logout
        </button>
      </div>

      {/* 🏫 JOIN CLASS SECTION */}
      <div className="max-w-5xl mx-auto mb-6 bg-purple-50 p-5 rounded-2xl border border-purple-100 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in-up">
         <div>
            <h3 className="font-bold text-purple-900 text-lg flex items-center">
              <span className="mr-2">🏫</span> Join a Classroom
            </h3>
            <p className="text-sm text-purple-700 mt-1">Enter the 7-digit code provided by your teacher to join their class.</p>
         </div>
         <form onSubmit={handleJoinClass} className="flex gap-2 w-full md:w-auto">
            <input 
               type="text" 
               placeholder="e.g. HCVICAI"
               value={joinCode}
               onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
               maxLength={7}
               className="px-4 py-2 border border-purple-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 font-bold tracking-widest uppercase text-center w-40"
               required
            />
            <button 
               type="submit" 
               disabled={joining}
               className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50"
            >
               {joining ? "Joining..." : "Join"}
            </button>
         </form>
      </div>

      {/* 🏆 GAMIFICATION STATS PANEL */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
         <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100 flex items-center">
            <div className="bg-orange-100 p-3 rounded-full mr-4">
               <span className="text-2xl">🔥</span>
            </div>
            <div>
               <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">Current Streak</p>
               <p className="text-2xl font-bold text-orange-600">{stats.streak.current_streak} Days</p>
               <p className="text-xs text-orange-400 mt-1">Best: {stats.streak.longest_streak} Days</p>
            </div>
         </div>

         <div className="bg-white p-5 rounded-2xl shadow-sm border border-blue-100 flex items-center">
            <div className="bg-blue-100 p-3 rounded-full mr-4">
               <span className="text-2xl">🎯</span>
            </div>
            <div className="w-full">
               <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider mb-1">Badges Earned ({stats.badges.length})</p>
               <div className="flex gap-2 flex-wrap">
                  {stats.badges.length > 0 ? (
                     stats.badges.slice(0, 2).map((b, i) => (
                        <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md border border-blue-200">
                          {b.badge_name}
                        </span>
                     ))
                  ) : (
                     <span className="text-xs text-gray-400">Complete a quiz to earn badges!</span>
                  )}
               </div>
            </div>
         </div>

         <div className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100 flex items-center justify-between">
            <div className="flex items-center">
               <div className="bg-purple-100 p-3 rounded-full mr-4">
                  <span className="text-2xl">🗂️</span>
               </div>
               <div>
                  <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">Due Flashcards</p>
                  <p className="text-2xl font-bold text-purple-600">{stats.dueFlashcards}</p>
               </div>
            </div>
            {stats.dueFlashcards > 0 && (
               <button 
                 onClick={() => router.push('/flashcards')}
                 className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
               >
                 Review
               </button>
            )}
         </div>
      </div>

      {/* ORIGINAL GENERATOR FORM (UNTOUCHED LOGIC) */}
      <div className="max-w-5xl mx-auto space-y-6">
        <form onSubmit={handleGenerateSelfStudy} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          
          <h2 className="text-2xl font-bold mb-8 text-gray-800 flex items-center border-b pb-4">
            <svg className="w-8 h-8 text-blue-600 mr-3 bg-blue-100 p-1.5 rounded-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
            AI Knowledge Extractor
          </h2>
          
          <div className="mb-8">
            <label className="block text-sm font-semibold mb-3 text-gray-700">1. Select Source Material</label>
            <div className="flex bg-gray-100 p-1.5 rounded-xl flex-wrap md:flex-nowrap gap-1">
              <button 
                type="button"
                onClick={() => { setInputType('document'); clearImageSelection(); }}
                className={`flex-1 min-w-[120px] flex items-center justify-center py-3 rounded-lg font-bold text-sm transition-all ${inputType === 'document' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                📁 Universal Document
              </button>
              <button 
                type="button"
                onClick={() => { setInputType('youtube'); clearImageSelection(); }}
                className={`flex-1 min-w-[120px] flex items-center justify-center py-3 rounded-lg font-bold text-sm transition-all ${inputType === 'youtube' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                ▶️ YouTube Video
              </button>
              <button 
                type="button"
                onClick={() => { setInputType('snap'); setFile(null); }}
                className={`flex-1 min-w-[120px] flex items-center justify-center py-3 rounded-lg font-bold text-sm transition-all ${inputType === 'snap' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                📸 Snap & Quiz
              </button>
            </div>
          </div>

          {inputType === 'document' && (
            <div className="mb-8 animate-fade-in-up">
              <label className="block text-sm font-semibold mb-3 text-gray-700">Upload File (PDF, DOCX, TXT)</label>
              <input type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleFileChange} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all"/>
              {analyzingFile && <p className="mt-2 text-sm text-blue-600 animate-pulse flex items-center"><svg className="w-4 h-4 mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Scanning Document...</p>}
              
              {totalPages !== null && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <label className="block text-sm font-semibold mb-2 text-blue-800">Select Page Range (Total: {totalPages})</label>
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-sm font-medium mr-2">Start:</span>
                      <input type="number" min="1" max={totalPages} value={startPage} onChange={(e) => setStartPage(parseInt(e.target.value) || 1)} className="w-24 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-center" />
                    </div>
                    <span className="text-gray-400 font-bold">TO</span>
                    <div>
                      <span className="text-sm font-medium mr-2">End:</span>
                      <input type="number" min="1" max={totalPages} value={endPage} onChange={(e) => setEndPage(parseInt(e.target.value) || 1)} className="w-24 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-center" />
                    </div>
                  </div>
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
                <input 
                  type="url" 
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..." 
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-100 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-500 outline-none transition-all text-gray-800 bg-gray-50 focus:bg-white"
                />
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
                <div 
                  className="w-full border-2 border-dashed border-purple-300 bg-purple-50 rounded-xl p-8 text-center cursor-pointer hover:bg-purple-100 transition-all flex flex-col items-center justify-center"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg className="w-12 h-12 text-purple-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  <p className="font-semibold text-purple-700">Tap to open Camera or Gallery</p>
                  <p className="text-xs text-purple-500 mt-2 text-center max-w-xs">Supported: JPG, PNG. Make sure the text in the image is clear and readable.</p>
                </div>
              ) : (
                <div className="relative border rounded-xl overflow-hidden shadow-sm bg-gray-100 flex justify-center items-center h-64">
                   <img src={imagePreview} alt="Captured preview" className="h-full object-contain" />
                   <button 
                     type="button" 
                     onClick={clearImageSelection}
                     className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 shadow-md transition-all"
                   >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                   </button>
                </div>
              )}
              <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            </div>
          )}

          <div className="mb-8">
             <label className="block text-sm font-semibold mb-3 text-gray-700">2. Configure Output</label>
             <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
               <div>
                 <label className="block text-xs text-gray-500 mb-1">MCQs (1m)</label>
                 <input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numMcq} onChange={e => setNumMcq(parseInt(e.target.value) || 0)} />
               </div>
               <div>
                 <label className="block text-xs text-gray-500 mb-1">Blanks (1m)</label>
                 <input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numFillBlank} onChange={e => setNumFillBlank(parseInt(e.target.value) || 0)} />
               </div>
               <div>
                 <label className="block text-xs text-gray-500 mb-1">Short (2m)</label>
                 <input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numShort} onChange={e => setNumShort(parseInt(e.target.value) || 0)} />
               </div>
               <div>
                 <label className="block text-xs text-gray-500 mb-1">Long (5m)</label>
                 <input type="number" min="0" className="w-full px-3 py-2 bg-gray-50 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={numLong} onChange={e => setNumLong(parseInt(e.target.value) || 0)} />
               </div>
               <div>
                 <label className="block text-xs text-gray-500 mb-1">Difficulty</label>
                 <select className="w-full px-2 py-2 bg-gray-50 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                   <option value="Easy">Easy</option>
                   <option value="Medium">Medium</option>
                   <option value="Hard">Hard</option>
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

        {quizData && mode === 'preparation' && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 animate-fade-in-up">
            <h2 className="text-2xl font-bold mb-6 text-blue-600 border-b pb-4">Study Notes Generated</h2>
            <p className="text-gray-500">Your AI-generated notes are ready below.</p>
          </div>
        )}

        {quizId && mode === 'test' && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center py-12 animate-fade-in-up">
            <h2 className="text-3xl font-bold mb-4 text-gray-800">Assessment Ready</h2>
            <p className="text-gray-500 mb-8 max-w-lg mx-auto">The AI has configured your graded assessment. Proceed to the testing environment.</p>
            <button 
              onClick={() => router.push(`/quiz/${quizId}`)} 
              className="px-8 py-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-lg rounded-xl shadow-lg transition-all"
            >
              Enter Live Environment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}