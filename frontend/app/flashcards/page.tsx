"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

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
    fetchDueFlashcards();
  }, [router]);

  const fetchDueFlashcards = async () => {
    try {
      const { ok, data } = await apiFetch("/flashcards/due");
      if (ok) {
        setFlashcards(data.flashcards || []);
      } else {
        toast.error("Failed to fetch flashcards.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (quality: number) => {
    setSubmitting(true);
    const currentCard = flashcards[currentIndex];

    try {
      const { ok } = await apiFetch("/flashcards/review", {
        method: "POST",
        body: JSON.stringify({
          flashcard_id: currentCard.flashcard_id,
          quality: quality,
        }),
      });

      if (ok) {
        // Move to next card or finish
        setIsFlipped(false);
        setCurrentIndex((prev) => prev + 1);
        toast.success("Review recorded!");
      } else {
        toast.error("Failed to record review.");
      }
    } catch (e) {
      toast.error("Network error.");
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
        <div className="max-w-md w-full bg-white p-10 rounded-3xl shadow-sm border border-emerald-100 text-center">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>
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
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 flex flex-col items-center pb-24">
      
      {/* Header & Progress */}
      <div className="max-w-2xl w-full mb-6 sm:mb-8 flex justify-between items-center">
        <button 
          onClick={() => router.push("/student-dashboard")}
          className="text-gray-500 hover:text-gray-900 font-semibold flex items-center transition-colors tap-press cursor-pointer text-sm"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          Back
        </button>
        <div className="text-xs sm:text-sm font-bold text-purple-600 bg-purple-50 px-3.5 py-1.5 rounded-full border border-purple-100">
          Card {currentIndex + 1} of {flashcards.length}
        </div>
      </div>

      <div className="max-w-2xl w-full bg-gray-200 rounded-full h-2 sm:h-2.5 mb-8 sm:mb-10 overflow-hidden">
        <div className="bg-purple-600 h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
      </div>

      {/* Flashcard Component */}
      <div className="max-w-2xl w-full perspective-1000 mb-8 sm:mb-10">
        <div 
          className={`relative w-full transition-transform duration-500 preserve-3d cursor-pointer select-none tap-press ${isFlipped ? 'rotate-y-180' : ''}`}
          style={{ minHeight: '320px' }}
          onClick={() => !isFlipped && setIsFlipped(true)}
        >
          {/* FRONT OF CARD */}
          <div className="absolute w-full h-full backface-hidden bg-white border-2 border-purple-100 rounded-3xl p-6 sm:p-10 flex flex-col justify-center items-center shadow-lg text-center hover:shadow-xl transition-shadow">
            <span className="absolute top-5 left-5 sm:top-6 sm:left-6 text-purple-300">
              <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 7.5l-10-5v10.5l10 5 10-5V4.5l-10 5z"/></svg>
            </span>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 leading-relaxed px-2">
              {currentCard.front}
            </h2>
            <p className="absolute bottom-5 sm:bottom-6 text-gray-400 text-xs sm:text-sm font-semibold animate-pulse">
              Tap to reveal answer
            </p>
          </div>

          {/* BACK OF CARD */}
          <div className="absolute w-full h-full backface-hidden bg-purple-50 border-2 border-purple-200 rounded-3xl p-6 sm:p-10 flex flex-col justify-center items-center shadow-lg text-center rotate-y-180">
            <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-purple-900 leading-relaxed px-2">
              {currentCard.back}
            </h3>
            <div className="absolute top-4 right-4 bg-purple-200 text-purple-700 text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-bold uppercase">
              Answer
            </div>
          </div>
        </div>
      </div>

      {/* Spaced Repetition Controls (Only visible when flipped) */}
      <div className={`max-w-2xl w-full transition-opacity duration-300 ${isFlipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <p className="text-center text-gray-500 font-semibold mb-4 uppercase tracking-widest text-xs sm:text-sm">How well did you know this?</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
          <button 
            disabled={submitting}
            onClick={() => handleReview(1)}
            className="py-3.5 sm:py-4 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-2xl font-bold transition-all disabled:opacity-50 tap-press cursor-pointer min-h-[50px]"
          >
            Again
            <span className="block text-[11px] font-normal text-red-500 mt-0.5">&lt; 1 min</span>
          </button>
          
          <button 
            disabled={submitting}
            onClick={() => handleReview(3)}
            className="py-3.5 sm:py-4 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-2xl font-bold transition-all disabled:opacity-50 tap-press cursor-pointer min-h-[50px]"
          >
            Hard
            <span className="block text-[11px] font-normal text-orange-500 mt-0.5">1 day</span>
          </button>
          
          <button 
            disabled={submitting}
            onClick={() => handleReview(4)}
            className="py-3.5 sm:py-4 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-2xl font-bold transition-all disabled:opacity-50 tap-press cursor-pointer min-h-[50px]"
          >
            Good
            <span className="block text-[11px] font-normal text-blue-500 mt-0.5">3 days</span>
          </button>

          <button 
            disabled={submitting}
            onClick={() => handleReview(5)}
            className="py-3.5 sm:py-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-2xl font-bold transition-all disabled:opacity-50 tap-press cursor-pointer min-h-[50px]"
          >
            Easy
            <span className="block text-[11px] font-normal text-emerald-600 mt-0.5">7+ days</span>
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