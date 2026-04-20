// app/components/TweetGenerator.tsx
"use client";

import React, { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { RiAiGenerate } from "react-icons/ri";
import { HiOutlineDatabase } from "react-icons/hi";
import { BsRobot } from "react-icons/bs";
import { GenerateTweetsRequest } from "@/utils/generateFromOpenAI";
import BespokeAgentWorkbench from "@/components/BespokeAgentWorkbench";
import WeeklyPlanner from "@/components/WeeklyPlanner";
import {
  archetypeOptions,
  hookTypeOptions,
  ANY_ARCHETYPE,
  tweetStyles,
} from "@/utils/tweetConfig";
import type {
  Belief,
  EvidenceNeed,
  EvidencePoint,
  HookOutput,
  NarrativeOutput,
  ResearchFinding,
  ResearchResult,
  SupportingDatum,
} from "@/types/researchPipeline";

type TweetGeneratorProps = {
  tweets: string[];
  setTweets: (tweets: string[]) => void;
};

export type Metric = {
  id: string;
  name: string;
  selected: boolean;
};

type DataSource = "internal" | "quick" | "deep";
type PlannerMode = "single" | "weekly" | "bespoke";

type StageKey = "belief" | "evidence" | "research" | "narrative" | "hook" | "draft";

interface PipelineState {
  beliefs: Belief[] | null;
  evidenceNeeds: EvidenceNeed[] | null;
  research: ResearchResult[] | null;
  narrative: NarrativeOutput | null;
  hooks: HookOutput | null;
  tweets: string[] | null;
}

const STAGES: { key: StageKey; label: string }[] = [
  { key: "belief", label: "Beliefs" },
  { key: "evidence", label: "Evidence Needs" },
  { key: "research", label: "Research Findings" },
  { key: "narrative", label: "Narrative" },
  { key: "hook", label: "Hooks" },
  { key: "draft", label: "Tweet Drafts" },
];

// Which pipeline fields each stage produces
const STAGE_OUTPUT_KEY: Record<StageKey, keyof PipelineState> = {
  belief: "beliefs",
  evidence: "evidenceNeeds",
  research: "research",
  narrative: "narrative",
  hook: "hooks",
  draft: "tweets",
};

const EMPTY_PIPELINE: PipelineState = {
  beliefs: null,
  evidenceNeeds: null,
  research: null,
  narrative: null,
  hooks: null,
  tweets: null,
};

// ---------- Tweet styles ----------

const tweetStyleOptions = Object.entries(tweetStyles).map(([id, style]) => ({
  id,
  name: style.name,
  description: style.description,
}));

// ---------- Component ----------

const TweetGenerator = (props: TweetGeneratorProps) => {
  const { tweets, setTweets } = props;
  const [plannerMode, setPlannerMode] = useState<PlannerMode>("single");
  const [topic, setTopic] = useState("");
  const [selectedStyleId, setSelectedStyleId] = useState("catchphrase");
  const [selectedArchetype, setSelectedArchetype] = useState<string>(ANY_ARCHETYPE);
  const [dataSource, setDataSource] = useState<DataSource>("deep");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runningStage, setRunningStage] = useState<StageKey | null>(null);
  const [pipeline, setPipeline] = useState<PipelineState>(EMPTY_PIPELINE);
  const [editingStage, setEditingStage] = useState<StageKey | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // ---------- API helpers ----------

  const callStage = useCallback(
    async (stage: StageKey, currentPipeline: PipelineState): Promise<any> => {
      const response = await fetch("/api/research-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          topic: topic || "Web3 gaming",
          tweetStyle: selectedStyleId,
          archetype: selectedArchetype || undefined,
          beliefs: currentPipeline.beliefs,
          evidenceNeeds: currentPipeline.evidenceNeeds,
          research: currentPipeline.research,
          narrative: currentPipeline.narrative,
          hooks: currentPipeline.hooks,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Stage ${stage} failed: ${response.status}`);
      }
      return response.json();
    },
    [topic, selectedStyleId, selectedArchetype]
  );

  // Run pipeline from a given stage through to draft
  const runFrom = useCallback(
    async (startStage: StageKey, startPipeline: PipelineState) => {
      setLoading(true);
      setError(null);

      const startIdx = STAGES.findIndex((s) => s.key === startStage);
      let current = { ...startPipeline };

      // Clear all outputs from startStage onward
      for (let i = startIdx; i < STAGES.length; i++) {
        const outputKey = STAGE_OUTPUT_KEY[STAGES[i].key];
        (current as any)[outputKey] = null;
      }
      setPipeline(current);
      setTweets([]);

      try {
        for (let i = startIdx; i < STAGES.length; i++) {
          const stage = STAGES[i];
          setRunningStage(stage.key);
          setLoadingMessage(getStageLoadingMessage(stage.key));

          const result = await callStage(stage.key, current);

          // Merge result into pipeline
          const outputKey = STAGE_OUTPUT_KEY[stage.key];
          current = { ...current, [outputKey]: result[outputKey] || result.tweets || result.hooks };

          // Special handling for different response shapes
          if (stage.key === "belief") current.beliefs = result.beliefs;
          if (stage.key === "evidence") current.evidenceNeeds = result.evidenceNeeds;
          if (stage.key === "research") current.research = result.research;
          if (stage.key === "narrative") current.narrative = result.narrative;
          if (stage.key === "hook") current.hooks = result.hooks;
          if (stage.key === "draft") {
            current.tweets = result.tweets;
            setTweets(result.tweets || []);
          }

          setPipeline({ ...current });
        }

        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } catch (err: any) {
        console.error("Pipeline error:", err);
        setError(err.message || "Something went wrong.");
      } finally {
        setLoading(false);
        setRunningStage(null);
      }
    },
    [callStage, setTweets]
  );

  const getStageLoadingMessage = (stage: StageKey): string => {
    const messages: Record<StageKey, string> = {
      belief: "Generating beliefs...",
      evidence: "Identifying evidence needs...",
      research: "Researching data points...",
      narrative: "Crafting narrative angle...",
      hook: "Writing hooks...",
      draft: "Drafting tweets...",
    };
    return messages[stage];
  };

  // ---------- Internal-only flow (DB, no web search) ----------

  const handleGenerateInternalOnly = async () => {
    setLoading(true);
    setError(null);
    setLoadingMessage("Fetching from database...");
    setPipeline(EMPTY_PIPELINE);
    setTweets([]);

    try {
      const topicToUse = topic || "Web3 gaming";
      const internalResponse = await fetch("/api/fetchInternalData", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicToUse }),
      });
      if (!internalResponse.ok) {
        const errData = await internalResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Internal data API error: ${internalResponse.status}`);
      }
      const internalData = await internalResponse.json();

      if (internalData.count === 0) {
        setError("No data found in the database for this topic. Try Quick Research instead.");
        return;
      }

      setLoadingMessage("Generating tweets from internal data...");
      const generateResponse = await fetch("/api/generate-tweets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicToUse,
          overarchingNarrative: internalData.overarchingNarrative || "",
          selectedMetrics: internalData.metrics.map((m: Metric) => m.name),
          tweetStyle: selectedStyleId,
          archetype: selectedArchetype || undefined,
        } as GenerateTweetsRequest),
      });
      if (!generateResponse.ok) {
        const errData = await generateResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Generate API error: ${generateResponse.status}`);
      }
      const data = await generateResponse.json();
      if (data.tweets?.length > 0) {
        setTweets(data.tweets);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      } else {
        setError("No tweets were generated.");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Quick research flow (3 web searches) ----------

  const handleGenerateInternal = async () => {
    setLoading(true);
    setError(null);
    setLoadingMessage("Researching topic...");
    setPipeline(EMPTY_PIPELINE);
    setTweets([]);

    try {
      const topicToUse = topic || "Web3 gaming";
      const metricsResponse = await fetch("/api/fetchMetrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicToUse }),
      });
      if (!metricsResponse.ok) {
        const errData = await metricsResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Metrics API error: ${metricsResponse.status}`);
      }
      const metricsData = await metricsResponse.json();

      setLoadingMessage("Generating tweets...");
      const generateResponse = await fetch("/api/generate-tweets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicToUse,
          overarchingNarrative: metricsData.overarchingNarrative || "",
          selectedMetrics: metricsData.metrics.map((m: Metric) => m.name),
          tweetStyle: selectedStyleId,
          archetype: selectedArchetype || undefined,
        } as GenerateTweetsRequest),
      });
      if (!generateResponse.ok) {
        const errData = await generateResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Generate API error: ${generateResponse.status}`);
      }
      const data = await generateResponse.json();
      if (data.tweets?.length > 0) {
        setTweets(data.tweets);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      } else {
        setError("No tweets were generated.");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Generate entry point ----------

  const handleGenerate = () => {
    if (dataSource === "internal") {
      handleGenerateInternalOnly();
    } else if (dataSource === "quick") {
      handleGenerateInternal();
    } else {
      runFrom("belief", EMPTY_PIPELINE);
    }
  };

  // Re-run from a specific stage (keeps prior outputs, clears this stage + downstream)
  const handleRerunFrom = (stageKey: StageKey) => {
    setEditingStage(null);
    runFrom(stageKey, pipeline);
  };

  // Iterative research: take the current research findings, run another web
  // search round to fill gaps, then re-run narrative → hook → draft so the
  // downstream stages benefit from the enriched evidence. Re-clickable: each
  // press is another round. Costs ~$0.04 search + tokens per click.
  const handleDeepenResearch = useCallback(async () => {
    if (!pipeline.evidenceNeeds || !pipeline.research) return;
    setLoading(true);
    setError(null);
    setEditingStage(null);
    setRunningStage("research");
    setLoadingMessage("Digging deeper into research...");

    try {
      const response = await fetch("/api/research-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "deepen",
          topic: topic || "Web3 gaming",
          tweetStyle: selectedStyleId,
          archetype: selectedArchetype || undefined,
          evidenceNeeds: pipeline.evidenceNeeds,
          research: pipeline.research,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Deepen failed: ${response.status}`);
      }
      const data = await response.json();

      // Replace research, clear downstream so the user can see the new findings
      // before deciding whether to continue.
      const updated: PipelineState = {
        ...pipeline,
        research: data.research,
        narrative: null,
        hooks: null,
        tweets: null,
      };
      setPipeline(updated);
      setTweets([]);
      setRunningStage(null);

      // Auto-continue: re-run narrative → hook → draft with the enriched
      // evidence. The user gets fresh tweets without an extra click.
      await runFrom("narrative", updated);
    } catch (err: any) {
      console.error("Deepen error:", err);
      setError(err.message || "Failed to deepen research.");
      setRunningStage(null);
      setLoading(false);
    }
  }, [pipeline, topic, selectedStyleId, selectedArchetype, runFrom, setTweets]);

  // ---------- Editing ----------

  const startEditing = (stageKey: StageKey) => {
    setEditingStage(stageKey);
  };

  const cancelEditing = () => {
    setEditingStage(null);
  };

  // Save edits and clear downstream
  const saveEdits = (stageKey: StageKey, updatedData: any) => {
    const stageIdx = STAGES.findIndex((s) => s.key === stageKey);
    const updated = { ...pipeline };

    // Set the edited stage's data
    const outputKey = STAGE_OUTPUT_KEY[stageKey];
    (updated as any)[outputKey] = updatedData;

    // Clear downstream stages
    for (let i = stageIdx + 1; i < STAGES.length; i++) {
      const downstreamKey = STAGE_OUTPUT_KEY[STAGES[i].key];
      (updated as any)[downstreamKey] = null;
    }

    setPipeline(updated);
    setTweets([]);
    setEditingStage(null);
  };

  // After saving edits, continue from the next stage
  const handleContinueFrom = (stageKey: StageKey) => {
    const stageIdx = STAGES.findIndex((s) => s.key === stageKey);
    if (stageIdx < STAGES.length - 1) {
      runFrom(STAGES[stageIdx + 1].key, pipeline);
    }
  };

  // ---------- Copy ----------

  const handleCopyTweet = (tweet: string) => {
    navigator.clipboard.writeText(tweet);
  };

  const formatTweetText = (text: string) => {
    return text.split("\n").map((line, i) => (
      <React.Fragment key={i}>
        {line}
        {i < text.split("\n").length - 1 && <br />}
      </React.Fragment>
    ));
  };

  // ---------- Stage status ----------

  const getStageStatus = (stageKey: StageKey): "idle" | "running" | "complete" | "edited" => {
    if (runningStage === stageKey) return "running";
    const outputKey = STAGE_OUTPUT_KEY[stageKey];
    if ((pipeline as any)[outputKey]) return "complete";
    return "idle";
  };

  // ---------- Render ----------

  const hasPipelineData = Object.values(pipeline).some((v) => v !== null);

  return (
    <div className="mx-auto w-full space-y-6" suppressHydrationWarning>
      <div>
        <label className="mb-3 block text-sm font-medium text-gray-300">Workflow</label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <button
            onClick={() => setPlannerMode("single")}
            className={`rounded-lg border p-4 text-left transition-all duration-200 ${
              plannerMode === "single"
                ? "border-purple-500 bg-purple-900/30 shadow-lg shadow-purple-500/20"
                : "border-gray-700 bg-white/5 hover:border-gray-500 hover:bg-white/10"
            }`}
          >
            <h3 className="text-sm font-medium text-white">Single Tweet Mode</h3>
            <p className="mt-1 text-xs text-gray-400">
              Generate tweet sets from one topic using the current research or internal-data flow.
            </p>
          </button>
          <button
            onClick={() => setPlannerMode("bespoke")}
            className={`rounded-lg border p-4 text-left transition-all duration-200 ${
              plannerMode === "bespoke"
                ? "border-purple-500 bg-purple-900/30 shadow-lg shadow-purple-500/20"
                : "border-gray-700 bg-white/5 hover:border-gray-500 hover:bg-white/10"
            }`}
          >
            <h3 className="text-sm font-medium text-white">Bespoke Mode</h3>
            <p className="mt-1 text-xs text-gray-400">
              Call one specific agent at a time for targeted research, hooks, drafts, or rewrites.
            </p>
          </button>
          <button
            onClick={() => setPlannerMode("weekly")}
            className={`rounded-lg border p-4 text-left transition-all duration-200 ${
              plannerMode === "weekly"
                ? "border-purple-500 bg-purple-900/30 shadow-lg shadow-purple-500/20"
                : "border-gray-700 bg-white/5 hover:border-gray-500 hover:bg-white/10"
            }`}
          >
            <h3 className="text-sm font-medium text-white">Weekly Planning Mode</h3>
            <p className="mt-1 text-xs text-gray-400">
              Capture the week, bulk-load ideas, and plan all 15 slots before drafting.
            </p>
          </button>
        </div>
      </div>

      {plannerMode === "weekly" ? (
        <WeeklyPlanner />
      ) : plannerMode === "bespoke" ? (
        <BespokeAgentWorkbench />
      ) : (
        <>
      {/* Data Source Toggle */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">Data Source</label>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setDataSource("internal")}
            className={`p-4 rounded-lg border transition-all duration-200 flex items-center gap-3 ${
              dataSource === "internal"
                ? "border-purple-500 bg-purple-900/30 shadow-lg shadow-purple-500/20"
                : "border-gray-700 bg-white/5 hover:bg-white/10 hover:border-gray-500"
            }`}
          >
            <HiOutlineDatabase className="h-5 w-5 text-purple-400 flex-shrink-0" />
            <div className="text-left">
              <h3 className="text-white font-medium text-sm">Internal Only</h3>
              <p className="text-gray-400 text-xs">Database + topic text, no web search</p>
            </div>
          </button>
          <button
            onClick={() => setDataSource("quick")}
            className={`p-4 rounded-lg border transition-all duration-200 flex items-center gap-3 ${
              dataSource === "quick"
                ? "border-purple-500 bg-purple-900/30 shadow-lg shadow-purple-500/20"
                : "border-gray-700 bg-white/5 hover:bg-white/10 hover:border-gray-500"
            }`}
          >
            <RiAiGenerate className="h-5 w-5 text-purple-400 flex-shrink-0" />
            <div className="text-left">
              <h3 className="text-white font-medium text-sm">Quick Research</h3>
              <p className="text-gray-400 text-xs">3 web searches, fast turnaround</p>
            </div>
          </button>
          <button
            onClick={() => setDataSource("deep")}
            className={`p-4 rounded-lg border transition-all duration-200 flex items-center gap-3 ${
              dataSource === "deep"
                ? "border-purple-500 bg-purple-900/30 shadow-lg shadow-purple-500/20"
                : "border-gray-700 bg-white/5 hover:bg-white/10 hover:border-gray-500"
            }`}
          >
            <BsRobot className="h-5 w-5 text-purple-400 flex-shrink-0" />
            <div className="text-left">
              <h3 className="text-white font-medium text-sm">Deep Research</h3>
              <p className="text-gray-400 text-xs">6-stage belief-driven pipeline</p>
            </div>
          </button>
        </div>
      </div>

      {/* Topic Input */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Topic</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter topic (e.g., Web3 gaming, Immutable zkEVM, crypto market)... Default is Web3 Gaming"
          className="w-full p-4 border border-gray-600 rounded-lg outline-none text-white bg-white/10 placeholder-gray-500 focus:border-purple-500 transition-colors min-h-[70px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleGenerate();
            }
          }}
        />
      </div>

      {/* Archetype Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Archetype</label>
        <select
          value={selectedArchetype}
          onChange={(e) => setSelectedArchetype(e.target.value)}
          className="w-full p-3 border border-gray-600 rounded-lg outline-none text-white bg-white/10 focus:border-purple-500 transition-colors"
        >
          {archetypeOptions.map((opt) => (
            <option key={opt.value || "any"} value={opt.value} className="bg-gray-900">
              {opt.label}
            </option>
          ))}
        </select>
        <p className="text-gray-500 text-xs mt-1">
          Filters exemplar tweets by archetype and tells the drafter what kind of statement to make. Falls back to style-only matching if no exemplars exist for the combination.
        </p>
      </div>

      {/* Tweet Style Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">Tweet Style</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tweetStyleOptions.map((style) => (
            <div
              key={style.id}
              onClick={() => setSelectedStyleId(style.id)}
              className={`p-3 rounded-lg cursor-pointer border transition-all duration-200 ${
                selectedStyleId === style.id
                  ? "border-purple-500 bg-purple-900/30 shadow-lg shadow-purple-500/20"
                  : "border-gray-700 bg-white/5 hover:bg-white/10 hover:border-gray-500"
              }`}
            >
              <div className="flex items-center mb-1">
                <input
                  type="radio"
                  checked={selectedStyleId === style.id}
                  onChange={() => setSelectedStyleId(style.id)}
                  className="mr-3 h-4 w-4 accent-purple-500"
                />
                <h3 className="text-white font-medium text-sm">{style.name}</h3>
              </div>
              <p className="text-gray-400 text-xs ml-7">{style.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Generate Button */}
      <div className="flex justify-center">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="bg-purple-600 text-white px-8 py-3 rounded-xl disabled:opacity-50 flex items-center hover:bg-purple-700 transition-colors font-medium text-lg"
        >
          {loading && !hasPipelineData ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2" />
              {loadingMessage}
            </>
          ) : (
            <>
              <RiAiGenerate className="mr-2 h-5 w-5" />
              Generate Tweets
            </>
          )}
        </button>
      </div>

      {/* Pipeline Stages (Research Agent only) */}
      {dataSource === "deep" && hasPipelineData && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Pipeline</h3>
          {STAGES.map((stage) => {
            const status = getStageStatus(stage.key);
            if (status === "idle" && !loading) return null;

            return (
              <StageCard
                key={stage.key}
                stageKey={stage.key}
                label={stage.label}
                status={status}
                pipeline={pipeline}
                isEditing={editingStage === stage.key}
                loading={loading}
                onEdit={() => startEditing(stage.key)}
                onCancelEdit={cancelEditing}
                onSaveEdit={(data) => saveEdits(stage.key, data)}
                onRerun={() => handleRerunFrom(stage.key)}
                onContinue={() => handleContinueFrom(stage.key)}
                onDeepen={stage.key === "research" ? handleDeepenResearch : undefined}
                loadingMessage={loadingMessage}
              />
            );
          })}
        </div>
      )}

      {/* Results */}
      {tweets.length > 0 && (
        <div ref={resultsRef} className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl text-white font-bold">Tweet Recommendations</h2>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="text-purple-400 hover:text-purple-300 text-sm font-medium disabled:opacity-50"
            >
              Regenerate
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {tweets.map((tweet, index) => (
              <TweetCard key={index} tweet={tweet} onCopy={handleCopyTweet} formatText={formatTweetText} />
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

// ---------- Stage Card Component ----------

interface StageCardProps {
  stageKey: StageKey;
  label: string;
  status: "idle" | "running" | "complete" | "edited";
  pipeline: PipelineState;
  isEditing: boolean;
  loading: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (data: any) => void;
  onRerun: () => void;
  onContinue: () => void;
  onDeepen?: () => void;
  loadingMessage: string;
}

function StageCard({
  stageKey,
  label,
  status,
  pipeline,
  isEditing,
  loading,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onRerun,
  onContinue,
  onDeepen,
  loadingMessage,
}: StageCardProps) {
  const statusColors = {
    idle: "border-gray-700 bg-white/5",
    running: "border-purple-500/50 bg-purple-900/20",
    complete: "border-gray-600 bg-white/5",
    edited: "border-yellow-500/50 bg-yellow-900/10",
  };

  // Check if downstream stages are cleared (meaning user should continue)
  const stageIdx = STAGES.findIndex((s) => s.key === stageKey);
  const hasDownstreamCleared =
    status === "complete" &&
    stageIdx < STAGES.length - 1 &&
    !(pipeline as any)[STAGE_OUTPUT_KEY[STAGES[stageIdx + 1].key]];

  return (
    <div className={`border rounded-lg overflow-hidden ${statusColors[status]}`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === "running" && (
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-purple-400" />
          )}
          {status === "complete" && (
            <div className="h-4 w-4 rounded-full bg-green-500/80 flex items-center justify-center text-white text-xs">
              &#10003;
            </div>
          )}
          <span className="text-white text-sm font-medium">{label}</span>
          {status === "running" && (
            <span className="text-purple-300 text-xs ml-2">{loadingMessage}</span>
          )}
        </div>
        {status === "complete" && !isEditing && (
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              disabled={loading}
              className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded border border-gray-600 hover:border-gray-400 disabled:opacity-50 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onRerun}
              disabled={loading}
              className="text-gray-400 hover:text-purple-300 text-xs px-2 py-1 rounded border border-gray-600 hover:border-purple-500 disabled:opacity-50 transition-colors"
            >
              Re-run
            </button>
            {onDeepen && (
              <button
                onClick={onDeepen}
                disabled={loading}
                title="Run another web search round to fill gaps, then re-draft tweets"
                className="text-purple-300 hover:text-white text-xs px-2 py-1 rounded border border-purple-500/60 hover:border-purple-400 hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
              >
                Dig deeper
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {status === "complete" && (
        <div className="px-4 pb-3">
          {isEditing ? (
            <StageEditor
              stageKey={stageKey}
              pipeline={pipeline}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
            />
          ) : (
            <StageOutput stageKey={stageKey} pipeline={pipeline} />
          )}
          {/* Continue button when downstream is cleared after an edit */}
          {hasDownstreamCleared && !isEditing && !loading && (
            <button
              onClick={onContinue}
              className="mt-3 w-full text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
            >
              Continue pipeline from here
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Stage Output (read-only display) ----------

function StageOutput({ stageKey, pipeline }: { stageKey: StageKey; pipeline: PipelineState }) {
  switch (stageKey) {
    case "belief":
      return (
        <div className="space-y-2">
          {pipeline.beliefs?.map((b, i) => (
            <div key={i} className="pl-3 border-l-2 border-purple-500/30">
              <p className="text-white text-sm">{b.belief}</p>
              <p className="text-gray-500 text-xs mt-0.5">{b.whyItMatters}</p>
            </div>
          ))}
        </div>
      );

    case "evidence":
      return (
        <div className="space-y-3">
          {pipeline.evidenceNeeds?.map((e, i) => (
            <div key={i} className="pl-3 border-l-2 border-blue-500/30">
              <p className="text-gray-400 text-xs font-medium mb-1">{e.belief}</p>
              {e.dataPointsNeeded.map((d, j) => (
                <div key={j} className="ml-2 mb-2">
                  <p className="text-white text-sm">
                    {d.rank ? `${d.rank}. ` : "- "}
                    {d.metric}
                  </p>
                  <p className="text-gray-500 text-xs ml-3">
                    {d.sourceType} | {d.bullishSignal}
                  </p>
                  {d.whyCompelling && (
                    <p className="text-gray-600 text-xs ml-3 italic">{d.whyCompelling}</p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      );

    case "research":
      return (
        <div className="space-y-3">
          {pipeline.research?.map((r, i) => (
            <div key={i} className="pl-3 border-l-2 border-green-500/30">
              <p className="text-gray-400 text-xs font-medium mb-1">{r.belief}</p>
              {r.findings.map((f, j) => (
                <div key={j} className="ml-2 mb-2">
                  <p className="text-white text-sm">- {f.claim}</p>
                  {f.sourceUrl && (
                    <p className="text-gray-500 text-xs ml-3 break-all">{f.sourceUrl}</p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      );

    case "narrative":
      return pipeline.narrative ? (
        <div className="pl-3 border-l-2 border-yellow-500/30 space-y-1">
          <p className="text-white text-sm">{pipeline.narrative.insight}</p>
          <p className="text-purple-300 text-xs">Angle: {pipeline.narrative.angle}</p>
          {pipeline.narrative.supportingData.map((d, i) => (
            <div key={i} className="ml-2 mb-2">
              <p className="text-gray-400 text-xs">- {d.claim}</p>
              {d.sourceUrl && (
                <p className="text-gray-500 text-xs ml-3 break-all">{d.sourceUrl}</p>
              )}
            </div>
          ))}
        </div>
      ) : null;

    case "hook":
      return (
        <div className="pl-3 border-l-2 border-orange-500/30 space-y-1">
          {pipeline.hooks?.hooks.map((hook, i) => (
            <div key={i}>
              <p className="text-orange-300 text-[11px] uppercase tracking-wide">
                {hook.type}
              </p>
              <p className="text-white text-sm">{hook.text}</p>
            </div>
          ))}
        </div>
      );

    case "draft":
      return (
        <p className="text-gray-400 text-xs">
          {pipeline.tweets?.length || 0} tweets generated — see below
        </p>
      );

    default:
      return null;
  }
}

// ---------- Stage Editor ----------

function StageEditor({
  stageKey,
  pipeline,
  onSave,
  onCancel,
}: {
  stageKey: StageKey;
  pipeline: PipelineState;
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  // We use a single text area approach per editable item for simplicity
  // Each stage gets its own editor

  switch (stageKey) {
    case "belief":
      return <BeliefsEditor beliefs={pipeline.beliefs || []} onSave={onSave} onCancel={onCancel} />;
    case "evidence":
      return <EvidenceEditor evidence={pipeline.evidenceNeeds || []} onSave={onSave} onCancel={onCancel} />;
    case "research":
      return <ResearchEditor research={pipeline.research || []} onSave={onSave} onCancel={onCancel} />;
    case "narrative":
      return <NarrativeEditor narrative={pipeline.narrative!} onSave={onSave} onCancel={onCancel} />;
    case "hook":
      return <HooksEditor hooks={pipeline.hooks!} onSave={onSave} onCancel={onCancel} />;
    default:
      return null;
  }
}

function BeliefsEditor({ beliefs, onSave, onCancel }: { beliefs: Belief[]; onSave: (b: Belief[]) => void; onCancel: () => void }) {
  const [items, setItems] = useState<Belief[]>(beliefs);
  const update = (i: number, field: keyof Belief, value: string) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  };
  return (
    <div className="space-y-3">
      {items.map((b, i) => (
        <div key={i} className="space-y-1">
          <input
            className="w-full bg-white/10 border border-gray-600 rounded px-3 py-2 text-white text-sm outline-none focus:border-purple-500"
            value={b.belief}
            onChange={(e) => update(i, "belief", e.target.value)}
          />
          <input
            className="w-full bg-white/10 border border-gray-700 rounded px-3 py-1.5 text-gray-400 text-xs outline-none focus:border-purple-500"
            value={b.whyItMatters}
            onChange={(e) => update(i, "whyItMatters", e.target.value)}
            placeholder="Why it matters..."
          />
        </div>
      ))}
      <EditorButtons onSave={() => onSave(items)} onCancel={onCancel} />
    </div>
  );
}

function EvidenceEditor({ evidence, onSave, onCancel }: { evidence: EvidenceNeed[]; onSave: (e: EvidenceNeed[]) => void; onCancel: () => void }) {
  const [items, setItems] = useState<EvidenceNeed[]>(evidence);
  const updatePoint = (i: number, j: number, field: keyof EvidencePoint, value: string) => {
    const next = [...items];
    next[i] = { ...next[i], dataPointsNeeded: [...next[i].dataPointsNeeded] };
    next[i].dataPointsNeeded[j] = { ...next[i].dataPointsNeeded[j], [field]: value };
    setItems(next);
  };
  return (
    <div className="space-y-3">
      {items.map((e, i) => (
        <div key={i}>
          <p className="text-gray-400 text-xs font-medium mb-1">{e.belief}</p>
          {e.dataPointsNeeded.map((d, j) => (
            <div key={j} className="space-y-1 mb-2">
              <input
                className="w-full bg-white/10 border border-gray-700 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-purple-500"
                value={d.metric}
                onChange={(ev) => updatePoint(i, j, "metric", ev.target.value)}
                placeholder="Metric"
              />
              <input
                className="w-full bg-white/10 border border-gray-700 rounded px-3 py-1.5 text-gray-300 text-xs outline-none focus:border-purple-500"
                value={d.sourceType}
                onChange={(ev) => updatePoint(i, j, "sourceType", ev.target.value)}
                placeholder="Source type"
              />
              <input
                className="w-full bg-white/10 border border-gray-700 rounded px-3 py-1.5 text-gray-300 text-xs outline-none focus:border-purple-500"
                value={d.bullishSignal}
                onChange={(ev) => updatePoint(i, j, "bullishSignal", ev.target.value)}
                placeholder="Bullish signal"
              />
            </div>
          ))}
        </div>
      ))}
      <EditorButtons onSave={() => onSave(items)} onCancel={onCancel} />
    </div>
  );
}

function ResearchEditor({ research, onSave, onCancel }: { research: ResearchResult[]; onSave: (r: ResearchResult[]) => void; onCancel: () => void }) {
  const [items, setItems] = useState<ResearchResult[]>(research);
  const updateFinding = (i: number, j: number, field: keyof ResearchFinding, value: string) => {
    const next = [...items];
    next[i] = { ...next[i], findings: [...next[i].findings] };
    next[i].findings[j] = { ...next[i].findings[j], [field]: value };
    setItems(next);
  };
  return (
    <div className="space-y-3">
      {items.map((r, i) => (
        <div key={i}>
          <p className="text-gray-400 text-xs font-medium mb-1">{r.belief}</p>
          {r.findings.map((f, j) => (
            <div key={j} className="space-y-1 mb-2">
              <input
                className="w-full bg-white/10 border border-gray-700 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-purple-500"
                value={f.claim}
                onChange={(ev) => updateFinding(i, j, "claim", ev.target.value)}
                placeholder="Claim"
              />
              <input
                className="w-full bg-white/10 border border-gray-700 rounded px-3 py-1.5 text-gray-300 text-xs outline-none focus:border-purple-500"
                value={f.sourceUrl}
                onChange={(ev) => updateFinding(i, j, "sourceUrl", ev.target.value)}
                placeholder="Source URL"
              />
            </div>
          ))}
        </div>
      ))}
      <EditorButtons onSave={() => onSave(items)} onCancel={onCancel} />
    </div>
  );
}

function NarrativeEditor({ narrative, onSave, onCancel }: { narrative: NarrativeOutput; onSave: (n: NarrativeOutput) => void; onCancel: () => void }) {
  const [data, setData] = useState<NarrativeOutput>(narrative);
  const updateDataPoint = (i: number, field: keyof SupportingDatum, value: string) => {
    const next = { ...data, supportingData: [...data.supportingData] };
    next.supportingData[i] = { ...next.supportingData[i], [field]: value };
    setData(next);
  };
  return (
    <div className="space-y-2">
      <div>
        <label className="text-gray-500 text-xs">Insight</label>
        <textarea
          className="w-full bg-white/10 border border-gray-600 rounded px-3 py-2 text-white text-sm outline-none focus:border-purple-500 resize-none"
          rows={2}
          value={data.insight}
          onChange={(e) => setData({ ...data, insight: e.target.value })}
        />
      </div>
      <div>
        <label className="text-gray-500 text-xs">Angle</label>
        <select
          className="w-full bg-white/10 border border-gray-600 rounded px-3 py-2 text-white text-sm outline-none focus:border-purple-500"
          value={data.angle}
          onChange={(e) => setData({ ...data, angle: e.target.value })}
        >
          {[
            { value: "contrarian", label: "Contrarian" },
            { value: "inevitability", label: "Inevitability" },
            { value: "hidden-metric", label: "Hidden metric" },
            { value: "reframe", label: "Reframe" },
            { value: "milestone", label: "Milestone" },
            { value: "comparison", label: "Comparison" },
          ].map((a) => (
            <option key={a.value} value={a.value} className="bg-gray-900">
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-gray-500 text-xs">Supporting Data</label>
        {data.supportingData.map((d, i) => (
          <div key={i} className="space-y-1 mb-2">
            <input
              className="w-full bg-white/10 border border-gray-700 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-purple-500"
              value={d.claim}
              onChange={(e) => updateDataPoint(i, "claim", e.target.value)}
              placeholder="Claim"
            />
            <input
              className="w-full bg-white/10 border border-gray-700 rounded px-3 py-1.5 text-gray-300 text-xs outline-none focus:border-purple-500"
              value={d.sourceUrl}
              onChange={(e) => updateDataPoint(i, "sourceUrl", e.target.value)}
              placeholder="Source URL"
            />
          </div>
        ))}
      </div>
      <EditorButtons onSave={() => onSave(data)} onCancel={onCancel} />
    </div>
  );
}

function HooksEditor({ hooks, onSave, onCancel }: { hooks: HookOutput; onSave: (h: HookOutput) => void; onCancel: () => void }) {
  const [items, setItems] = useState(hooks.hooks);
  const update = (i: number, field: "type" | "text", value: string) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  };
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-gray-700 bg-white/5 px-3 py-2 text-xs text-gray-400">
        <div className="mb-2 font-medium text-gray-300">Hook types</div>
        <div className="space-y-1">
          {hookTypeOptions.map((option) => (
            <div key={option.value}>
              <span className="text-gray-200">{option.label}:</span> {option.description}
            </div>
          ))}
        </div>
      </div>
      {items.map((hook, i) => (
        <div key={i} className="space-y-2">
          <select
            className="w-full bg-white/10 border border-gray-700 rounded px-3 py-2 text-white text-sm outline-none focus:border-purple-500"
            value={hook.type}
            onChange={(e) => update(i, "type", e.target.value)}
          >
            {hookTypeOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-gray-900">
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="w-full bg-white/10 border border-gray-600 rounded px-3 py-2 text-white text-sm outline-none focus:border-purple-500"
            value={hook.text}
            onChange={(e) => update(i, "text", e.target.value)}
          />
        </div>
      ))}
      <EditorButtons onSave={() => onSave({ hooks: items })} onCancel={onCancel} />
    </div>
  );
}

function EditorButtons({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        onClick={onSave}
        className="text-sm bg-purple-600 text-white px-4 py-1.5 rounded hover:bg-purple-700 transition-colors"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="text-sm text-gray-400 px-4 py-1.5 rounded border border-gray-600 hover:border-gray-400 hover:text-white transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

// ---------- Tweet Card Component ----------

function TweetCard({
  tweet,
  onCopy,
  formatText,
}: {
  tweet: string;
  onCopy: (t: string) => void;
  formatText: (t: string) => React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-md border border-gray-200">
      <div className="p-4 flex items-start">
        <div className="h-12 w-12 rounded-full bg-gray-300 overflow-hidden mr-3 flex-shrink-0">
          <Image src="/avatar.jpg" alt="Profile" width={48} height={48} className="h-full w-full object-cover" />
        </div>
        <div className="flex-1">
          <div className="flex items-center">
            <span className="font-bold text-gray-900">Robbie Ferguson</span>
            <svg className="h-5 w-5 ml-1 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
            </svg>
            <span className="text-gray-500 ml-1">@0xFerg</span>
          </div>
          <div className="mt-1 text-gray-800 whitespace-pre-line">{formatText(tweet)}</div>
          <div className="mt-2 text-gray-500 text-sm">
            {new Date().toLocaleTimeString()} · {new Date().toLocaleDateString()}
          </div>
        </div>
      </div>
      <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
        <button
          onClick={() => onCopy(tweet)}
          className="w-full text-sm bg-black text-white px-3 py-2 rounded-lg hover:bg-gray-700 flex items-center justify-center"
        >
          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          Copy Tweet
        </button>
      </div>
    </div>
  );
}

export default TweetGenerator;
