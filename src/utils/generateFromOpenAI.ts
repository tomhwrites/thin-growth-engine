import OpenAI from "openai";
import {
  buildSharedTweetDrafterUserPrompt,
  getExemplarsForStyle,
  IMMUTABLE_CONTEXT,
  parseDraftedTweets,
  SHARED_TWEET_DRAFTER_SYSTEM_PROMPT,
} from "@/utils/agents";
import { tweetStyles } from "@/utils/tweetConfig";

// Define the types for the tweet generation request
export type GenerateTweetsRequest = {
  topic: string;
  overarchingNarrative: string;
  selectedMetrics: string[];
  tweetStyle: string;
  archetype?: string;
  contentTopic?: string;
  model?: string;
  customPrompt?: string;
};

// Interface for the response from the OpenAI tweet generation
export interface GenerateTweetsResponse {
  tweets: string[];
}

/**
 * Generates tweets using OpenAI's GPT-4o model with a two-step process:
 * 1. Gather relevant information via web search
 * 2. Use that information to generate tweets
 *
 * @param params The parameters for tweet generation
 * @param dbPrompt Optional database prompt to use
 * @returns Generated tweets
 */
export async function generateTweetsFromOpenAI(
  params: GenerateTweetsRequest
): Promise<GenerateTweetsResponse> {
  const {
    topic,
    tweetStyle,
    customPrompt,
    overarchingNarrative,
    selectedMetrics,
    archetype = params.contentTopic,
  } = params;

  console.log("Using OpenAI GPT-4o model with web search");

  // Get the selected style or default to catchphrase
  const selectedStyle =
    tweetStyles[tweetStyle as keyof typeof tweetStyles] ||
    tweetStyles.catchphrase;

  // Initialize OpenAI API client
  const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_API_SECRET!,
  });

  try {
    console.log("Fetching shared exemplars for style:", selectedStyle.name);
    const exemplarTweetsText = await getExemplarsForStyle(tweetStyle, archetype);

    // STEP 1: Gather relevant information via web search
    console.log("Step 1: Gathering relevant information via web search...");

    const searchPrompt = `I need to create tweets about ${
      customPrompt || topic
    }. 
    Please search the web for the most relevant and recent information about this topic, 
    focusing specifically on:
    
    1. Key metrics and statistics (e.g., user counts, growth percentages, market size, investments)
    2. Recent developments or announcements
    3. Industry trends and projections
    4. Comparative data points
    5. Notable achievements or milestones
    
    Organize the information in a structured format with clear sections for different aspects of the topic. 
    Include specific numbers, dates, and factual information that would be useful for creating impactful tweets.`;

    const searchResponse = await openai.responses.create({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
      input: searchPrompt,
    });

    // Extract the research information
    const researchInfo = searchResponse.output_text || "";
    console.log("Research information gathered successfully");

    console.log("Step 2: Generating tweets using shared drafter prompt...");

    const tweetGenerationPrompt = buildSharedTweetDrafterUserPrompt(
      customPrompt || topic,
      {
        insight: overarchingNarrative || customPrompt || topic,
        angle: "",
        supportingData: selectedMetrics,
      },
      { hooks: [] },
      selectedStyle.name,
      selectedStyle.description,
      exemplarTweetsText,
      archetype,
      [`Live research information:\n${researchInfo}`]
    );

    const tweetResponse = await openai.responses.create({
      model: "gpt-4.1",
      instructions: `${IMMUTABLE_CONTEXT}\n\n${SHARED_TWEET_DRAFTER_SYSTEM_PROMPT}`,
      input: tweetGenerationPrompt,
    });

    const generatedText = tweetResponse.output_text || "";
    const tweets = parseDraftedTweets(generatedText);

    return {
      tweets,
    };
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Error generating tweets with OpenAI");
  }
}
