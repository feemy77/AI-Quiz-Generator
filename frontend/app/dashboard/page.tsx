"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token) {
      router.replace("/");
    } else if (role === "teacher" || role === "admin") {
      router.replace("/teacher-dashboard");
    } else if (role === "student") {
      router.replace("/student-dashboard");
    } else {
      router.replace("/setup");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-medium">
      Redirecting to your workspace...
    </div>
  );
}