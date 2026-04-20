"use client";

import { createClient } from "@/lib/supabase/client";
import { SiCodemagic } from "react-icons/si";
import { FcGoogle } from "react-icons/fc";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-8 p-10 rounded-2xl border border-white/10 bg-white/5 w-full max-w-sm">
        <div className="flex items-center gap-3 text-white">
          <SiCodemagic className="h-10 w-10" />
          <span className="text-2xl font-bold">Growth Engine</span>
        </div>

        <p className="text-gray-400 text-sm text-center">
          Sign in to access your growth platform
        </p>

        {error === "unauthorized" && (
          <p className="text-red-400 text-sm text-center bg-red-400/10 px-4 py-2 rounded-lg">
            This Google account is not authorized.
          </p>
        )}

        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-3 w-full justify-center px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-gray-100 transition-colors"
        >
          <FcGoogle className="h-5 w-5" />
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
