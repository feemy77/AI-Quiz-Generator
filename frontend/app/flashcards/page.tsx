"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// 📱 DYNAMIC API URL CONFIGURATION (FOR ANDROID COMPATIBILITY)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.0.103:8000";

export default function FlashcardsReviewPage() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }
    fetchDueFlashcards(token);
  }, [router]);

  const fetchDueFlashcards = async (token: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/flashcards/due`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFlashcards(data.flashcards);
      } else {
        alert("Failed to fetch flashcards.");
      }
    } catch (e) {
      console.log(e);
      alert("Network error.");
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (quality: number) => {
    setSubmitting(true);
    const token = localStorage.getItem("token");
    const currentCard = flashcards[currentIndex];

    try {
      const res = await fetch(`${API_BASE_URL}/flashcards/review`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({
          flashcard_id: currentCard.flashcard_id,
          quality: quality
        })
      });

      if (res.ok) {
        // Move to next card or finish
        setIsFlipped(false);
        setCurrentIndex((prev) => prev + 1);
      } else {
        alert("Failed to record review.");
      }
    } catch (e) {
      alert("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isMounted) return null;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center font-bold text-gray-600">Loading your memory stack...</div>;
  }

  // If no cards left to review
  if (currentIndex >= flashcards.length) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-10 rounded-3xl shadow-sm border border-green-100 text-center">
          <div className="text-6xl mb-4">🧠</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">All Done!</h1>
          <p className="text-gray-500 mb-8">You have reviewed all your due flashcards for today. Your AI memory stack is up to date.</p>
          <button 
            onClick={() => router.push("/student-dashboard")}
            className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-md"
          >
            Return to Workspace
          </button>
        </div>
      </div>
    );
  }

  const currentCard = flashcards[currentIndex];
  const progress = ((currentIndex) / flashcards.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex flex-col items-center">
      
      {/* Header & Progress */}
      <div className="max-w-2xl w-full mb-8 flex justify-between items-center">
        <button 
          onClick={() => router.push("/student-dashboard")}
          className="text-gray-500 hover:text-gray-900 font-semibold flex items-center transition-colors"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          Back
        </button>
        <div className="text-sm font-bold text-purple-600 bg-purple-50 px-4 py-1.5 rounded-full border border-purple-100">
          Card {currentIndex + 1} of {flashcards.length}
        </div>
      </div>

      <div className="max-w-2xl w-full bg-gray-200 rounded-full h-2.5 mb-10 overflow-hidden">
        <div className="bg-purple-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
      </div>

      {/* Flashcard Component */}
      <div className="max-w-2xl w-full perspective-1000 mb-10">
        <div 
          className={`relative w-full transition-transform duration-500 preserve-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
          style={{ minHeight: '350px' }}
          onClick={() => !isFlipped && setIsFlipped(true)}
        >
          {/* FRONT OF CARD */}
          <div className="absolute w-full h-full backface-hidden bg-white border-2 border-purple-100 rounded-3xl p-10 flex flex-col justify-center items-center shadow-lg text-center hover:shadow-xl transition-shadow">
            <span className="absolute top-6 left-6 text-purple-300">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 7.5l-10-5v10.5l10 5 10-5V4.5l-10 5z"/></svg>
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 leading-relaxed">
              {currentCard.front}
            </h2>
            <p className="absolute bottom-6 text-gray-400 font-semibold animate-pulse">
              Tap to reveal answer
            </p>
          </div>

          {/* BACK OF CARD */}
          <div className="absolute w-full h-full backface-hidden bg-purple-50 border-2 border-purple-200 rounded-3xl p-10 flex flex-col justify-center items-center shadow-lg text-center rotate-y-180">
            <h3 className="text-xl md:text-2xl font-bold text-purple-900 leading-relaxed">
              {currentCard.back}
            </h3>
            <div className="absolute top-4 right-4 bg-purple-200 text-purple-700 text-xs px-2 py-1 rounded font-bold uppercase">
              Answer
            </div>
          </div>
        </div>
      </div>

      {/* Spaced Repetition Controls (Only visible when flipped) */}
      <div className={`max-w-2xl w-full transition-opacity duration-300 ${isFlipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <p className="text-center text-gray-500 font-semibold mb-4 uppercase tracking-widest text-sm">How well did you know this?</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button 
            disabled={submitting}
            onClick={() => handleReview(1)}
            className="py-4 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            Again
            <span className="block text-xs font-normal text-red-500 mt-1">&lt; 1 min</span>
          </button>
          
          <button 
            disabled={submitting}
            onClick={() => handleReview(3)}
            className="py-4 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            Hard
            <span className="block text-xs font-normal text-orange-500 mt-1">1 day</span>
          </button>
          
          <button 
            disabled={submitting}
            onClick={() => handleReview(4)}
            className="py-4 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            Good
            <span className="block text-xs font-normal text-blue-500 mt-1">3 days</span>
          </button>

          <button 
            disabled={submitting}
            onClick={() => handleReview(5)}
            className="py-4 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            Easy
            <span className="block text-xs font-normal text-green-500 mt-1">7+ days</span>
          </button>
        </div>
      </div>

      <style jsx>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>

    </div>
  );
}