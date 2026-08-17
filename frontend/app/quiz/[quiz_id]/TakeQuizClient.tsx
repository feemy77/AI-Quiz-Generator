"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";

// 📱 DYNAMIC API URL CONFIGURATION (FOR ANDROID COMPATIBILITY)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.0.103:8000";

// 🛠️ REQUIRED FOR NEXT.JS STATIC EXPORT (BUILD FIX)
export async function generateStaticParams() {
  return [{ quiz_id: '1' }];
}

export default function TakeQuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const quiz_id = params.quiz_id;
  
  // Naya: Challenge code URL se pick karna
  const challengeCode = searchParams.get("challenge");

  const [isMounted, setIsMounted] = useState(false);
  const [quizData, setQuizData] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Student's input
  const [studentName, setStudentName] = useState("");
  const [answers, setAnswers] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<any>(null);

  // Gamification & Multiplayer States
  const [actionLoading, setActionLoading] = useState(false);
  const [shareData, setShareData] = useState<{code: string, link: string} | null>(null);
  const [flashcardMsg, setFlashcardMsg] = useState("");

  useEffect(() => {
    setIsMounted(true);
    fetchQuiz();
    
    // Auto-fill student name if available in local storage
    const storedName = localStorage.getItem("name") || "";
    if (storedName) setStudentName(storedName);
  }, [quiz_id]);

  const fetchQuiz = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/quiz/${quiz_id}`);
      if (res.ok) {
        const data = await res.json();
        setQuizData(data.quiz_data);
        setMetadata(data.exam_metadata);
      } else {
        alert("Quiz not found!");
        router.push("/");
      }
    } catch (e) {
      alert("Network error fetching quiz.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (key: string, value: string) => {
    setAnswers((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName) {
      alert("Please enter your name before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      
      // Request Headers setup: Token bhejna zaroori hai agar ho taake Streaks update hon!
      const headers: any = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/quiz/${quiz_id}/submit`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ 
          student_name: studentName, 
          answers: answers,
          challenge_code: challengeCode // Naya: Agar challenge join kiya hai toh code bhejein
        })
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results);
      } else {
        alert("Failed to grade test.");
      }
    } catch (e) {
      alert("Error submitting test.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnDashboard = () => {
    const role = localStorage.getItem("role");
    if (role === "student") {
      router.push("/student-dashboard");
    } else if (role === "teacher" || role === "admin") {
      router.push("/dashboard");
    } else {
      router.push("/");
    }
  };

  // NAYI FUNCTIONALITY: Create Challenge
  const handleCreateChallenge = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please login first to challenge a friend!");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/challenge/create`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({ quiz_id: parseInt(quiz_id as string) })
      });
      const data = await res.json();
      if (res.ok) {
        const link = `${window.location.origin}/quiz/${quiz_id}?challenge=${data.code}`;
        setShareData({ code: data.code, link: link });
      }
    } catch (e) {
      alert("Failed to create challenge.");
    } finally {
      setActionLoading(false);
    }
  };

  // NAYI FUNCTIONALITY: Share Link
  const handleShare = async () => {
    if (!shareData) return;
    const shareText = `I scored ${results.total_score}/${results.max_score} in this AI Quiz! 🧠 Can you beat my score? Join using my link!`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AI Quiz Challenge',
          text: shareText,
          url: shareData.link,
        });
      } catch (err) {
        console.log("Share cancelled");
      }
    } else {
      navigator.clipboard.writeText(`${shareText}\n\n${shareData.link}`);
      alert("Link copied to clipboard! Paste it in WhatsApp.");
    }
  };

  // NAYI FUNCTIONALITY: Generate Flashcards
  const handleCreateFlashcards = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please login first to create flashcards!");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/quiz/${quiz_id}/flashcards`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setFlashcardMsg(data.message || "Flashcards generated! Check your dashboard.");
      }
    } catch (e) {
      alert("Failed to create flashcards.");
    } finally {
      setActionLoading(false);
    }
  };

  if (!isMounted) return null;
  if (loading) return <div className="min-h-screen flex items-center justify-center text-xl font-bold">Loading Test...</div>;

  // Render Test Results if already submitted
  if (results) {
    const pct = ((results.total_score / results.max_score) * 100).toFixed(1);
    return (
      <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Score Card */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
            <h1 className="text-4xl font-extrabold text-blue-600 mb-2">Test Completed!</h1>
            <p className="text-xl mb-4">Your Score: <span className="font-bold">{results.total_score} / {results.max_score}</span> ({pct}%)</p>
            {challengeCode && (
               <div className="inline-block bg-teal-50 border border-teal-200 text-teal-800 px-4 py-2 rounded-lg text-sm font-semibold mb-4">
                 🎉 Challenge completed! Your score is on the leaderboard.
               </div>
            )}
          </div>

          {/* ADVANCED STUDENT ACTIONS */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
             <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-4">Next Steps & Gamification</h2>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Challenge Button */}
                {!shareData ? (
                  <button 
                    onClick={handleCreateChallenge} 
                    disabled={actionLoading}
                    className="flex flex-col items-center justify-center p-6 border-2 border-indigo-100 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all"
                  >
                    <span className="text-3xl mb-2">⚔️</span>
                    <span className="font-bold text-indigo-700">Challenge a Friend</span>
                    <span className="text-xs text-indigo-500 mt-1">Share link and compete!</span>
                  </button>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 border-2 border-green-200 bg-green-50 rounded-xl">
                    <span className="font-bold text-green-700 mb-2">Challenge Created!</span>
                    <button onClick={handleShare} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold shadow-md hover:bg-green-700 transition-all flex items-center">
                      🔗 Share on WhatsApp
                    </button>
                  </div>
                )}

                {/* Flashcard Button */}
                <button 
                  onClick={handleCreateFlashcards} 
                  disabled={actionLoading || !!flashcardMsg}
                  className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl transition-all ${flashcardMsg ? 'border-green-200 bg-green-50' : 'border-purple-100 bg-purple-50 hover:bg-purple-100'}`}
                >
                  <span className="text-3xl mb-2">🗂️</span>
                  <span className={`font-bold ${flashcardMsg ? 'text-green-700' : 'text-purple-700'}`}>
                    {flashcardMsg ? "Saved to Dashboard!" : "Generate Flashcards"}
                  </span>
                  <span className={`text-xs mt-1 ${flashcardMsg ? 'text-green-600 font-semibold' : 'text-purple-500'}`}>
                    {flashcardMsg || "Zero AI cost. Save to memory."}
                  </span>
                </button>
             </div>

             <button onClick={handleReturnDashboard} className="w-full py-4 bg-gray-900 hover:bg-black transition-colors text-white rounded-xl font-bold text-lg shadow-lg">
                ⬅️ Return to Dashboard
             </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Test Form
  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        
        {/* Exam Header */}
        <div className="text-center border-b-2 border-gray-200 pb-6 mb-8 relative">
          
          {/* Naya: Challenge Indicator */}
          {challengeCode && (
             <div className="absolute top-0 right-0 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200">
                ⚔️ Playing Challenge
             </div>
          )}

          <h1 className="text-3xl font-bold uppercase tracking-wide text-gray-900">
            {metadata?.institution_name || "AI Generated Exam"}
          </h1>
          <h2 className="text-xl text-gray-600 mt-2 font-medium">
            {metadata?.subject && metadata?.class_name ? `${metadata.subject} - ${metadata.class_name}` : metadata?.exam_title}
          </h2>
          
          {/* Hide Examiner name if it's a Self-Study Assessment */}
          {metadata?.institution_name === "Self-Study Assessment" ? (
            <p className="text-sm text-gray-500 mt-2 bg-gray-100 inline-block px-4 py-1 rounded-full font-medium">
              Duration: {metadata?.duration_minutes} mins
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-2 bg-gray-100 inline-block px-4 py-1 rounded-full font-medium">
              Examiner: {metadata?.teacher_name} | Duration: {metadata?.duration_minutes} mins
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="mb-6 p-6 bg-blue-50 rounded-xl border border-blue-100">
            <label className="font-bold text-lg text-blue-900 block mb-2">Student Name (Required for Grading):</label>
            <input 
              type="text" 
              required 
              className="w-full px-4 py-3 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-lg" 
              placeholder="Enter your full name" 
              value={studentName} 
              onChange={(e) => setStudentName(e.target.value)} 
            />
          </div>

          {/* MCQs */}
          {quizData?.mcq_questions?.length > 0 && (
            <div>
              <h3 className="text-2xl font-bold text-blue-700 mb-6 border-b pb-2">Section A: Multiple Choice (1 Mark Each)</h3>
              {quizData.mcq_questions.map((q: any, i: number) => (
                <div key={i} className="mb-6 p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 transition-colors">
                  <p className="font-semibold text-lg mb-4 text-gray-800">Q{i+1}. {q.question_text}</p>
                  <div className="space-y-3">
                    {q.options.map((opt: string, j: number) => {
                      const letter = String.fromCharCode(65 + j);
                      return (
                        <label key={j} className="flex items-center space-x-3 bg-gray-50 p-4 rounded-lg border border-gray-200 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all">
                          <input type="radio" name={`mcq_${i}`} value={opt} onChange={() => handleInputChange(`mcq_${i}`, opt)} className="w-5 h-5 text-blue-600 focus:ring-blue-500" required />
                          <span className="text-gray-700"><strong className="mr-2 text-gray-900">{letter})</strong> {opt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Fill in the Blanks */}
          {quizData?.fill_blank_questions?.length > 0 && (
            <div>
              <h3 className="text-2xl font-bold text-purple-700 mb-6 border-b pb-2 mt-8">Section B: Fill in the Blanks (1 Mark Each)</h3>
              {quizData.fill_blank_questions.map((q: any, i: number) => (
                <div key={i} className="mb-6 p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-purple-200 transition-colors">
                  <p className="font-semibold text-lg mb-4 text-gray-800">Q{i+1}. {q.question_text}</p>
                  <input type="text" onChange={(e) => handleInputChange(`fb_${i}`, e.target.value)} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white text-lg transition-all" placeholder="Type your answer here..." required />
                </div>
              ))}
            </div>
          )}

          {/* Short Questions */}
          {quizData?.short_questions?.length > 0 && (
            <div>
              <h3 className="text-2xl font-bold text-indigo-700 mb-6 border-b pb-2 mt-8">Section C: Short Questions (2 Marks Each)</h3>
              {quizData.short_questions.map((q: any, i: number) => (
                <div key={i} className="mb-6 p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-indigo-200 transition-colors">
                  <p className="font-semibold text-lg mb-4 text-gray-800">Q{i+1}. {q.question_text}</p>
                  <textarea rows={3} onChange={(e) => handleInputChange(`short_${i}`, e.target.value)} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-lg transition-all resize-none" placeholder="Write a short answer (1-2 sentences)..." required />
                </div>
              ))}
            </div>
          )}

          {/* Long Questions */}
          {quizData?.long_questions?.length > 0 && (
            <div>
              <h3 className="text-2xl font-bold text-orange-700 mb-6 border-b pb-2 mt-8">Section D: Long Questions (5 Marks Each)</h3>
              {quizData.long_questions.map((q: any, i: number) => (
                <div key={i} className="mb-6 p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-orange-200 transition-colors">
                  <p className="font-semibold text-lg mb-4 text-gray-800">Q{i+1}. {q.question_text}</p>
                  <textarea rows={6} onChange={(e) => handleInputChange(`long_${i}`, e.target.value)} className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white text-lg transition-all resize-y" placeholder="Write a detailed explanation..." required />
                </div>
              ))}
            </div>
          )}

          <div className="pt-8 border-t-2 border-gray-200">
            <button type="submit" disabled={submitting} className="w-full py-5 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-extrabold text-xl rounded-xl transition-all shadow-xl transform hover:scale-[1.02] disabled:opacity-50 disabled:transform-none">
              {submitting ? "AI is Grading your Test... ⏳" : "✅ Submit Test & Get Graded"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}