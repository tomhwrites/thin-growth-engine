"use client";

import { useMemo, useState } from "react";
import { contentTopicOptions, tweetStyles, CONTENT_TOPIC_ANY } from "@/utils/tweetConfig";

type BespokeAgentKey =
  | "belief"
  | "evidence"
  | "research"
  | "narrative"
  | "hook"
  | "draft"
  | "critic";

interface BespokeAgentState {
  input: string;
  output: string;
  loading: boolean;
  error: string | null;
}

const BESPOKE_AGENT_CONFIG: {
  key: BespokeAgentKey;
  title: string;
  description: string;
  placeholder: string;
  hint: string;
  buttonLabel: string;
}[] = [
  {
    key: "belief",
    title: "Belief Agent",
    description:
      "Generate fresh beliefs from a topic or thesis seed without running the rest of the workflow.",
    placeholder:
      "Paste a topic or thesis seed here.\n\nExample:\nImmutable Audience is turning player identity into a real growth moat for studios.",
    hint: "Use this as a fast starting point. If you leave it blank, the shared topic above is used.",
    buttonLabel: "Run Belief Agent",
  },
  {
    key: "evidence",
    title: "Evidence Agent",
    description:
      "Turn beliefs into the specific proof points or datasets you want researched next.",
    placeholder:
      "Paste beliefs here, one per line or in blocks.\n\nExample:\nBelief: Immutable's distribution stack is compounding.\nWhy it matters: It improves studio growth outcomes.",
    hint: "One belief per line works. You can also paste the formatted output from the belief agent.",
    buttonLabel: "Run Evidence Agent",
  },
  {
    key: "research",
    title: "Research Agent",
    description:
      "Research specific evidence requests without re-running beliefs, narrative, hooks, or drafting.",
    placeholder:
      "Paste evidence requests here.\n\nExample:\nBelief: Immutable Audience improves game growth efficiency\n- Evidence needed: named studio using Audience\n- Evidence needed: any disclosed retention, attribution, or targeting outcome",
    hint: "If you just paste raw evidence questions line by line, the agent will research them under the shared topic.",
    buttonLabel: "Run Research Agent",
  },
  {
    key: "narrative",
    title: "Narrative Agent",
    description:
      "Synthesize a strong angle from research findings only, without hooks or tweet drafting.",
    placeholder:
      "Paste research findings here.\n\nExample:\nBelief: Audience helps studios grow\n- Finding: Immutable launched Audience as a growth and identity product\n- Finding: Audience ties wallet, game, and campaign data into one profile",
    hint: "The cleaner the evidence blocks, the sharper the narrative output will be.",
    buttonLabel: "Run Narrative Agent",
  },
  {
    key: "hook",
    title: "Hook Agent",
    description:
      "Generate hook options from a narrative or insight without drafting the full tweet set.",
    placeholder:
      "Paste a narrative here.\n\nExample:\nInsight: Studios are moving from wallet infra to full growth stacks.\nAngle: Reframe\nData:\n- Immutable Audience unifies player identity across touchpoints",
    hint: "Use `Insight:`, optional `Angle:`, and optional `Data:` bullets for the cleanest result.",
    buttonLabel: "Run Hook Agent",
  },
  {
    key: "draft",
    title: "Draft Agent",
    description:
      "Generate tweet drafts from a narrative and optional hooks, without running the critic pass.",
    placeholder:
      "Paste narrative input here.\n\nExample:\nInsight: Growth tooling is becoming core game infrastructure.\nAngle: Inevitability\nData:\n- Studios need attribution across wallet and gameplay events\nHooks:\n- growth infra is now game infra",
    hint: "This runs only the drafter. Add `Hooks:` if you want to steer the openings.",
    buttonLabel: "Run Draft Agent",
  },
  {
    key: "critic",
    title: "Critic Agent",
    description:
      "Rewrite a specific tweet draft without re-running research, hooks, or the full drafting flow.",
    placeholder:
      "Paste the exact tweet you want rewritten here.\n\nExample:\nStudios won't win on wallet UX alone. They'll win on growth loops tied to identity, rewards, and distribution.",
    hint: "Best for surgical rewrites when the core idea is right but the framing or punch is off.",
    buttonLabel: "Run Critic Agent",
  },
];

function createInitialAgentState(): Record<BespokeAgentKey, BespokeAgentState> {
  return {
    belief: { input: "", output: "", loading: false, error: null },
    evidence: { input: "", output: "", loading: false, error: null },
    research: { input: "", output: "", loading: false, error: null },
    narrative: { input: "", output: "", loading: false, error: null },
    hook: { input: "", output: "", loading: false, error: null },
    draft: { input: "", output: "", loading: false, error: null },
    critic: { input: "", output: "", loading: false, error: null },
  };
}

function BespokeAgentWorkbench() {
  const [topic, setTopic] = useState("");
  const [selectedStyleId, setSelectedStyleId] = useState("catchphrase");
  const [selectedContentTopic, setSelectedContentTopic] =
    useState<string>(CONTENT_TOPIC_ANY);
  const [agents, setAgents] = useState<Record<BespokeAgentKey, BespokeAgentState>>(
    createInitialAgentState
  );

  const styleOptions = useMemo(
    () =>
      Object.entries(tweetStyles).map(([id, style]) => ({
        id,
        name: style.name,
        description: style.description,
      })),
    []
  );

  const updateAgentState = (
    key: BespokeAgentKey,
    updater: (current: BespokeAgentState) => BespokeAgentState
  ) => {
    setAgents((current) => ({
      ...current,
      [key]: updater(current[key]),
    }));
  };

  const handleRunAgent = async (key: BespokeAgentKey) => {
    updateAgentState(key, (current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    try {
      const response = await fetch("/api/bespoke-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: key,
          inputText: agents[key].input,
          topic: topic.trim() || "Web3 gaming",
          tweetStyle: selectedStyleId,
          contentTopic: selectedContentTopic || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Bespoke ${key} agent failed`);
      }

      updateAgentState(key, (current) => ({
        ...current,
        loading: false,
        output: String(data.outputText ?? "").trim(),
        error: null,
      }));
    } catch (error: any) {
      updateAgentState(key, (current) => ({
        ...current,
        loading: false,
        error: error.message || "Something went wrong.",
      }));
    }
  };

  const handleCopyOutput = async (key: BespokeAgentKey) => {
    const output = agents[key].output.trim();
    if (!output) return;
    await navigator.clipboard.writeText(output);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Bespoke Mode</h3>
          <p className="mt-1 text-sm text-gray-400">
            Run individual agents one at a time when you want a surgical action
            like research-only evidence gathering or a critic-only rewrite.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">
            Shared Topic Context
          </label>
          <textarea
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Optional shared topic context for all bespoke agent runs. If blank, defaults to Web3 gaming."
            className="min-h-[90px] w-full rounded-xl border border-gray-600 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-purple-500"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Content Archetype
            </label>
            <select
              value={selectedContentTopic}
              onChange={(event) => setSelectedContentTopic(event.target.value)}
              className="w-full rounded-xl border border-gray-600 bg-white/10 px-3 py-2 text-white outline-none focus:border-purple-500"
            >
              {contentTopicOptions.map((option) => (
                <option
                  key={option.value || "any"}
                  value={option.value}
                  className="bg-gray-900"
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Tweet Style
            </label>
            <select
              value={selectedStyleId}
              onChange={(event) => setSelectedStyleId(event.target.value)}
              className="w-full rounded-xl border border-gray-600 bg-white/10 px-3 py-2 text-white outline-none focus:border-purple-500"
            >
              {styleOptions.map((option) => (
                <option key={option.id} value={option.id} className="bg-gray-900">
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {BESPOKE_AGENT_CONFIG.map((agent) => {
          const state = agents[agent.key];

          return (
            <div
              key={agent.key}
              className="rounded-2xl border border-gray-700 bg-white/5 p-5 space-y-4"
            >
              <div>
                <h4 className="text-base font-semibold text-white">{agent.title}</h4>
                <p className="mt-1 text-sm text-gray-400">{agent.description}</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Input
                </label>
                <textarea
                  value={state.input}
                  onChange={(event) =>
                    updateAgentState(agent.key, (current) => ({
                      ...current,
                      input: event.target.value,
                    }))
                  }
                  placeholder={agent.placeholder}
                  className="min-h-[200px] w-full rounded-xl border border-gray-600 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-purple-500"
                />
                <p className="mt-2 text-xs text-gray-500">{agent.hint}</p>
              </div>

              {state.error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {state.error}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleRunAgent(agent.key)}
                  disabled={state.loading}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  {state.loading ? "Running..." : agent.buttonLabel}
                </button>
                {state.output && (
                  <button
                    onClick={() => handleCopyOutput(agent.key)}
                    className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-400 hover:text-white"
                  >
                    Copy Output
                  </button>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Output
                </label>
                <div className="min-h-[160px] rounded-xl border border-gray-700 bg-black/20 px-4 py-3">
                  {state.output ? (
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm text-white">
                      {state.output}
                    </pre>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Run this agent to see its standalone output here.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default BespokeAgentWorkbench;
