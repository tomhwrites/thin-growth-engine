export type TweetValidationIssue = {
  index: number;
  reason: string;
};

const TIME_QUALIFIER_PATTERNS = [
  /\b(?:in|within)\s+(?:under|over|less than|more than)\s+(?:a|\d+\+?)\s+(?:day|days|week|weeks|month|months|year|years)\b/gi,
  /\b(?:under|over|less than|more than)\s+(?:a|\d+\+?)\s+(?:day|days|week|weeks|month|months|year|years)\b/gi,
  /<\s*\d+\+?\s*(?:day|days|week|weeks|month|months|year|years)\b/gi,
  /\bsince launch\b/gi,
];

const FORBIDDEN_TERM_PATTERNS = [
  /\bcrypto\b/i,
  /\bimx\b/i,
  /\bnfts?\b/i,
  /\bblockchain\b/i,
  /\bgods\s+unchained\b/i,
];

const STALE_IMMUTABLE_STAT_PATTERNS = [
  /\b4\s*(?:m|million)\s+(?:passport\s+)?(?:users?|signups?|sign-ups)\b/i,
  /\bpassport\s+(?:hit|has|reached|grew\s+to)?\s*4\s*(?:m|million)\b/i,
  /\b500\+?\s+(?:live\s+)?games\b/i,
];

const SIGNING_PREANNOUNCEMENT_PRODUCT_PATTERNS = [
  /\bpassport\b/i,
  /\bzkevm\b/i,
  /\bwallets?\b/i,
  /\bseed phrases?\b/i,
  /\bgas(?:-|\s)?free\b/i,
  /\bgoogle\s+login\b/i,
  /\battribution\b/i,
  /\b70%\s+(?:of\s+)?(?:the\s+)?(?:market|web3 games|games)\b/i,
  /\b\d+\+?\s+(?:total\s+)?games\s+signed\b/i,
];

const SIGNING_PREANNOUNCEMENT_OPENING_PATTERNS = [
  /^\s*immutable\s+just\s+signed\b/i,
  /^\s*tomorrow\s+we\s+announce\b/i,
  /^\s*tomorrow\s+immutable\s+announces\b/i,
  /^\s*we\s+just\s+signed\b/i,
];

export function normalizeValidationText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasConcreteProof(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (/\$?\d[\d,.]*\s*(?:%|k|m|b|million|billion|x|bps?)?\b/i.test(trimmed)) {
    return true;
  }

  if (
    /\b(?:q[1-4]|20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }

  if (
    /\b(?:mau|dau|arr|revenue|fee|fees|cost|costs|users?|players?|downloads?|signups?|sign-ups|wishlist|wishlists|funding|retention|conversion|transactions?|volume)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }

  const capitalizedTerms = trimmed.match(/\b[A-Z][a-zA-Z0-9&]*(?:\s+[A-Z][a-zA-Z0-9&]*)*\b/g) ?? [];
  return capitalizedTerms.some(
    (term) => !/^(That|This|It|The|A|An|When|If|Tomorrow|Immutable)$/.test(term)
  );
}

function hasHardProof(value: string) {
  const trimmed = value.trim();
  if (/\$?\d[\d,.]*\s*(?:%|k|m|b|million|billion|x|bps?)?\b/i.test(trimmed)) {
    return true;
  }
  if (
    /\b(?:q[1-4]|20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }
  const capitalizedTerms = trimmed.match(/\b[A-Z][a-zA-Z0-9&]*(?:\s+[A-Z][a-zA-Z0-9&]*)*\b/g) ?? [];
  return capitalizedTerms.some(
    (term) => !/^(That|This|It|The|A|An|When|If|Tomorrow|Immutable|UA|LTV)$/.test(term)
  );
}

function getAbstractContrastIssue(tweet: string) {
  const checks: Array<[string, string]> = [];
  const normalized = tweet.replace(/\s+/g, " ");

  for (const match of normalized.matchAll(/\bnot\s+([^.!?;]{1,100}?)\s+but\s+([^.!?;]{1,100})/gi)) {
    checks.push([match[1], match[2]]);
  }

  for (const match of normalized.matchAll(/([^.!?;]{1,120}?),\s+not\s+([^.!?;]{1,100})/gi)) {
    checks.push([match[1], match[2]]);
  }

  for (const match of normalized.matchAll(/\b(?:isn'?t|is\s+not|wasn'?t|was\s+not)\s+([^.!?;]{1,100}?)\.\s+(?:it|this|that)\s+(?:is|'s|was)\s+([^.!?;]{1,100})/gi)) {
    checks.push([match[1], match[2]]);
  }

  for (const match of normalized.matchAll(/\b(?:this|that|it)\s+(?:isn'?t|is\s+not|wasn'?t|was\s+not)\s+([^.!?;]{1,100}?)\.\s+(?:it|this|that)(?:'s|\s+is|\s+was)\s+([^.!?;]{1,100})/gi)) {
    checks.push([match[1], match[2]]);
  }

  for (const match of normalized.matchAll(/\b(?:the\s+answer|this|that|it)\s+(?:isn'?t|is\s+not|wasn'?t|was\s+not)\s+([^—–.!?;]{1,100}?)\s*[—–-]\s+(?:it|this|that)(?:'s|\s+is|\s+was)\s+([^.!?;]{1,100})/gi)) {
    checks.push([match[1], match[2]]);
  }

  for (const match of normalized.matchAll(/\b(?:instead of|rather than)\s+([^.!?;]{1,100}?),?\s+(?:it\s+)?(?:is|'s|means|use|uses|build|builds)?\s*([^.!?;]{1,100})/gi)) {
    checks.push([match[1], match[2]]);
  }

  for (const match of normalized.matchAll(/([^.!?;]{1,120}?)\s+(?:while|whereas)\s+([^.!?;]{1,120})/gi)) {
    checks.push([match[1], match[2]]);
  }

  return checks.some(([left, right]) => !hasConcreteProof(left) || !hasConcreteProof(right))
    ? "Tweet contains abstract contrast without concrete proof on both sides"
    : null;
}

function getVagueProformIssue(tweet: string) {
  const sentences = tweet
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const match = sentence.match(/^(?:that|this|that's|this is|that is)\b\s*(.*)/i);
    if (!match) continue;

    const firstPhrase = match[1].split(/\s+/).slice(0, 6).join(" ");
    if (!hasConcreteProof(firstPhrase)) {
      return "Tweet uses vague sentence-initial This/That as the subject";
    }
  }

  return null;
}

function getVagueDemonstrativeIssue(tweet: string) {
  const vagueObjectPattern =
    /\b(?:ends?|proves?|solves?|fixes?|closes?|changes?|shows?|does|means|explains|validates)\s+(?:that|this|it)\b/i;
  if (vagueObjectPattern.test(tweet)) {
    return "Tweet uses a vague this/that/it reference instead of naming the noun";
  }

  if (/\b(?:those|these)\s+(?:two\s+)?(?:numbers|metrics|things|signals|proof points|data points)\b/i.test(tweet)) {
    return "Tweet uses vague demonstrative phrasing instead of naming the proof";
  }

  return null;
}

function getStaccatoAbstractIssue(tweet: string, tweetStyle: string) {
  if (tweetStyle === "hookbullets") return null;

  const sentences = tweet
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  let abstractShortRun = 0;
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    const isShort = words.length > 2 && words.length <= 9;
    const isAbstract = isShort && !hasHardProof(sentence);

    if (isAbstract) {
      abstractShortRun += 1;
      if (abstractShortRun >= 2) {
        return "Tweet uses staccato abstract short sentences without proof";
      }
    } else {
      abstractShortRun = 0;
    }
  }

  return null;
}

function collectNumberTokens(text: string) {
  return Array.from(
    new Set(
      (text.match(/\$?\d[\d,.%+kmb<>]*/gi) ?? [])
        .map((token) => token.replace(/[.,]+$/, "").trim())
        .filter(Boolean)
    )
  );
}

function collectTimeQualifiers(text: string) {
  const matches = new Set<string>();

  for (const pattern of TIME_QUALIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const token = match[0]?.trim();
      if (token) matches.add(token);
    }
  }

  return Array.from(matches);
}

function findOrphanedTimeQualifierLine(tweet: string) {
  const lines = tweet
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith("•")) continue;

    const normalized = normalizeValidationText(line);
    const withoutPunctuation = normalized.replace(/[.!?]+$/, "");

    const matchingQualifier = TIME_QUALIFIER_PATTERNS.find((pattern) => {
      pattern.lastIndex = 0;
      const match = withoutPunctuation.match(pattern)?.[0] ?? "";
      return normalizeValidationText(match) === withoutPunctuation;
    });

    if (matchingQualifier) return line;
  }

  return null;
}

function validateHookBulletsStructure(tweet: string, expectedHook?: string) {
  const lines = tweet
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLines = lines.filter((line) => line.startsWith("•"));
  if (lines.length !== 4 || bulletLines.length !== 3) {
    return "hookbullets tweets must be 1 hook line plus exactly 3 bullets";
  }

  if (lines[0].startsWith("•")) {
    return "hookbullets tweets must begin with a hook line before the bullets";
  }

  if (expectedHook && lines[0] !== expectedHook.trim()) {
    return "hookbullets tweets must keep the hook as the exact first line";
  }

  if (lines.slice(1).some((line) => !line.startsWith("•"))) {
    return "hookbullets tweets cannot include a closer after the 3 bullets";
  }

  const longBullet = bulletLines.find((line) => {
    const wordCount = line
      .replace(/^•\s*/, "")
      .split(/\s+/)
      .filter(Boolean).length;
    return wordCount > 10;
  });
  if (longBullet) {
    return `hookbullets bullets must stay compact (max 10 words): "${longBullet}"`;
  }

  return null;
}

export function buildGroundingHaystack(items: string[]) {
  return normalizeValidationText(items.join(" "));
}

export function validateTweetText(input: {
  tweet: string;
  tweetStyle: string;
  haystack: string;
  expectedHook?: string;
  archetype?: string;
}): string[] {
  const issues: string[] = [];
  const trimmed = input.tweet.trim();

  if (!trimmed) return ["Tweet is empty"];

  if (trimmed.length > 280) {
    issues.push(`Tweet exceeds 280 characters (${trimmed.length})`);
  }

  if (input.expectedHook && !trimmed.startsWith(input.expectedHook.trim())) {
    issues.push("Tweet does not preserve the hook as its opening text");
  }

  if (input.tweetStyle === "hookbullets") {
    const structureIssue = validateHookBulletsStructure(
      trimmed,
      input.expectedHook
    );
    if (structureIssue) issues.push(structureIssue);
  }

  const abstractContrastIssue = getAbstractContrastIssue(trimmed);
  if (abstractContrastIssue) issues.push(abstractContrastIssue);

  const vagueProformIssue = getVagueProformIssue(trimmed);
  if (vagueProformIssue) issues.push(vagueProformIssue);

  const vagueDemonstrativeIssue = getVagueDemonstrativeIssue(trimmed);
  if (vagueDemonstrativeIssue) issues.push(vagueDemonstrativeIssue);

  const staccatoAbstractIssue = getStaccatoAbstractIssue(
    trimmed,
    input.tweetStyle
  );
  if (staccatoAbstractIssue) issues.push(staccatoAbstractIssue);

  if (FORBIDDEN_TERM_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    issues.push("Tweet contains a forbidden tweet-voice term");
  }

  if (/[—–]/.test(trimmed)) {
    issues.push("Tweet contains an em dash or en dash");
  }

  if (STALE_IMMUTABLE_STAT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    issues.push("Tweet contains a known stale Immutable stat");
  }

  if (input.archetype === "Signing Preannouncement") {
    if (
      SIGNING_PREANNOUNCEMENT_PRODUCT_PATTERNS.some((pattern) =>
        pattern.test(trimmed)
      )
    ) {
      issues.push(
        "Signing Preannouncement cannot use generic Immutable product stats"
      );
    }

    if (
      !SIGNING_PREANNOUNCEMENT_OPENING_PATTERNS.some((pattern) =>
        pattern.test(trimmed)
      )
    ) {
      issues.push(
        "Signing Preannouncement must use a signed/announce teaser opening"
      );
    }
  }

  const groundingTokens = [
    ...collectNumberTokens(trimmed),
    ...collectTimeQualifiers(trimmed),
  ];
  const uniqueTokens = Array.from(
    new Set(groundingTokens.map(normalizeValidationText))
  );

  for (const token of uniqueTokens) {
    if (!token) continue;
    if (!input.haystack.includes(token)) {
      issues.push(`Grounded token "${token}" was not found in grounded inputs`);
    }
  }

  const orphanedTimeLine = findOrphanedTimeQualifierLine(trimmed);
  if (orphanedTimeLine) {
    issues.push(
      `Standalone time-qualifier line "${orphanedTimeLine}" is not allowed`
    );
  }

  return issues;
}
