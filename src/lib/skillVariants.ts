export function isHookBulletsStyle(style?: string) {
  return style === "hookbullets";
}

export function getWeeklyPairDraftSkill(style?: string) {
  return isHookBulletsStyle(style)
    ? "weekly-draft-pair-hookbullets"
    : "weekly-draft-pair";
}

export function getWeeklyPairRewriteSkill(style?: string) {
  return isHookBulletsStyle(style)
    ? "weekly-rewrite-pair-hookbullets"
    : "weekly-rewrite-pair";
}

export function getWeeklySlotFrameSkill() {
  return "weekly-slot-frame";
}

export function getWeeklySlotCandidateSkill(style?: string) {
  return isHookBulletsStyle(style)
    ? "weekly-slot-candidates-hookbullets"
    : "weekly-slot-candidates";
}

export function getWeeklySlotCriticSkill(style?: string) {
  return isHookBulletsStyle(style)
    ? "weekly-slot-critic-hookbullets"
    : "weekly-slot-critic";
}

export function getDirectFactPackDraftSkill(style?: string) {
  return isHookBulletsStyle(style)
    ? "direct-draft-factpack-hookbullets"
    : "direct-draft-factpack";
}

export function getDirectFactPackRewriteSkill(style?: string) {
  return isHookBulletsStyle(style)
    ? "direct-rewrite-factpack-hookbullets"
    : "direct-rewrite-factpack";
}

export function getHookedDraftSkill(style?: string) {
  return isHookBulletsStyle(style)
    ? "draft-tweet-hookbullets"
    : "draft-tweet";
}

export function getHookedCriticSkill(style?: string) {
  return isHookBulletsStyle(style) ? "critic-hookbullets" : "critic";
}

export function getOpenAIDirectDraftSkill(style?: string) {
  return isHookBulletsStyle(style)
    ? "direct-draft-openai-hookbullets"
    : "direct-draft-openai";
}
