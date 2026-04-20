"use client";

interface HookSelectorProps {
  hooks: string[];
  selectedHook: string | null;
  onSelectHook: (hook: string) => void;
}

export default function HookSelector({
  hooks,
  selectedHook,
  onSelectHook,
}: HookSelectorProps) {
  return (
    <div className="w-full">
      <h3 className="text-xl font-semibold text-gray-800 mb-3">
        Select a Hook for Your Ad
      </h3>
      <p className="text-gray-600 mb-5">
        Choose one of the hooks below that best captures your game&apos;s
        appeal.
      </p>
      <div className="space-y-4">
        {hooks.map((hook, index) => (
          <div
            key={index}
            className={`p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
              selectedHook === hook
                ? "border-blue-500 bg-blue-50 shadow-md transform scale-[1.02]"
                : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm"
            }`}
            onClick={() => onSelectHook(hook)}
          >
            <div className="flex items-center">
              <div
                className={`w-5 h-5 rounded-full mr-3 flex-shrink-0 ${
                  selectedHook === hook
                    ? "bg-blue-500"
                    : "border-2 border-gray-300"
                }`}
              >
                {selectedHook === hook && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-white"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              <p className="text-gray-800 font-medium">&quot;{hook}&quot;</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
