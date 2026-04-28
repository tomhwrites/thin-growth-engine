import type { Archetype } from "@/utils/tweetConfig";
import type { WeeklyPlanSlot } from "@/types/weeklyPlanning";

export const FRESH_CONTEXT_ARCHETYPES = new Set<Archetype>([
  "Product Launch / Update",
  "Partner Game Announcement",
  "Partner Traction / Proof Point",
  "Signing Preannouncement",
]);

export const FRESH_CONTEXT_OR_RESEARCH_ARCHETYPES = new Set<Archetype>([
  "Macro trends / Regulation",
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasSpecificSignal(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 12) return false;
  return true;
}

export function requiresFreshWeeklyContext(slot: WeeklyPlanSlot) {
  if (FRESH_CONTEXT_OR_RESEARCH_ARCHETYPES.has(slot.archetype)) {
    return slot.draftMode !== "quick" && slot.draftMode !== "research";
  }
  return FRESH_CONTEXT_ARCHETYPES.has(slot.archetype);
}

export function hasFreshWeeklyContext(slot: WeeklyPlanSlot) {
  if (!requiresFreshWeeklyContext(slot)) return true;

  const archetype = normalize(slot.archetype);
  const scheduleLabel = normalize(slot.scheduleLabel);
  const genericLabels = new Set([archetype, ""]);

  return [
    slot.topic,
    slot.evidence,
    slot.additionalContext,
    genericLabels.has(scheduleLabel) ? "" : slot.scheduleLabel,
  ].some(hasSpecificSignal);
}

export function getFreshContextRequirement(slot: WeeklyPlanSlot) {
  if (!requiresFreshWeeklyContext(slot) || hasFreshWeeklyContext(slot)) return null;
  return "Needs fresh weekly context before drafting";
}

export function isWeeklySlotReadyForDraft(slot: WeeklyPlanSlot) {
  const isDraftable = Boolean(slot.topic.trim() || slot.scheduleLabel.trim());
  return isDraftable && hasFreshWeeklyContext(slot);
}
