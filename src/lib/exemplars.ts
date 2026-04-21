import { prisma } from "@/lib/prisma";

export type ExemplarSets = {
  formExemplars: string;
  archetypeExemplars: string;
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

export async function getExemplarsForStyle(
  tweetStyle: string,
  archetype?: string
): Promise<ExemplarSets> {
  const dbStyle = dbStyleMapping[tweetStyle] || dbStyleMapping.oneliner;

  const formTweets = await prisma.exemplarTweets.findMany({
    select: {
      tweet_text: true,
      archetype: true,
      hook_value: true,
    },
    where: { tweet_style: dbStyle, archived: false },
    take: 5,
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
    take: 5,
  });

  return {
    formExemplars: formatExemplarRows(formTweets),
    archetypeExemplars: formatExemplarRows(archetypeTweets),
  };
}

export async function getHookExemplars(
  hookType: string,
  archetype?: string
): Promise<string> {
  let hookTweets: ExemplarRow[] = [];

  if (archetype) {
    hookTweets = await prisma.exemplarTweets.findMany({
      select: { tweet_text: true, archetype: true, hook_value: true },
      where: { hook_value: hookType, archetype, archived: false },
      take: 5,
    });
  }

  if (hookTweets.length < 5) {
    const remaining = 5 - hookTweets.length;
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
