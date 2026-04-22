export interface TweetStyle {
  name: string;
  example: string;
  description: string;
}

export type HookType =
  | "Thesis statement"
  | "Curiosity Gap"
  | "Short"
  | "Long"
  | "Data";

export const hookTypeDescriptions: Record<HookType, string> = {
  "Thesis statement": "A direct conviction-led claim that states the core point up front.",
  "Curiosity Gap": "An open loop that makes the reader want the next sentence.",
  Short: "A blunt, compact opening with very few words.",
  Long: "A more developed opening line that carries extra framing or texture.",
  Data: "A hook led by a specific grounded number, metric, or proof point.",
};

export const hookTypeOptions: { value: HookType; label: string; description: string }[] = [
  {
    value: "Thesis statement",
    label: "Thesis statement",
    description: hookTypeDescriptions["Thesis statement"],
  },
  {
    value: "Curiosity Gap",
    label: "Curiosity Gap",
    description: hookTypeDescriptions["Curiosity Gap"],
  },
  {
    value: "Short",
    label: "Short",
    description: hookTypeDescriptions.Short,
  },
  {
    value: "Long",
    label: "Long",
    description: hookTypeDescriptions.Long,
  },
  {
    value: "Data",
    label: "Data",
    description: hookTypeDescriptions.Data,
  },
];

export const tweetStyles: Record<string, TweetStyle> = {
  catchphrase: {
    name: "Catch Phrase Tweet",
    example: "2025 is for immutable",
    description: "Short, memorable phrase that captures attention",
  },
  oneliner: {
    name: "One Liner Statement Tweet",
    example: "incredible how many of these predictions cobie absolutely nailed",
    description: "Single impactful statement that stands alone",
  },
  causeeffect: {
    name: "Cause and Effect 2 Liner Tweet",
    example:
      "The next 100 million users will come from gaming. One breakout web3 game will triple the global crypto DAU overnight.",
    description: "Shows relationship between two connected ideas",
  },
  comparison: {
    name: "Comparison Tweet",
    example:
      "the chatgpt launch 26 months ago was one of the craziest viral moments i'd ever seen, and we added one million users in five days.",
    description: "Contrasts two different ideas or timeframes",
  },
  parallelism: {
    name: "Parallelism Tweet",
    example:
      "It took us 6 years to partner with our first multi-billion dollar company. Another year to land our second. 8 months to get our third.",
    description: "Uses similar structure to emphasize a pattern",
  },
  hookbullets: {
    name: "Hook and Bullet Points Tweet",
    example:
      "2021 was the craziest year of our lives.\n\n- Axie holders grew by %10,363\n- AXS staking launch\n- Ronin mainnet launch\n- Katana launch (1.2 B liquidity & 20,000+ Daily traders)\n- Axie community treasury: 2 B + in value (52,000 ETH + 21 M AXS)\n\n2022 we'll shock the world (again).",
    description:
      "An opening hook followed by exactly 3 concise bullet points using the bullet point character '•'. Prioritise concrete metrics and proof points. No closer. Do NOT use hyphen dashes.",
  },
  multiparagraph: {
    name: "Multiparagraph Tweet",
    example:
      'Gaming is bigger than music, movies, and TV combined.\n\nIt\'s compounding 10% year on year.\n\nThe $100bn a year spent "renting" items is going to turn into a trillion dollar ownable economy.\n\nAll of it will be built on web3.',
    description: "Multiple short paragraphs building a narrative",
  },
  bigpara: {
    name: "Big Paragraph Tweet",
    example:
      "Most game studios still think distribution, payments, and identity are separate problems. They are not. The next winning stack will treat them as one growth system so every campaign, purchase, and player action compounds into better targeting, attribution, and monetisation.",
    description:
      "One larger paragraph that develops a fuller argument without breaking into multiple short paragraphs or bullets.",
  },
  stackedlines: {
    name: "Stacked Lines Tweet",
    example:
      "growth got harder\nidentity got fragmented\npayments stayed expensive\n\nthat is exactly why web3 gaming infrastructure is becoming inevitable",
    description:
      "A sequence of short stacked lines where each line adds momentum before landing the payoff.",
  },
};

export type Archetype =
  | "Payments"
  | "Identity / Attribution"
  | "New combined Web3 thesis"
  | "Product Launch / Update"
  | "Partner Game Announcement"
  | "Partner Traction / Proof Point"
  | "Ecosystem Traction"
  | "Web2 will become Web3"
  | "Macro trends / Regulation"
  | "Vision / Industry Thesis"
  | "Signing Preannouncement"
  | "Mobile gaming"
  | "AI gaming"
  | "Community engagement"
  | "Web3 gaming = Future";

export const ANY_ARCHETYPE = "";

export const archetypeOptions: { value: Archetype | ""; label: string }[] = [
  { value: ANY_ARCHETYPE, label: "Any (no archetype filter)" },
  { value: "Payments", label: "Payments" },
  { value: "Identity / Attribution", label: "Identity / Attribution" },
  { value: "New combined Web3 thesis", label: "New combined Web3 thesis" },
  { value: "Product Launch / Update", label: "Product Launch / Update" },
  { value: "Partner Game Announcement", label: "Partner Game Announcement" },
  { value: "Partner Traction / Proof Point", label: "Partner Traction / Proof Point" },
  { value: "Ecosystem Traction", label: "Ecosystem Traction" },
  { value: "Web2 will become Web3", label: "Web2 will become Web3" },
  { value: "Macro trends / Regulation", label: "Macro trends / Regulation" },
  { value: "Vision / Industry Thesis", label: "Vision / Industry Thesis" },
  { value: "Signing Preannouncement", label: "Signing Preannouncement" },
  { value: "Mobile gaming", label: "Mobile gaming" },
  { value: "AI gaming", label: "AI gaming" },
  { value: "Community engagement", label: "Community engagement" },
  { value: "Web3 gaming = Future", label: "Web3 gaming = Future" },
];

export const weeklyArchetypeOptions: { value: Archetype; label: string }[] =
  archetypeOptions.filter(
    (option): option is { value: Archetype; label: string } =>
      option.value !== ANY_ARCHETYPE
  );
