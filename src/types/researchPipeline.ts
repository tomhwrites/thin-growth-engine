export interface Belief {
  belief: string;
  whyItMatters: string;
  criterion?: string;
}

export interface EvidencePoint {
  metric: string;
  sourceType: string;
  bullishSignal: string;
}

export interface EvidenceNeed {
  belief: string;
  dataPointsNeeded: EvidencePoint[];
}

export interface ResearchFinding {
  claim: string;
  sourceUrl: string;
  reused: boolean;
}

export interface ResearchResult {
  belief: string;
  findings: ResearchFinding[];
}

export interface SupportingDatum {
  claim: string;
  sourceUrl: string;
}

export interface NarrativeOutput {
  insight: string;
  angle: string;
  supportingData: SupportingDatum[];
}

export interface HookOutput {
  hooks: string[];
}
