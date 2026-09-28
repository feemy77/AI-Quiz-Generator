"use client";

import React, { useEffect, useState, useRef } from "react";
import { AlertTriangle, ShieldAlert, Lock, CheckCircle2 } from "lucide-react";
import { playWarningBeep } from "@/lib/soundEffects";

interface AntiCheatMonitorProps {
  isActive: boolean; // only monitor when quiz is in progress (not when viewing results)
  isAssignment: boolean; // strict mode for classroom assignments/formal exams
  onAutoSubmit: (reason: string) => void;
  maxViolations?: number;
}

export const AntiCheatMonitor: React.FC<AntiCheatMonitorProps> = ({
  isActive,
  isAssignment,
  onAutoSubmit,
  maxViolations = 3,
}) => {
  const [violations, setViolations] = useState<number>(0);
  const [showWarningModal, setShowWarningModal] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const lastViolationTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive) return;

    // 1. Prevent right-click during exam
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // 2. Prevent Ctrl+C / Cmd+C copying
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
    };

    // 3. Tab switch / Window blur detection
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleViolation("Tab switched or browser minimized");
      }
    };

    const handleWindowBlur = () => {
      handleViolation("Browser window lost focus");
    };

    const handleViolation = (reason: string) => {
      const now = Date.now();
      // Debounce violations within 3 seconds so 1 alt-tab doesn't trigger 2 increments
      if (now - lastViolationTimeRef.current < 3000) return;
      lastViolationTimeRef.current = now;

      setViolations((prev) => {
        const next = prev + 1;
        playWarningBeep();

        if (next >= maxViolations) {
          setIsLocked(true);
          setShowWarningModal(true);
          // Auto submit after short delay so student sees the locking notification
          setTimeout(() => {
            onAutoSubmit(`Security lock triggered: ${next} tab switch violations detected.`);
          }, 2500);
        } else {
          setShowWarningModal(true);
        }

        return next;
      });
    };

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("copy", handleCopy);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("copy", handleCopy);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isActive, maxViolations, onAutoSubmit]);

  if (!isActive || !showWarningModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl border border-red-500/40 bg-gradient-to-b from-slate-900 via-slate-950 to-black p-6 sm:p-8 text-white shadow-2xl shadow-red-950/60 text-center">
        {/* Pulsing warning icon */}
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 animate-pulse">
          {isLocked ? <Lock className="h-10 w-10 text-red-500" /> : <ShieldAlert className="h-10 w-10 text-amber-400" />}
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-300 uppercase tracking-widest mb-3">
          <AlertTriangle className="w-3.5 h-3.5" />
          Academic Integrity Alert
        </div>

        <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
          {isLocked ? "Exam Locked: Maximum Violations Reached" : "Warning: Tab Switch Detected"}
        </h3>

        <p className="text-sm text-slate-300 leading-relaxed mb-6">
          {isLocked ? (
            <>
              You have exceeded the maximum permitted tab switches (<span className="text-red-400 font-bold">{violations} / {maxViolations}</span>). 
              Your assessment is now being <span className="text-red-400 font-semibold">automatically submitted</span> and reported to your instructor.
            </>
          ) : (
            <>
              Navigating away from the examination window is strictly recorded. 
              You have used <span className="text-amber-400 font-bold">{violations} of {maxViolations}</span> allowed warnings. 
              Further tab changes will immediately lock and submit your assessment.
            </>
          )}
        </p>

        {/* Warning Indicator Bars */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {Array.from({ length: maxViolations }).map((_, i) => (
            <div
              key={i}
              className={`h-2.5 flex-1 rounded-full transition-all duration-300 ${
                i < violations
                  ? "bg-red-500 shadow-md shadow-red-500/50"
                  : "bg-slate-800"
              }`}
            />
          ))}
        </div>

        {!isLocked ? (
          <button
            onClick={() => setShowWarningModal(false)}
            className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-semibold text-sm shadow-lg shadow-red-600/30 transition-all tap-press cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            I Understand & Resume Examination
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-red-400 font-medium animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
            Submitting and securing attempt record...
          </div>
        )}
      </div>
    </div>
  );
};

export default AntiCheatMonitor;
