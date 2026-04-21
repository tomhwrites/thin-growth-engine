"use client";

import Link from "next/link";
import { useState } from "react";
import { SiCodemagic } from "react-icons/si";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type SyncState = "idle" | "pulling" | "pushing" | "done" | "error";

async function readApiPayload(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return await res.json();
  }

  const text = await res.text();
  const isHtml = /^\s*</.test(text);
  if (res.redirected || isHtml) {
    throw new Error("Your session may have expired. Refresh the page or sign in again.");
  }

  throw new Error("The server returned an unexpected response.");
}

export default function NavBar() {
  const router = useRouter();
  const [reconcileState, setReconcileState] = useState<SyncState>("idle");
  const [reconcileMessage, setReconcileMessage] = useState<string>("");
  const [pushState, setPushState] = useState<SyncState>("idle");
  const [pushMessage, setPushMessage] = useState<string>("");

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function reconcileSheets() {
    setReconcileState("pulling");
    setReconcileMessage("Pulling sheet → DB…");
    try {
      const res = await fetch("/api/sync/reconcile", { method: "POST" });
      const data = await readApiPayload(res);
      if (!res.ok) {
        setReconcileState("error");
        setReconcileMessage(data.error || "Sync failed");
        return;
      }
      const dp = data.pull?.data_points ?? {};
      const immu = data.pull?.immutable_facts ?? {};
      const pushed = data.push?.pushed ?? {};
      setReconcileState("done");
      setReconcileMessage(
        `Pulled: data_points ${dp.created ?? 0}+/${dp.updated ?? 0}~ · immutable_facts ${immu.created ?? 0}+/${immu.updated ?? 0}~. Pushed ${pushed.data_points ?? 0} + ${pushed.immutable_facts ?? 0}.`
      );
      setTimeout(() => setReconcileState("idle"), 5000);
    } catch (err: any) {
      setReconcileState("error");
      setReconcileMessage(err?.message || "Sync failed");
    }
  }

  async function pushResearchToSheet() {
    setPushState("pushing");
    setPushMessage("Pushing DB → sheet…");
    try {
      const res = await fetch("/api/sync/push", { method: "POST" });
      const data = await readApiPayload(res);
      if (!res.ok) {
        setPushState("error");
        setPushMessage(data.error || "Push failed");
        return;
      }

      const pushed = data.pushed ?? {};
      setPushState("done");
      setPushMessage(
        `Pushed ${pushed.data_points ?? 0} data points and ${pushed.immutable_facts ?? 0} immutable facts to Google Sheets.`
      );
      setTimeout(() => setPushState("idle"), 5000);
    } catch (err: any) {
      setPushState("error");
      setPushMessage(err?.message || "Push failed");
    }
  }

  const isReconciling =
    reconcileState === "pulling" || reconcileState === "pushing";
  const isPushing = pushState === "pulling" || pushState === "pushing";

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
          {reconcileState !== "idle" && (
            <span
              className={`text-xs ${
                reconcileState === "error"
                  ? "text-red-400"
                  : reconcileState === "done"
                    ? "text-green-400"
                    : "text-gray-400"
              } max-w-xs truncate`}
              title={reconcileMessage}
            >
              {reconcileMessage}
            </span>
          )}
          {pushState !== "idle" && (
            <span
              className={`text-xs ${
                pushState === "error"
                  ? "text-red-400"
                  : pushState === "done"
                    ? "text-green-400"
                    : "text-gray-400"
              } max-w-xs truncate`}
              title={pushMessage}
            >
              {pushMessage}
            </span>
          )}
          <button
            onClick={pushResearchToSheet}
            disabled={isReconciling || isPushing}
            className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPushing ? "Pushing…" : "Push research to sheet"}
          </button>
          <button
            onClick={reconcileSheets}
            disabled={isReconciling || isPushing}
            className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReconciling ? "Reconciling…" : "Reconcile sheet edits"}
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
