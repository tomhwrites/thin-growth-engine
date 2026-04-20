import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Define the expected request type
interface UpdatePromptRequest {
  name: string;
  prompt: string;
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const { name, prompt } = (await request.json()) as UpdatePromptRequest;

    // Validate input
    if (!name) {
      return NextResponse.json(
        { success: false, error: "Prompt name is required" },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt content is required" },
        { status: 400 }
      );
    }

    // Check if the prompt already exists
    const existingPrompt = await prisma.systemPrompts.findFirst({
      where: {
        name: name,
      },
    });

    let updatedPrompt;
    let message;

    if (existingPrompt) {
      // Update existing prompt
      updatedPrompt = await prisma.systemPrompts.update({
        where: {
          id: existingPrompt.id,
        },
        data: {
          prompt: prompt,
        },
      });
      message = `Prompt '${name}' updated successfully`;
    } else {
      // Create new prompt
      updatedPrompt = await prisma.systemPrompts.create({
        data: {
          name: name,
          prompt: prompt,
        },
      });
      message = `Prompt '${name}' created successfully`;
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: message,
      prompt: updatedPrompt,
    });
  } catch (error) {
    console.error("Error updating prompt:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update prompt" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  // PUT method is handled the same way as POST
  return POST(request);
}
