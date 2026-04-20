import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Define the expected request type
interface GetPromptRequest {
  name: string;
}

// Response will use NextResponse directly

export async function GET(request: NextRequest) {
  try {
    // Get the prompt name from the URL query parameters
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json(
        { error: "Prompt name is required" },
        { status: 400 }
      );
    }

    // Find the prompt in the database
    const systemPrompt = await prisma.systemPrompts.findFirst({
      where: {
        name: name,
      },
    });

    if (!systemPrompt) {
      return NextResponse.json(
        { error: `Prompt with name '${name}' not found` },
        { status: 404 }
      );
    }

    // Return the prompt
    return NextResponse.json({
      prompt: systemPrompt.prompt,
    });
  } catch (error) {
    console.error("Error fetching prompt:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompt" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const { name } = (await request.json()) as GetPromptRequest;

    if (!name) {
      return NextResponse.json(
        { error: "Prompt name is required" },
        { status: 400 }
      );
    }

    // Find the prompt in the database
    const systemPrompt = await prisma.systemPrompts.findFirst({
      where: {
        name: name,
      },
    });

    if (!systemPrompt) {
      return NextResponse.json(
        { error: `Prompt with name '${name}' not found` },
        { status: 404 }
      );
    }

    // Return the prompt
    return NextResponse.json({
      prompt: systemPrompt.prompt,
    });
  } catch (error) {
    console.error("Error fetching prompt:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompt" },
      { status: 500 }
    );
  }
}
