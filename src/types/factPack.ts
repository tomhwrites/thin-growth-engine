export interface FactPackItem {
  claim: string;
  sourceUrl: string;
  sourceType?: string;
}

export interface FactCandidateInput extends FactPackItem {
  priority: number;
  updatedAt?: Date | null;
}
