"use client";

import Link from "next/link";
import { useState } from "react";
import { SiCodemagic } from "react-icons/si";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type SyncState = "idle" | "pulling" | "pushing" | "done" | "error";

export default function NavBar() {
  const router = useRouter();
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMessage, setSyncMessage] = useState<string>("");

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function syncDataPoints() {
    setSyncState("pulling");
    setSyncMessage("Pulling sheet → DB…");
    try {
      const res = await fetch("/api/sync/reconcile", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncState("error");
        setSyncMessage(data.error || "Sync failed");
        return;
      }
      const dp = data.pull?.data_points ?? {};
      const immu = data.pull?.immutable_facts ?? {};
      const pushed = data.push?.pushed ?? {};
      setSyncState("done");
      setSyncMessage(
        `Pulled: data_points ${dp.created ?? 0}+/${dp.updated ?? 0}~ · immutable_facts ${immu.created ?? 0}+/${immu.updated ?? 0}~. Pushed ${pushed.data_points ?? 0} + ${pushed.immutable_facts ?? 0}.`
      );
      setTimeout(() => setSyncState("idle"), 5000);
    } catch (err: any) {
      setSyncState("error");
      setSyncMessage(err?.message || "Sync failed");
    }
  }

  const isSyncing = syncState === "pulling" || syncState === "pushing";

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
        <div className="flex items-center gap-4">
          {syncState !== "idle" && (
            <span
              className={`text-xs ${
                syncState === "error"
                  ? "text-red-400"
                  : syncState === "done"
                    ? "text-green-400"
                    : "text-gray-400"
              } max-w-xs truncate`}
              title={syncMessage}
            >
              {syncMessage}
            </span>
          )}
          <button
            onClick={syncDataPoints}
            disabled={isSyncing}
            className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncing ? "Syncing…" : "Sync data points"}
          </button>
          <button
            onClick={signOut}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
