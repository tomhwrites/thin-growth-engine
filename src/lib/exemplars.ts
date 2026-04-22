import { prisma } from "@/lib/prisma";

export type ExemplarSets = {
  formExemplars: string;
  archetypeExemplars: string;
};

type ExemplarLimitOptions = {
  formLimit?: number;
  archetypeLimit?: number;
};

export const dbStyleMapping: Record<string, string> = {
  multiparagraph: "Multiple paras",
  bigpara: "Big para",
  stackedlines: "Stacked lines",
  hookbullets: "Hook + list",
  causeeffect: "Cause + effect 2 liner",
  oneliner: "One liner",
  parallelism: "Parallelism",
  comparison: "Comparison",
  catchphrase: "One liner",
};

type ExemplarRow = {
  tweet_text: string;
  archetype: string;
  hook_value: string;
};

function formatExemplarRows(rows: ExemplarRow[]): string {
  return rows
    .map(
      (tweet, index) =>
        `Example ${index + 1} (Archetype: ${tweet.archetype}; Hook type: ${
          tweet.hook_value || "Unspecified"
        }):\n"${tweet.tweet_text}"`
    )
    .join("\n\n");
}

function clampExemplarLimit(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(10, Math.round(value!)));
}

export async function getExemplarsForStyle(
  tweetStyle: string,
  archetype?: string,
  limits: ExemplarLimitOptions = {}
): Promise<ExemplarSets> {
  const dbStyle = dbStyleMapping[tweetStyle] || dbStyleMapping.oneliner;
  const formLimit = clampExemplarLimit(limits.formLimit, 5);
  const archetypeLimit = clampExemplarLimit(limits.archetypeLimit, 5);

  const formTweets = await prisma.exemplarTweets.findMany({
    select: {
      tweet_text: true,
      archetype: true,
      hook_value: true,
    },
    where: { tweet_style: dbStyle, archived: false },
    take: formLimit,
  });

  if (!archetype) {
    return {
      formExemplars: formatExemplarRows(formTweets),
      archetypeExemplars: "",
    };
  }

  const archetypeTweets = await prisma.exemplarTweets.findMany({
    select: {
      tweet_text: true,
      archetype: true,
      hook_value: true,
    },
    where: { archetype, archived: false },
    take: archetypeLimit,
  });

  return {
    formExemplars: formatExemplarRows(formTweets),
    archetypeExemplars: formatExemplarRows(archetypeTweets),
  };
}

export async function getHookExemplars(
  hookType: string,
  archetype?: string,
  limit = 5
): Promise<string> {
  const take = clampExemplarLimit(limit, 5);
  let hookTweets: ExemplarRow[] = [];

  if (archetype) {
    hookTweets = await prisma.exemplarTweets.findMany({
      select: { tweet_text: true, archetype: true, hook_value: true },
      where: { hook_value: hookType, archetype, archived: false },
      take,
    });
  }

  if (hookTweets.length < take) {
    const remaining = take - hookTweets.length;
    const extra = await prisma.exemplarTweets.findMany({
      select: { tweet_text: true, archetype: true, hook_value: true },
      where: {
        hook_value: hookType,
        archived: false,
        ...(archetype ? { NOT: { archetype } } : {}),
      },
      take: remaining,
    });
    hookTweets = [...hookTweets, ...extra];
  }

  return formatExemplarRows(hookTweets);
}
