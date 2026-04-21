export function parseDelimitedTweets(raw: string): string[] {
  return raw
    .split("||")
    .map((tweet) => tweet.trim())
    .filter((tweet) => tweet.length > 0);
}
