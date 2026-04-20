import { NextRequest, NextResponse } from "next/server";
import { runSkill } from "@/harness/loop";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { skill, args } = body ?? {};
    if (typeof skill !== "string" || !skill) {
      return NextResponse.json({ error: "Missing 'skill' (string)" }, { status: 400 });
    }
    const output = await runSkill(skill, args ?? {});
    return NextResponse.json({ skill, output });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
