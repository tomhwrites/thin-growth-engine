"use client";
import TweetGenerator from "@/components/TweetGenerator";
import { useState } from "react";

export default function Home() {
  const [tweets, setTweets] = useState<string[]>([]);

  return (
    <div className="relative min-h-screen flex justify-center bg-black py-8">
      <div className="relative bg-white bg-opacity-10 backdrop-blur-sm rounded-xl p-8 shadow-lg w-[90%] max-w-4xl h-fit">
        <h1 className="text-3xl font-bold text-center mb-6 text-white">
          Tweet Automation Engine
        </h1>
        <TweetGenerator tweets={tweets} setTweets={setTweets} />
      </div>
    </div>
  );
}
