import React, { useState, useEffect } from "react";

const LoadingSpinner: React.FC = () => {
  const [loadingText, setLoadingText] = useState("Loading");

  useEffect(() => {
    const texts = ["Loading", "Adding AI Magic", "Almost There..."];
    let index = 0;
    const interval = setInterval(() => {
      setLoadingText(texts[index]);
      if (index < texts.length - 1) {
        index = index + 1;
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="animate-spin rounded-full h-32 w-32 border-t-4 border-b-4 border-purple-400"></div>
      <p className="mt-4 text-lg text-gray-300">{loadingText}</p>
    </div>
  );
};

export default LoadingSpinner;
