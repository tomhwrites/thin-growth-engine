import { NextResponse } from "next/server";
import {
  runWeeklyBulkDraft,
  runWeeklyPlan,
  runWeeklySlotDraft,
  runWeeklySynthesis,
} from "@/workflows/weeklyPlanner";
import type {
  WeeklyInput,
  WeeklyPlanSlot,
  WeeklySlotDraft,
  WeeklySynthesis,
} from "@/types/weeklyPlanning";

type WeeklyPlannerStage = "synthesize" | "plan" | "draft_slot" | "draft_all";

interface WeeklyPlannerRequest {
  stage: WeeklyPlannerStage;
  weeklyInput: WeeklyInput;
  synthesis?: WeeklySynthesis;
  slots?: WeeklyPlanSlot[];
  slotId?: string;
}

function normalizeWeeklyInput(input?: WeeklyInput): WeeklyInput | null {
  if (!input) return null;

  return {
    weekOf: String(input.weekOf ?? "").trim(),
    weeklyContextDump: String(input.weeklyContextDump ?? "").trim(),
  };
}

function validateWeeklyInput(input?: WeeklyInput | null) {
  if (!input) return "Weekly input is required";
  if (!input.weekOf) return "Week of date is required";
  return null;
}

function normalizeSlots(value: unknown): WeeklyPlanSlot[] {
  return Array.isArray(value) ? (value as WeeklyPlanSlot[]) : [];
}

function isWeeklySlotDraftable(slot: WeeklyPlanSlot): boolean {
  return Boolean(slot.topic.trim() || slot.scheduleLabel.trim());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WeeklyPlannerRequest;
    const weeklyInput = normalizeWeeklyInput(body.weeklyInput);
    const validationError = validateWeeklyInput(weeklyInput);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    switch (body.stage) {
      case "synthesize": {
        const synthesis = await runWeeklySynthesis(weeklyInput!);
        return NextResponse.json({ synthesis });
      }

      case "plan": {
        if (!body.synthesis) {
          return NextResponse.json(
            { error: "Synthesis is required for planning" },
            { status: 400 }
          );
        }

        const slots = await runWeeklyPlan(weeklyInput!, body.synthesis);
        return NextResponse.json({ slots });
      }

      case "draft_slot": {
        if (!body.synthesis) {
          return NextResponse.json(
            { error: "Synthesis is required for slot drafting" },
            { status: 400 }
          );
        }

        const slots = normalizeSlots(body.slots);
        const slot = slots.find((item) => item.id === body.slotId);

        if (!slot) {
          return NextResponse.json(
            { error: "A valid slot is required for slot drafting" },
            { status: 400 }
          );
        }

        if (!isWeeklySlotDraftable(slot)) {
          return NextResponse.json(
            { error: "Add a schedule label or topic to the slot before drafting it" },
            { status: 400 }
          );
        }

        const draft = await runWeeklySlotDraft(body.synthesis, slot);

        return NextResponse.json({ draft });
      }

      case "draft_all": {
        if (!body.synthesis) {
          return NextResponse.json(
            { error: "Synthesis is required for bulk drafting" },
            { status: 400 }
          );
        }

        const slots = normalizeSlots(body.slots);
        if (!slots.some(isWeeklySlotDraftable)) {
          return NextResponse.json(
            {
              error:
                "At least one slot with a schedule label or topic is required for bulk drafting",
            },
            { status: 400 }
          );
        }

        const drafts: WeeklySlotDraft[] = await runWeeklyBulkDraft(body.synthesis, slots);

        return NextResponse.json({ drafts });
      }

      default:
        return NextResponse.json(
          { error: `Unknown stage: ${body.stage}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("[Weekly Planner] Error:", error?.message || error);
    return NextResponse.json(
      { error: `Weekly planner failed: ${error?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
