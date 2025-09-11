import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { neon } from '@neondatabase/serverless';

import { ToolCall, Message, ChatCompletion, ChatCompletionTool, ChatCompletionRequestBody } from '@/app/types/chatCompletions';
import { getChatHistory } from '@/app/api/transcribe/route';
import { redis } from '@/app/lib/redis';
import { calculateMessagesHash } from '@/app/lib/messageHash';
const sql = neon(process.env.DATABASE_URL!);

const getOpenRouterCompletion = async (body: ChatCompletionRequestBody): Promise<ChatCompletion> => {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return data as ChatCompletion;
}

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "start_timer",
      description: "Starts a countdown timer for a set number of minutes",
      parameters: {
        type: "object",
        properties: {
          minutes: {
            type: "number",
            description: "the number of minutes the timer should run",
          },
          seconds: {
            type: "number",
            description: "if the user wants a whole number of minutes set to 0 otherwise if the user wants a timer with more precision, eg two and a half minute, then set to the relevant number of seconds",
          },
          label: {
            type: "string",
            description: "make a short label based on what the user described, if the user gave no info just write Timer"
          }
        },
        required: ["minutes", "seconds", "label"], 
      },
    },
  },
];

export const getCompletion = async (messages: Message[]): Promise<ChatCompletion> => {
   const completionsRequest: ChatCompletionRequestBody = {
     model: "deepseek/deepseek-chat-v3.1", // "openai/gpt-4o-mini",
     tools: tools, 
     messages: messages,
   }   
   console.log('completionsRequest', completionsRequest);
   const completion = await getOpenRouterCompletion(completionsRequest); //await openai.chat.completions.create(completionsRequest); 
   console.log('completion', completion);
   return completion
}
