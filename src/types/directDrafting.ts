import type { FactPackItem } from "@/types/factPack";

export type DirectDraftMode = "internal" | "quick";

export interface DirectFactPackDraftInput {
  topic: string;
  archetype?: string;
  tweetStyle: string;
  narrative: string;
  factPack: FactPackItem[];
  dataSource: DirectDraftMode;
}

export interface DirectDraftOutput {
  tweets: string[];
  factsUsed: string[];
  rationale: string;
}

export interface InvalidDirectTweet {
  index: number;
  currentTweet: string;
  reasons: string[];
}
