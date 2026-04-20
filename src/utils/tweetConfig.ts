export interface TweetStyle {
  name: string;
  example: string;
  description: string;
}

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
    description: `An opening hook followed a new line and then 3-4 concise bullet points using the bullet point character '•'. No rhetorical questions. Prioritise data driven metrics. The hook should communicate value by either highlighting a key metric or invoking curiosity in the reader. Try to be attention grabbing in the hook by incoporating either a bold metric/claim, something very recent (e.g. just, now, soon, today, tomorrow, this week), and be high in modality. Try have the hook provide more value upfront by using a specific data point. Do NOT use hyphen dashes.`,
  },
  multiparagraph: {
    name: "Multiparagraph Tweet",
    example:
      'Gaming is bigger than music, movies, and TV combined.\n\nIt\'s compounding 10% year on year.\n\nThe $100bn a year spent "renting" items is going to turn into a trillion dollar ownable economy.\n\nAll of it will be built on web3.',
    description: "Multiple short paragraphs building a narrative",
  },
};

export type ContentTopic =
  | "Product"
  | "Web3 gaming = Future"
  | "Ecosystem"
  | "Thought leadership"
  | "Partner Games"
  | "Personal"
  | "Macro Commentary"
  | "Social proof";

export const CONTENT_TOPIC_ANY = "";

export const contentTopicOptions: { value: ContentTopic | ""; label: string }[] = [
  { value: CONTENT_TOPIC_ANY, label: "Any (no archetype filter)" },
  { value: "Product", label: "Product" },
  { value: "Web3 gaming = Future", label: "Web3 gaming = Future" },
  { value: "Ecosystem", label: "Ecosystem" },
  { value: "Thought leadership", label: "Thought leadership" },
  { value: "Partner Games", label: "Partner Games" },
  { value: "Personal", label: "Personal" },
  { value: "Macro Commentary", label: "Macro Commentary" },
  { value: "Social proof", label: "Social proof" },
];

export const weeklyContentTopicOptions: { value: ContentTopic; label: string }[] =
  contentTopicOptions.filter(
    (option): option is { value: ContentTopic; label: string } =>
      option.value !== CONTENT_TOPIC_ANY
  );
