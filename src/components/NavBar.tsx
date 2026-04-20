"use client";

import Link from "next/link";
import { SiCodemagic } from "react-icons/si";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function NavBar() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-black shadow-md">
      <div className="container mx-auto px-4 py-5 flex justify-between items-center">
        <div className="flex items-center">
          <Link
            href="/"
            className="mr-16 flex items-center text-xl font-bold text-white"
          >
            <SiCodemagic className="mr-2 h-8 w-8" />
            Growth Engine
          </Link>
          <div className="hidden md:flex space-x-8">
            <Link
              href="/"
              className="rounded-3xl px-4 py-2 text-gray-300 hover:bg-white/10 hover:text-white"
            >
              Tweet Engine
            </Link>
          </div>
        </div>
        <button
          onClick={signOut}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
