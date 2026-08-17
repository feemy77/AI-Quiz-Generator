import { Suspense } from "react";
import TakeQuizClient from "./TakeQuizClient";

// 🛠️ REQUIRED FOR NEXT.JS STATIC EXPORT (BUILD FIX)
export async function generateStaticParams() {
  // Yeh trick 1 se lekar 1000 tak dummy IDs pre-generate kar dega 
  // taake aapki app mobile par crash na ho!
  const params = [];
  for (let i = 1; i <= 1000; i++) {
    params.push({ quiz_id: i.toString() });
  }
  return params;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-bold">Loading Quiz Environment...</div>}>
      <TakeQuizClient />
    </Suspense>
  );
}