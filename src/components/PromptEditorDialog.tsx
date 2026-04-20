"use client";

import { useState, useEffect } from "react";
import { FiEdit } from "react-icons/fi";
import { createPortal } from "react-dom";

interface PromptEditorDialogProps {
  promptName: string;
  buttonLabel?: string;
  buttonClassName?: string;
  dialogTitle?: string;
  onPromptUpdated?: () => void;
}

export default function PromptEditorDialog({
  promptName,
  buttonLabel = "Edit Prompt",
  buttonClassName = "",
  dialogTitle,
  onPromptUpdated,
}: PromptEditorDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [promptContent, setPromptContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPromptContent = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/getPrompts?name=${promptName}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch prompt");
      }

      const data = await response.json();
      setPromptContent(data.prompt || "");
    } catch (error) {
      console.error("Error fetching prompt:", error);
      console.error("Failed to load prompt content");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch the prompt content when the dialog is opened
  useEffect(() => {
    if (isOpen) {
      fetchPromptContent();
    } /* eslint-disable-next-line */
  }, [isOpen]);

  const handleSavePrompt = async () => {
    try {
      setIsSaving(true);
      const response = await fetch("/api/updatePrompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: promptName,
          prompt: promptContent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update prompt");
      }

      const data = await response.json();
      console.log(data.message || "Prompt updated successfully");
      setIsOpen(false);

      // Call the onPromptUpdated callback if provided
      if (onPromptUpdated) {
        onPromptUpdated();
      }
    } catch (error) {
      console.error("Error saving prompt:", error);
      console.error("Failed to save prompt");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        className={`inline-flex items-center px-3 py-1.5 border border-gray-500 rounded-md text-sm text-black/70 bg-white/30 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 ${buttonClassName} duration-200`}
        onClick={() => setIsOpen(true)}
      >
        <FiEdit className="mr-2 h-4 w-4" />
        {buttonLabel}
      </button>

      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
              {/* Dialog Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  {dialogTitle || `Edit ${promptName} Prompt`}
                </h3>
              </div>

              {/* Dialog Content */}
              <div className="px-6 py-4">
                {isLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700"></div>
                  </div>
                ) : (
                  <textarea
                    value={promptContent}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setPromptContent(e.target.value)
                    }
                    className="w-full min-h-[300px] p-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter prompt content here..."
                  />
                )}
              </div>

              {/* Dialog Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className={`px-4 py-2 rounded-md text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 ${
                    isLoading || isSaving ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  onClick={handleSavePrompt}
                  disabled={isLoading || isSaving}
                >
                  {isSaving ? (
                    <>
                      <div className="inline-block mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-b-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
