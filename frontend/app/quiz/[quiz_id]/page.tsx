import { Suspense } from "react";
import TakeQuizClient from "./TakeQuizClient";

// Static export params (generates slots for mobile APK export)
export async function generateStaticParams() {
  const params = [];
  for (let i = 1; i <= 1000; i++) {
    params.push({ quiz_id: i.toString() });
  }
  return params;
}

export const dynamicParams = false;

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-bold">Loading Quiz Environment...</div>}>
      <TakeQuizClient />
    </Suspense>
  );
}