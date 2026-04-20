"use client";

import { useMemo, useState } from "react";
import { RiAiGenerate } from "react-icons/ri";
import { tweetStyles } from "@/utils/tweetConfig";
import {
  ARCHETYPE_DEFAULTS,
  buildDefaultBauWeeklyPlanSlots,
  buildDefaultWeeklyPlanSlots,
  type WeeklyInput,
  type WeeklyPlanningMode,
  type WeeklyPlanSlot,
  type WeeklySlotDraft,
  type WeeklySynthesis,
  WEEKLY_ARCHETYPE_OPTIONS,
  WEEKLY_DRAFT_MODE_OPTIONS,
} from "@/types/weeklyPlanning";

type PlannerRequestStage = "synthesize" | "plan" | "draft_slot";
type PlannerStage = "plan" | "draft_slot" | "draft_all" | null;
type ScheduleViewMode = "timeline" | "list";
type BulkDraftProgress = {
  current: number;
  total: number;
  slotId: string;
  label: string;
};

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function isDraftableWeeklySlot(slot: WeeklyPlanSlot) {
  return Boolean(slot.topic.trim() || slot.scheduleLabel.trim());
}

function getWeeklySlotDraftLabel(slot: WeeklyPlanSlot) {
  return slot.topic.trim() || slot.scheduleLabel.trim() || slot.archetype;
}

function WeeklyPlanner() {
  const [weekOf] = useState(getTodayDateString);
  const [weeklyContextDump, setWeeklyContextDump] = useState("");
  const [slots, setSlots] = useState<WeeklyPlanSlot[]>(buildDefaultWeeklyPlanSlots);
  const [planningMode, setPlanningMode] =
    useState<WeeklyPlanningMode>("default_slots");
  const [synthesis, setSynthesis] = useState<WeeklySynthesis | null>(null);
  const [draftsBySlotId, setDraftsBySlotId] = useState<
    Record<string, WeeklySlotDraft>
  >({});
  const [plannerStage, setPlannerStage] = useState<PlannerStage>(null);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [scheduleView, setScheduleView] = useState<ScheduleViewMode>("timeline");
  const [draftingSlotId, setDraftingSlotId] = useState<string | null>(null);
  const [bulkDraftProgress, setBulkDraftProgress] =
    useState<BulkDraftProgress | null>(null);

  const weeklyInput = useMemo<WeeklyInput>(
    () => ({
      weekOf,
      weeklyContextDump: weeklyContextDump.trim(),
    }),
    [weekOf, weeklyContextDump]
  );

  const plannedSlots = useMemo(
    () =>
      slots.filter(
        (slot) =>
          slot.topic.trim().length > 0 || slot.scheduleLabel.trim().length > 0
      ),
    [slots]
  );

  const scheduleDayGroups = useMemo(() => {
    const groups = new Map<string, WeeklyPlanSlot[]>();

    plannedSlots.forEach((slot) => {
      const key = slot.day.trim() || "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(slot);
    });

    return Array.from(groups.entries()).map(([day, daySlots]) => ({
      day,
      slots: daySlots,
    }));
  }, [plannedSlots]);

  const scheduleListItems = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; count: number; slots: WeeklyPlanSlot[] }
    >();

    plannedSlots.forEach((slot) => {
      const label =
        slot.scheduleLabel.trim() ||
        slot.topic.trim() ||
        `Slot ${slot.slotNumber}`;
      const current = groups.get(label) || { label, count: 0, slots: [] };
      current.count += 1;
      current.slots.push(slot);
      groups.set(label, current);
    });

    return Array.from(groups.values());
  }, [plannedSlots]);

  const repeatedFocusItem = useMemo(
    () => scheduleListItems.find((item) => item.count >= 2),
    [scheduleListItems]
  );

  const draftableSlots = useMemo(
    () => slots.filter(isDraftableWeeklySlot),
    [slots]
  );

  const requestWeeklyPlanner = async <T,>(
    stage: PlannerRequestStage,
    payload: Record<string, unknown>
  ): Promise<T> => {
    const response = await fetch("/api/weekly-planner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage,
        weeklyInput,
        ...payload,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Weekly planner ${stage} failed`);
    }

    return data as T;
  };

  const ensureSynthesis = async () => {
    if (planningMode === "default_slots" || !weeklyInput.weeklyContextDump) {
      const emptySynthesis = { evidenceBank: [], narratives: [] } satisfies WeeklySynthesis;
      setSynthesis(emptySynthesis);
      return emptySynthesis;
    }

    if (synthesis) return synthesis;

    const synthesisData = await requestWeeklyPlanner<{
      synthesis: WeeklySynthesis;
    }>("synthesize", {});
    setSynthesis(synthesisData.synthesis);
    return synthesisData.synthesis;
  };

  const handleSuggestSchedule = async () => {
    if (planningMode === "default_slots" || !weeklyInput.weeklyContextDump) {
      setSlots(buildDefaultBauWeeklyPlanSlots());
      setSynthesis(null);
      setDraftsBySlotId({});
      setPlannerError(null);
      setScheduleView("timeline");
      setDraftingSlotId(null);
      setBulkDraftProgress(null);
      return;
    }

    setPlannerStage("plan");
    setPlannerError(null);

    try {
      const synthesisToUse = await ensureSynthesis();
      const planData = await requestWeeklyPlanner<{ slots: WeeklyPlanSlot[] }>(
        "plan",
        { synthesis: synthesisToUse }
      );

      setSlots((currentSlots) =>
        planData.slots.map((slot, index) => {
          const currentSlot = currentSlots[index];
          const currentDefaultGoal = currentSlot
            ? ARCHETYPE_DEFAULTS[currentSlot.archetype].goal
            : "";

          return {
            ...slot,
            day: currentSlot?.day || slot.day,
            goal:
              currentSlot && currentSlot.goal !== currentDefaultGoal
                ? currentSlot.goal
                : slot.goal,
            additionalContext: currentSlot?.additionalContext || "",
            draftMode: currentSlot?.draftMode || slot.draftMode,
            status: currentSlot?.status || slot.status,
          };
        })
      );
      setDraftsBySlotId({});
      setScheduleView("timeline");
      setDraftingSlotId(null);
      setBulkDraftProgress(null);
    } catch (error: any) {
      setPlannerError(error.message || "Failed to suggest the weekly schedule.");
    } finally {
      setPlannerStage(null);
    }
  };

  const updateSlot = <K extends keyof WeeklyPlanSlot>(
    slotId: string,
    field: K,
    value: WeeklyPlanSlot[K]
  ) => {
    setSlots((currentSlots) =>
      currentSlots.map((slot) => {
        if (slot.id !== slotId) return slot;

        if (field === "archetype") {
          const nextArchetype = value as WeeklyPlanSlot["archetype"];
          const defaults = ARCHETYPE_DEFAULTS[nextArchetype];
          return {
            ...slot,
            archetype: nextArchetype,
            goal:
              slot.goal === ARCHETYPE_DEFAULTS[slot.archetype].goal
                ? defaults.goal
                : slot.goal,
            tweetStyle:
              slot.tweetStyle === ARCHETYPE_DEFAULTS[slot.archetype].tweetStyle
                ? defaults.tweetStyle
                : slot.tweetStyle,
          };
        }

        if (field === "topic") {
          const nextTopic = String(value);
          const shouldSyncScheduleLabel =
            !slot.scheduleLabel.trim() ||
            slot.scheduleLabel.trim() === slot.topic.trim() ||
            slot.scheduleLabel.trim() === slot.archetype;

          return {
            ...slot,
            topic: nextTopic,
            scheduleLabel: shouldSyncScheduleLabel
              ? nextTopic.trim()
              : slot.scheduleLabel,
          };
        }

        return { ...slot, [field]: value };
      })
    );
  };

  const handleResetPlanner = () => {
    setSlots(buildDefaultWeeklyPlanSlots());
    setSynthesis(null);
    setDraftsBySlotId({});
    setPlannerError(null);
    setScheduleView("timeline");
    setDraftingSlotId(null);
    setBulkDraftProgress(null);
  };

  const mergeDrafts = (incomingDrafts: WeeklySlotDraft[]) => {
    setDraftsBySlotId((current) => {
      const next = { ...current };
      incomingDrafts.forEach((draft) => {
        next[draft.slotId] = draft;
      });
      return next;
    });
  };

  const updateSlotStatusesForDrafts = (draftSlotIds: string[]) => {
    const draftSlotIdSet = new Set(draftSlotIds);
    setSlots((currentSlots) =>
      currentSlots.map((slot) => {
        if (!draftSlotIdSet.has(slot.id)) return slot;
        if (slot.status === "approved" || slot.status === "scheduled") return slot;
        return { ...slot, status: "drafted" };
      })
    );
  };

  const requestSlotDraft = async (
    slotId: string,
    synthesisToUse: WeeklySynthesis,
    slotsToUse: WeeklyPlanSlot[]
  ) => {
    const data = await requestWeeklyPlanner<{ draft: WeeklySlotDraft }>(
      "draft_slot",
      {
        synthesis: synthesisToUse,
        slots: slotsToUse,
        slotId,
      }
    );

    mergeDrafts([data.draft]);
    updateSlotStatusesForDrafts([data.draft.slotId]);
    return data.draft;
  };

  const handleDraftSlot = async (slotId: string) => {
    const slot = slots.find((item) => item.id === slotId);
    if (!slot || !isDraftableWeeklySlot(slot)) return;

    setPlannerStage("draft_slot");
    setDraftingSlotId(slotId);
    setPlannerError(null);
    setBulkDraftProgress(null);

    try {
      const synthesisToUse = await ensureSynthesis();
      await requestSlotDraft(slotId, synthesisToUse, slots);
    } catch (error: any) {
      setPlannerError(error.message || "Failed to draft this slot.");
    } finally {
      setPlannerStage(null);
      setDraftingSlotId(null);
    }
  };

  const handleDraftAllSlots = async () => {
    if (draftableSlots.length === 0) return;

    const slotsSnapshot = slots.map((slot) => ({ ...slot }));
    let activeSlot: WeeklyPlanSlot | null = null;

    setPlannerStage("draft_all");
    setPlannerError(null);

    try {
      const synthesisToUse = await ensureSynthesis();

      for (let index = 0; index < draftableSlots.length; index += 1) {
        const slot = draftableSlots[index];
        activeSlot = slot;
        setDraftingSlotId(slot.id);
        setBulkDraftProgress({
          current: index + 1,
          total: draftableSlots.length,
          slotId: slot.id,
          label: getWeeklySlotDraftLabel(slot),
        });

        await requestSlotDraft(slot.id, synthesisToUse, slotsSnapshot);
      }
    } catch (error: any) {
      const message = error.message || "Failed to draft all slots.";
      setPlannerError(
        activeSlot
          ? `Failed while drafting slot ${activeSlot.slotNumber}: ${message}`
          : message
      );
    } finally {
      setPlannerStage(null);
      setDraftingSlotId(null);
      setBulkDraftProgress(null);
    }
  };

  const handleCopyDraft = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const styleOptions = Object.entries(tweetStyles).map(([id, style]) => ({
    value: id,
    label: style.name,
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <RiAiGenerate className="h-5 w-5 text-purple-300" />
          <h3 className="text-lg font-semibold text-white">Weekly Brief</h3>
        </div>

        <p className="text-sm text-gray-400">
          Dump the week in once, then let the planner suggest a full schedule with
          three tweet slots per weekday and one fresh repeated focus if there is a
          genuinely new development to talk about.
        </p>

        <div className="flex flex-wrap gap-2">
          <ModeToggleButton
            active={planningMode === "default_slots"}
            label="Default Slots"
            onClick={() => {
              setPlanningMode("default_slots");
              setPlannerError(null);
              setSynthesis(null);
            }}
          />
          <ModeToggleButton
            active={planningMode === "new_context"}
            label="New Context"
            onClick={() => {
              setPlanningMode("new_context");
              setPlannerError(null);
              setSynthesis(null);
            }}
          />
        </div>

        {planningMode === "new_context" ? (
          <Field label="Weekly Context Dump">
            <textarea
              value={weeklyContextDump}
              onChange={(event) => setWeeklyContextDump(event.target.value)}
              placeholder="Paste the raw weekly context here: launches, milestones, market shifts, partner wins, policy changes, ecosystem traction, founder takes, and anything genuinely new."
              className="min-h-[220px] w-full rounded-xl border border-gray-600 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-purple-500"
            />
          </Field>
        ) : (
          <div className="rounded-xl border border-gray-700 bg-black/10 px-4 py-3 text-sm text-gray-300">
            Default Slots uses the same BAU weekly schedule every time and skips
            weekly-context planning calls.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSuggestSchedule}
            disabled={plannerStage !== null}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
          >
            {plannerStage === "plan"
              ? "Suggesting..."
              : planningMode === "default_slots"
                ? "Use Default Weekly Schedule"
                : "Suggest Weekly Schedule"}
          </button>
          <button
            onClick={handleResetPlanner}
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-400 hover:text-white"
          >
            Reset Planner
          </button>
        </div>

        {plannerError && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {plannerError}
          </div>
        )}

      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Weekly Schedule</h3>
          <p className="text-sm text-gray-400">
            Review the proposed Monday-to-Friday schedule as either a compact
            time-slot plan or a grouped list of themes.
          </p>
        </div>

          <div className="flex flex-wrap items-center gap-2">
            <ScheduleToggleButton
              active={scheduleView === "timeline"}
              label="Time Slot View"
              onClick={() => setScheduleView("timeline")}
            />
            <ScheduleToggleButton
              active={scheduleView === "list"}
              label="Dotpoint List"
              onClick={() => setScheduleView("list")}
            />
          </div>
        </div>

        {repeatedFocusItem && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Repeated focus detected: {repeatedFocusItem.label} is scheduled for{" "}
            {repeatedFocusItem.count} slots.
          </div>
        )}

        {plannedSlots.length > 0 ? (
          scheduleView === "timeline" ? (
            <WeeklyTimelineView dayGroups={scheduleDayGroups} />
          ) : (
            <WeeklyListView items={scheduleListItems} />
          )
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-700 bg-black/10 px-4 py-8 text-sm text-gray-400">
            Suggest the weekly schedule to see all planned slots together here.
          </div>
        )}
      </div>

      {plannedSlots.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Slot Drafting Setup</h3>
              <p className="text-sm text-gray-400">
                For each slot, add any extra context you want to force in, then
                choose whether to draft with the 6-stage research agent or the
                internal-data path.
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Draft All runs each slot one-by-one so every tweet gets its own
                full drafting and review pass before the planner moves on.
              </p>
            </div>

            <button
              onClick={handleDraftAllSlots}
              disabled={plannerStage !== null || draftableSlots.length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {plannerStage === "draft_all"
                ? bulkDraftProgress
                  ? `Drafting ${bulkDraftProgress.current}/${bulkDraftProgress.total}...`
                  : "Drafting..."
                : `${Object.keys(draftsBySlotId).length > 0 ? "Redraft" : "Draft"} All ${draftableSlots.length} Tweets`}
            </button>
          </div>

          {bulkDraftProgress && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Drafting slot {bulkDraftProgress.current} of {bulkDraftProgress.total}:{" "}
              {bulkDraftProgress.label}
            </div>
          )}

          <div className="space-y-4">
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="rounded-2xl border border-gray-700 bg-black/10 p-4"
              >
                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-purple-300">
                      Slot {slot.slotNumber} · {slot.day}
                    </div>
                    <h4 className="text-base font-semibold text-white">
                      {slot.scheduleLabel || slot.topic || "Untitled slot"}
                    </h4>
                    {slot.scheduleLabel.trim() &&
                      slot.topic.trim() &&
                      slot.scheduleLabel.trim() !== slot.topic.trim() && (
                        <p className="mt-1 text-sm text-gray-400">{slot.topic}</p>
                      )}
                  </div>

                  <button
                    onClick={() => handleDraftSlot(slot.id)}
                    disabled={plannerStage !== null || !isDraftableWeeklySlot(slot)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                  >
                    {(plannerStage === "draft_slot" || plannerStage === "draft_all") &&
                    draftingSlotId === slot.id
                      ? "Drafting..."
                      : "Draft This Slot"}
                  </button>
                </div>

                <div className="grid gap-3 xl:grid-cols-6">
                  <Field label="Day">
                    <input
                      value={slot.day}
                      onChange={(event) =>
                        updateSlot(slot.id, "day", event.target.value)
                      }
                      className="w-full rounded-lg border border-gray-600 bg-white/10 px-3 py-2 text-white outline-none focus:border-purple-500"
                    />
                  </Field>
                  <Field label="Schedule Label">
                    <input
                      value={slot.scheduleLabel}
                      onChange={(event) =>
                        updateSlot(slot.id, "scheduleLabel", event.target.value)
                      }
                      className="w-full rounded-lg border border-gray-600 bg-white/10 px-3 py-2 text-white outline-none focus:border-purple-500"
                    />
                  </Field>
                  <Field label="Archetype">
                    <select
                      value={slot.archetype}
                      onChange={(event) =>
                        updateSlot(
                          slot.id,
                          "archetype",
                          event.target.value as WeeklyPlanSlot["archetype"]
                        )
                      }
                      className="w-full rounded-lg border border-gray-600 bg-white/10 px-3 py-2 text-white outline-none focus:border-purple-500"
                    >
                      {WEEKLY_ARCHETYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value} className="bg-gray-900">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Form">
                    <select
                      value={slot.tweetStyle}
                      onChange={(event) =>
                        updateSlot(slot.id, "tweetStyle", event.target.value)
                      }
                      className="w-full rounded-lg border border-gray-600 bg-white/10 px-3 py-2 text-white outline-none focus:border-purple-500"
                    >
                      {styleOptions.map((option) => (
                        <option key={option.value} value={option.value} className="bg-gray-900">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Draft Method">
                    <select
                      value={slot.draftMode}
                      onChange={(event) =>
                        updateSlot(
                          slot.id,
                          "draftMode",
                          event.target.value as WeeklyPlanSlot["draftMode"]
                        )
                      }
                      className="w-full rounded-lg border border-gray-600 bg-white/10 px-3 py-2 text-white outline-none focus:border-purple-500"
                    >
                      {WEEKLY_DRAFT_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value} className="bg-gray-900">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="mt-3">
                  <Field label="Topic">
                    <textarea
                      value={slot.topic}
                      onChange={(event) =>
                        updateSlot(slot.id, "topic", event.target.value)
                      }
                      placeholder="What does this tweet need to be about?"
                      className="min-h-[96px] w-full rounded-lg border border-gray-600 bg-white/10 px-3 py-2 text-white outline-none placeholder:text-gray-500 focus:border-purple-500"
                    />
                  </Field>
                </div>

                <div className="mt-3">
                  <Field label="Evidence / Source Notes">
                    <textarea
                      value={slot.evidence}
                      onChange={(event) =>
                        updateSlot(slot.id, "evidence", event.target.value)
                      }
                      placeholder={ARCHETYPE_DEFAULTS[slot.archetype].evidencePrompt}
                      className="min-h-[96px] w-full rounded-lg border border-gray-600 bg-white/10 px-3 py-2 text-white outline-none placeholder:text-gray-500 focus:border-purple-500"
                    />
                  </Field>
                </div>

                {draftsBySlotId[slot.id] && (
                  <div className="mt-4 rounded-2xl border border-purple-500/30 bg-purple-900/10 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-sm font-semibold text-white">Current Draft</h5>
                      <button
                        onClick={() => handleCopyDraft(draftsBySlotId[slot.id].primaryDraft)}
                        className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-gray-400 hover:text-white"
                      >
                        Copy Primary
                      </button>
                    </div>
                    <p className="mt-3 whitespace-pre-line text-sm text-white">
                      {draftsBySlotId[slot.id].primaryDraft}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(draftsBySlotId).length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Draft Studio</h3>
            <p className="text-sm text-gray-400">
              Review the generated copy across the week and compare the primary
              and alternate versions for each slot.
            </p>
          </div>

          <div className="space-y-4">
            {slots
              .filter((slot) => draftsBySlotId[slot.id])
              .map((slot) => {
                const draft = draftsBySlotId[slot.id];

                return (
                  <div
                    key={`draft-${slot.id}`}
                    className="rounded-2xl border border-gray-700 bg-black/10 p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-purple-300">
                          Slot {slot.slotNumber} · {slot.day}
                        </div>
                        <h4 className="text-base font-semibold text-white">
                          {getWeeklySlotDraftLabel(slot)}
                        </h4>
                      </div>
                      <button
                        onClick={() => handleDraftSlot(slot.id)}
                        disabled={plannerStage !== null}
                        className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-gray-400 hover:text-white disabled:opacity-50"
                      >
                        {(plannerStage === "draft_slot" || plannerStage === "draft_all") &&
                        draftingSlotId === slot.id
                          ? "Drafting..."
                          : "Regenerate Slot"}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <DraftVariantCard
                        title="Primary Draft"
                        tweet={draft.primaryDraft}
                        onCopy={handleCopyDraft}
                      />
                      <DraftVariantCard
                        title="Alternate Draft"
                        tweet={draft.alternateDraft}
                        onCopy={handleCopyDraft}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleToggleButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-purple-600 text-white"
          : "border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function ModeToggleButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-purple-600 text-white"
          : "border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function WeeklyTimelineView({
  dayGroups,
}: {
  dayGroups: { day: string; slots: WeeklyPlanSlot[] }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
      {dayGroups.map((group) => (
        <div
          key={group.day}
          className="rounded-2xl border border-gray-700 bg-black/10 p-3"
        >
          <div className="border-b border-gray-700 pb-2">
            <p className="text-sm font-semibold text-white">{group.day}</p>
            <p className="text-xs text-gray-500">{group.slots.length} slots</p>
          </div>

          <div className="mt-3 space-y-3">
            {group.slots.map((slot) => (
              <div
                key={slot.id}
                className="rounded-xl border border-gray-700 bg-white/5 p-3"
              >
                <div className="text-[11px] uppercase tracking-wide text-purple-300">
                  Slot {slot.slotNumber}
                </div>
                <p className="mt-1 text-sm font-medium text-white">
                  {slot.scheduleLabel || slot.archetype}
                </p>
                {slot.scheduleLabel.trim() &&
                  slot.scheduleLabel.trim() !== slot.archetype && (
                    <p className="mt-1 text-xs text-gray-400">
                      {slot.archetype}
                    </p>
                  )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WeeklyListView({
  items,
}: {
  items: { label: string; count: number; slots: WeeklyPlanSlot[] }[];
}) {
  return (
    <div className="rounded-2xl border border-gray-700 bg-black/10 p-4">
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-2 rounded-xl border border-gray-700 bg-white/5 px-4 py-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="text-sm text-white">
              <span className="font-semibold">x{item.count}</span> {item.label}
            </div>
            <div className="flex flex-wrap gap-2">
              {item.slots.map((slot) => (
                <span
                  key={slot.id}
                  className="rounded-full border border-gray-600 px-2 py-1 text-[11px] text-gray-300"
                >
                  Slot {slot.slotNumber} · {slot.archetype}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DraftVariantCard({
  title,
  tweet,
  onCopy,
}: {
  title: string;
  tweet: string;
  onCopy: (text: string) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-gray-400">{title}</p>
        <button
          onClick={() => onCopy(tweet)}
          className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-gray-400 hover:text-white"
        >
          Copy
        </button>
      </div>
      <p className="mt-3 whitespace-pre-line text-sm text-white">{tweet}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium text-gray-300">{label}</span>
      {children}
    </label>
  );
}

export default WeeklyPlanner;
