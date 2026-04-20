"use client";

import { FiCheck, FiLoader } from "react-icons/fi";

export type Step = {
  id: string;
  label: string;
  status: "waiting" | "active" | "completed" | "error";
};

interface ProgressStepsProps {
  steps: Step[];
}

export default function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <div className="flex flex-col space-y-4 w-full">
      <h3 className="text-lg font-semibold text-gray-800 mb-2">Progress</h3>
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-start">
            <div className="relative flex items-center justify-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  step.status === "completed"
                    ? "bg-green-100 text-green-600"
                    : step.status === "active"
                    ? "bg-blue-100 text-blue-600 animate-pulse"
                    : step.status === "error"
                    ? "bg-red-100 text-red-600"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {step.status === "completed" ? (
                  <FiCheck className="w-5 h-5" />
                ) : step.status === "active" ? (
                  <FiLoader className="w-5 h-5 animate-spin" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`absolute top-8 left-4 w-0.5 h-10 ${
                    step.status === "completed"
                      ? "bg-green-400"
                      : "bg-gray-200"
                  }`}
                ></div>
              )}
            </div>
            <div className="ml-4">
              <p
                className={`text-sm font-medium ${
                  step.status === "completed"
                    ? "text-green-600"
                    : step.status === "active"
                    ? "text-blue-600"
                    : step.status === "error"
                    ? "text-red-600"
                    : "text-gray-500"
                }`}
              >
                {step.label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
