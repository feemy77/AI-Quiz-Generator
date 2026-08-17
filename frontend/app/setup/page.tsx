"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// 📱 DYNAMIC API URL CONFIGURATION (FOR ANDROID COMPATIBILITY)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.0.103:8000";

export default function SetupProfile() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [role, setRole] = useState("student"); // Default selection
  const [institution, setInstitution] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setIsMounted(true);
    const token = localStorage.getItem("token");
    const currentRole = localStorage.getItem("role");
    
    if (!token) {
      router.push("/");
    } else if (currentRole === "teacher") {
      router.push("/dashboard");
    } else if (currentRole === "student") {
      router.push("/student-dashboard");
    }
  }, [router]);

  if (!isMounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const token = localStorage.getItem("token");

    try {
      const response = await fetch(`${API_BASE_URL}/auth/update-profile`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ role, institution_name: institution }),
      });

      if (response.ok) {
        localStorage.setItem("role", role);
        setMessage("Profile configured successfully. Redirecting...");
        
        setTimeout(() => {
          if (role === "teacher") router.push("/dashboard");
          else router.push("/student-dashboard");
        }, 1000);
      } else {
        const data = await response.json();
        setMessage(`Error: ${data.detail || "Configuration failed"}`);
      }
    } catch (error) {
      setMessage("Network error. Please verify backend connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50 via-gray-50 to-indigo-50 p-6 selection:bg-blue-200">
      <div className="max-w-3xl w-full p-10 sm:p-12 bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white">
        
        {/* Sleek, Modern Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-blue-100/50 rounded-full mb-5">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-700 tracking-tight mb-3">
            Personalize Your Workspace
          </h1>
          <p className="text-base text-gray-500 font-medium max-w-lg mx-auto leading-relaxed">
            Select your primary objective to help us tailor the AI Quiz Generator experience for your needs.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Role Selection */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">1. Account Type</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              
              {/* Student Card */}
              <label className={`group relative flex flex-col items-start p-6 sm:p-8 rounded-3xl cursor-pointer transition-all duration-300 border-2 overflow-hidden ${role === 'student' ? 'border-blue-500 bg-blue-50/50 shadow-lg shadow-blue-500/20 scale-[1.02]' : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/30 hover:scale-[1.01]'}`}>
                <input type="radio" name="role" className="hidden" checked={role === 'student'} onChange={() => setRole('student')} />
                <div className={`absolute top-5 right-5 transition-all duration-300 ${role === 'student' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
                  <div className="bg-blue-500 text-white rounded-full p-1 shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                  </div>
                </div>
                
                {/* Academic Cap SVG */}
                <svg className="w-12 h-12 text-blue-600 mb-4 group-hover:-translate-y-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 14v7" />
                </svg>

                <span className={`font-bold text-xl mb-2 ${role === 'student' ? 'text-blue-900' : 'text-gray-900'}`}>Student</span>
                <span className="text-sm text-gray-500 font-medium leading-relaxed">
                  Generate mock assessments from study materials for exam preparation.
                </span>
              </label>

              {/* Teacher Card */}
              <label className={`group relative flex flex-col items-start p-6 sm:p-8 rounded-3xl cursor-pointer transition-all duration-300 border-2 overflow-hidden ${role === 'teacher' ? 'border-indigo-500 bg-indigo-50/50 shadow-lg shadow-indigo-500/20 scale-[1.02]' : 'border-gray-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/30 hover:scale-[1.01]'}`}>
                <input type="radio" name="role" className="hidden" checked={role === 'teacher'} onChange={() => setRole('teacher')} />
                <div className={`absolute top-5 right-5 transition-all duration-300 ${role === 'teacher' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
                  <div className="bg-indigo-500 text-white rounded-full p-1 shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                  </div>
                </div>
                
                {/* Presentation Board SVG */}
                <svg className="w-12 h-12 text-indigo-600 mb-4 group-hover:-translate-y-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>

                <span className={`font-bold text-xl mb-2 ${role === 'teacher' ? 'text-indigo-900' : 'text-gray-900'}`}>Educator</span>
                <span className="text-sm text-gray-500 font-medium leading-relaxed">
                  Create professional quizzes and automate evaluation workflows.
                </span>
              </label>

            </div>
          </div>

          {/* Institution Input */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">2. Organization (Optional)</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
              </div>
              <input
                type="text"
                className="w-full pl-12 pr-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-base font-medium text-gray-800 placeholder:font-normal placeholder:text-gray-400"
                placeholder="e.g. Oxford University / High School Name"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
              />
            </div>
          </div>

          {/* System Messages */}
          {message && (
            <div className={`animate-fade-in-up p-4 rounded-xl text-center font-bold text-sm border ${message.includes("successfully") ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
              {message}
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-4 px-8 bg-gradient-to-r from-gray-900 to-gray-800 hover:from-black hover:to-gray-900 text-white font-bold text-lg rounded-2xl shadow-[0_10px_20px_-10px_rgba(0,0,0,0.5)] transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Configuring Workspace...
                </>
              ) : (
                <>
                  Save & Continue
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}