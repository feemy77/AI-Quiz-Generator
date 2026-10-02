import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  sendPasswordResetEmail,
  User as FirebaseUser,
  Auth
} from "firebase/auth";

// Firebase credentials loaded from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey.length > 5 &&
    firebaseConfig.projectId
  );
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

if (typeof window !== "undefined" && isFirebaseConfigured()) {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
  } catch (err) {
    console.warn("Failed to initialize Firebase:", err);
  }
}

export { app, auth };

export const googleProvider = new GoogleAuthProvider();

export async function loginWithGoogle(): Promise<{ success: boolean; user?: FirebaseUser; error?: string }> {
  if (!isFirebaseConfigured() || !auth) {
    return {
      success: false,
      error: "Firebase credentials not configured yet. Please configure your NEXT_PUBLIC_FIREBASE_* keys."
    };
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return {
      success: true,
      user: result.user
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Google Sign-in failed."
    };
  }
}

export async function sendFirebasePasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  if (!isFirebaseConfigured() || !auth) {
    return {
      success: false,
      error: "Firebase credentials not configured yet."
    };
  }

  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (error: any) {
    let msg = error?.message || "Failed to send password reset email.";
    if (error?.code === "auth/user-not-found") {
      msg = "No registered user found with this email address.";
    } else if (error?.code === "auth/invalid-email") {
      msg = "Please enter a valid email address.";
    }
    return {
      success: false,
      error: msg
    };
  }
}

export async function logoutFirebase(): Promise<void> {
  if (auth) {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.error("Firebase signout error:", e);
    }
  }
}
