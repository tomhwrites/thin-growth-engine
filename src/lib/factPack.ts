import type { FactCandidateInput, FactPackItem } from "@/types/factPack";

function getFactCandidateSourceRank(sourceType?: string) {
  switch ((sourceType || "").toLowerCase()) {
    case "immutable":
      return 0;
    case "cited":
      return 1;
    case "verified":
    case "manual":
    case "internal":
    case "metric":
    case "research":
      return 2;
    case "slot_evidence":
    case "proof_point":
      return 3;
    case "synthesis":
      return 4;
    default:
      return 5;
  }
}

function normalizeCandidateClaim(claim: string) {
  return claim.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractClaimMagnitude(claim: string): number | null {
  const match = claim.match(/(\d+(?:\.\d+)?)\s*(billion|million|m|b)?/i);
  if (!match) return null;

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;

  const unit = (match[2] || "").toLowerCase();
  if (unit === "billion" || unit === "b") return value * 1_000_000_000;
  if (unit === "million" || unit === "m") return value * 1_000_000;
  return value;
}

function getSupersessionFamily(claim: string): string | null {
  const normalized = claim.toLowerCase();

  if (
    /\b(registered users?|wallets?|wallet|connected|onboarded)\b/.test(
      normalized
    ) &&
    /\d/.test(normalized)
  ) {
    return "audience_scale";
  }

  if (
    /\b(games?|titles?)\b/.test(normalized) &&
    /\b(total|signed|onboarded|integrated|connected)\b/.test(normalized) &&
    /\d/.test(normalized)
  ) {
    return "game_count";
  }

  return null;
}

function getClaimSpecificityScore(claim: string, family: string) {
  const normalized = claim.toLowerCase();

  if (family === "audience_scale") {
    if (/\bregistered users?\b/.test(normalized)) return 3;
    if (/\bwallets?\b/.test(normalized)) return 2;
    if (/\bconnected|onboarded\b/.test(normalized)) return 1;
  }

  if (family === "game_count") {
    if (/\btotal\b/.test(normalized)) return 3;
    if (/\bsigned\b/.test(normalized)) return 2;
    if (/\bonboarded|connected|integrated\b/.test(normalized)) return 1;
  }

  return 0;
}

function pickPreferredFactCandidate(
  current: FactCandidateInput,
  candidate: FactCandidateInput,
  family: string
) {
  const currentImmutable = current.sourceType === "immutable";
  const candidateImmutable = candidate.sourceType === "immutable";
  if (currentImmutable !== candidateImmutable) {
    return candidateImmutable ? candidate : current;
  }

  const currentMagnitude = extractClaimMagnitude(current.claim);
  const candidateMagnitude = extractClaimMagnitude(candidate.claim);
  if (
    currentMagnitude !== null &&
    candidateMagnitude !== null &&
    currentMagnitude !== candidateMagnitude
  ) {
    return candidateMagnitude > currentMagnitude ? candidate : current;
  }

  const currentSpecificity = getClaimSpecificityScore(current.claim, family);
  const candidateSpecificity = getClaimSpecificityScore(candidate.claim, family);
  if (candidateSpecificity !== currentSpecificity) {
    return candidateSpecificity > currentSpecificity ? candidate : current;
  }

  if (candidate.priority !== current.priority) {
    return candidate.priority < current.priority ? candidate : current;
  }

  const currentUpdatedAt = current.updatedAt?.getTime() ?? 0;
  const candidateUpdatedAt = candidate.updatedAt?.getTime() ?? 0;
  return candidateUpdatedAt > currentUpdatedAt ? candidate : current;
}

function suppressSupersededFactCandidates(candidates: FactCandidateInput[]) {
  const preferredByFamily = new Map<string, FactCandidateInput>();

  for (const candidate of candidates) {
    const family = getSupersessionFamily(candidate.claim);
    if (!family) continue;

    const current = preferredByFamily.get(family);
    preferredByFamily.set(
      family,
      current ? pickPreferredFactCandidate(current, candidate, family) : candidate
    );
  }

  return candidates.filter((candidate) => {
    const family = getSupersessionFamily(candidate.claim);
    if (!family) return true;
    return preferredByFamily.get(family) === candidate;
  });
}

export function makeFactCandidates(
  claims: Array<{
    claim: string;
    sourceUrl?: string;
    sourceType?: string;
    priority: number;
    updatedAt?: Date | null;
  }>
): FactCandidateInput[] {
  return claims
    .map((claim) => ({
      claim: claim.claim.trim(),
      sourceUrl: claim.sourceUrl?.trim() || "",
      sourceType: claim.sourceType?.trim() || "",
      priority: claim.priority,
      updatedAt: claim.updatedAt ?? null,
    }))
    .filter((claim) => claim.claim.length > 0);
}

export function buildFactPack(
  candidates: FactCandidateInput[],
  limit = 5
): FactPackItem[] {
  const dedupedByClaim = new Map<string, FactCandidateInput>();

  for (const candidate of candidates) {
    const key = normalizeCandidateClaim(candidate.claim);
    const current = dedupedByClaim.get(key);
    if (!current) {
      dedupedByClaim.set(key, candidate);
      continue;
    }

    const preferred =
      current.priority === candidate.priority
        ? getFactCandidateSourceRank(current.sourceType) <=
          getFactCandidateSourceRank(candidate.sourceType)
          ? current
          : candidate
        : current.priority < candidate.priority
          ? current
          : candidate;
    dedupedByClaim.set(key, preferred);
  }

  return suppressSupersededFactCandidates(Array.from(dedupedByClaim.values()))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const sourceRankDelta =
        getFactCandidateSourceRank(a.sourceType) -
        getFactCandidateSourceRank(b.sourceType);
      if (sourceRankDelta !== 0) return sourceRankDelta;
      const aUpdatedAt = a.updatedAt?.getTime() ?? 0;
      const bUpdatedAt = b.updatedAt?.getTime() ?? 0;
      return bUpdatedAt - aUpdatedAt;
    })
    .slice(0, Math.max(1, limit))
    .map((candidate) => ({
      claim: candidate.claim,
      sourceUrl: candidate.sourceUrl,
      sourceType: candidate.sourceType || undefined,
    }));
}
