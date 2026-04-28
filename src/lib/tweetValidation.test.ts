import { describe, expect, it } from "vitest";
import { buildGroundingHaystack, validateTweetText } from "./tweetValidation";

describe("validateTweetText", () => {
  it("rejects ungrounded numbers and abstract contrast", () => {
    const issues = validateTweetText({
      tweet:
        "web3 gaming is not a speculative cycle anymore. it is compounding at 22% CAGR.",
      tweetStyle: "shorttake",
      haystack: buildGroundingHaystack(["Precedence projects 19% CAGR."]),
    });

    expect(issues).toContain(
      "Tweet contains abstract contrast without concrete proof on both sides"
    );
    expect(issues).toContain(
      'Grounded token "22%" was not found in grounded inputs'
    );
  });

  it("enforces hookbullets shape and hook preservation", () => {
    const issues = validateTweetText({
      tweet: "The hook changed\n• one\n• two\n• three",
      tweetStyle: "hookbullets",
      haystack: buildGroundingHaystack(["one two three"]),
      expectedHook: "The original hook",
    });

    expect(issues).toContain(
      "Tweet does not preserve the hook as its opening text"
    );
    expect(issues).toContain(
      "hookbullets tweets must keep the hook as the exact first line"
    );
  });

  it("accepts a compact grounded hookbullets draft", () => {
    const tweet = "19M assets minted this year\n• proof of demand\n• infra gets tested\n• wallets must disappear";

    expect(
      validateTweetText({
        tweet,
        tweetStyle: "hookbullets",
        haystack: buildGroundingHaystack([
          "19M assets minted this year",
          "proof of demand",
          "infra gets tested",
          "wallets must disappear",
        ]),
        expectedHook: "19M assets minted this year",
      })
    ).toEqual([]);
  });

  it("rejects abstract contrast variants from copy review", () => {
    const haystack = buildGroundingHaystack([
      "Studios move existing games for infrastructure reasons.",
      "Ubisoft moved an existing game.",
    ]);

    expect(
      validateTweetText({
        tweet:
          "When studios move existing games, it's an infrastructure decision, not a hype bet.",
        tweetStyle: "comparison",
        haystack,
      })
    ).toContain(
      "Tweet contains abstract contrast without concrete proof on both sides"
    );

    expect(
      validateTweetText({
        tweet:
          "This isn't a web3 studio going mainstream. It's a mainstream studio removing the onboarding barrier.",
        tweetStyle: "comparison",
        haystack,
      })
    ).toContain(
      "Tweet contains abstract contrast without concrete proof on both sides"
    );
  });

  it("allows concrete contrast with proof on both sides", () => {
    expect(
      validateTweetText({
        tweet: "Mobile stores charge a 30% fee. Stablecoins charge ~1%.",
        tweetStyle: "comparison",
        haystack: buildGroundingHaystack([
          "Mobile stores charge a 30% fee",
          "Stablecoins charge ~1%",
        ]),
      })
    ).toEqual([]);
  });

  it("rejects vague sentence-initial This/That subject phrasing", () => {
    expect(
      validateTweetText({
        tweet: "That gap is what pulls studios toward web3 infrastructure.",
        tweetStyle: "shorttake",
        haystack: buildGroundingHaystack(["Studios evaluate infrastructure."]),
      })
    ).toContain("Tweet uses vague sentence-initial This/That as the subject");
  });

  it("allows sentence-initial This/That when it names concrete proof", () => {
    expect(
      validateTweetText({
        tweet: "That 30% fee gap changes the payment math.",
        tweetStyle: "shorttake",
        haystack: buildGroundingHaystack(["30% fee gap"]),
      })
    ).toEqual([]);
  });

  it("rejects em dashes and abstract answer reframes", () => {
    const issues = validateTweetText({
      tweet:
        "The answer isn't to complain about it — it's to build reward structures that make repeat play more valuable.",
      tweetStyle: "multiparagraph",
      haystack: buildGroundingHaystack(["repeat play", "reward structures"]),
    });

    expect(issues).toContain("Tweet contains an em dash or en dash");
    expect(issues).toContain(
      "Tweet contains abstract contrast without concrete proof on both sides"
    );
  });

  it("rejects known stale Immutable boilerplate stats", () => {
    const issues = validateTweetText({
      tweet: "4 million Passport users. 500+ live games.",
      tweetStyle: "stackedlines",
      haystack: buildGroundingHaystack([
        "4 million Passport users",
        "500+ live games",
      ]),
    });

    expect(issues).toContain("Tweet contains a known stale Immutable stat");
  });

  it("restricts Signing Preannouncement to game-signing teaser copy", () => {
    const bad = validateTweetText({
      tweet:
        "70% of Passport users sign up via Google. No seed phrase. No friction wall.",
      tweetStyle: "oneliner",
      haystack: buildGroundingHaystack([
        "70% of Passport users sign up via Google",
      ]),
      archetype: "Signing Preannouncement",
    });

    expect(bad).toContain(
      "Signing Preannouncement cannot use generic Immutable product stats"
    );
    expect(bad).toContain(
      "Signing Preannouncement must use a signed/announce teaser opening"
    );

    const good = validateTweetText({
      tweet: "Tomorrow we announce a game with 36M MAU.",
      tweetStyle: "oneliner",
      haystack: buildGroundingHaystack(["36M MAU"]),
      archetype: "Signing Preannouncement",
    });

    expect(good).toEqual([]);
  });

  it("rejects Gods Unchained references", () => {
    expect(
      validateTweetText({
        tweet: "Gods Unchained retention proves the point.",
        tweetStyle: "oneliner",
        haystack: buildGroundingHaystack(["Gods Unchained retention"]),
      })
    ).toContain("Tweet contains a forbidden tweet-voice term");
  });

  it("rejects vague demonstrative references beyond sentence openers", () => {
    expect(
      validateTweetText({
        tweet:
          "Studios have been guessing which channel actually drives installs. Audience Hub Surface Analytics ends that.",
        tweetStyle: "multiparagraph",
        haystack: buildGroundingHaystack([
          "Audience Hub Surface Analytics",
          "channel installs",
        ]),
      })
    ).toContain(
      "Tweet uses a vague this/that/it reference instead of naming the noun"
    );

    expect(
      validateTweetText({
        tweet:
          "The gap between those two numbers is where LTV models get rebuilt.",
        tweetStyle: "multiparagraph",
        haystack: buildGroundingHaystack(["LTV models"]),
      })
    ).toContain("Tweet uses vague demonstrative phrasing instead of naming the proof");
  });

  it("rejects staccato abstract short-sentence chains outside bullets", () => {
    expect(
      validateTweetText({
        tweet: "The data layer was always the problem. UA budgets just masked it.",
        tweetStyle: "multiparagraph",
        haystack: buildGroundingHaystack(["UA budgets", "data layer"]),
      })
    ).toContain("Tweet uses staccato abstract short sentences without proof");

    expect(
      validateTweetText({
        tweet:
          "50.4B mobile downloads last year\n• 30% store fees\n• 1% stablecoin fees\n• faster settlement",
        tweetStyle: "hookbullets",
        haystack: buildGroundingHaystack([
          "50.4B mobile downloads last year",
          "30% store fees",
          "1% stablecoin fees",
          "faster settlement",
        ]),
        expectedHook: "50.4B mobile downloads last year",
      })
    ).toEqual([]);
  });
});
