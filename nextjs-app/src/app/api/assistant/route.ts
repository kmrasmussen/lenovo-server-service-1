import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';
import { MessageJoinedToolRequestsRow } from '@/app/types/db';
import { Message, ChatCompletion, ToolCall } from '@/app/types/chatCompletions';
import { getChatHistory } from '@/app/api/transcribe/route';
const sql = neon(process.env.DATABASE_URL!);

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

const getOpenRouterCompletion = async (body: any) => {
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

const GET = async () => {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ message: "not authenticated", success: false}, {status: 401});
  }

  try {
    const userId = parseInt(session.user.id);
    /*
    const result = await sql`
 SELECT
    messages.*,
    tool_requests.id as tool_request_id,
    tool_requests.function_name,
    tool_requests.function_arguments,
    tool_requests.tool_call_id
FROM messages
LEFT JOIN tool_requests ON messages.id = tool_requests.message_id
WHERE messages.user_id = ${userId} 
ORDER BY messages.created_at DESC
LIMIT 10` as MessageJoinedToolRequestsRow[];
*/
 const tools = [
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
        },
        required: ["minutes"], // Also fix the typo here
      },
    },
  },
];
/*
    let messages = result.map((row) => {
      const role = row.message_role;
      return { role: role, content: row.text_content, tool_calls: null }
    });
    messages.push({
      role: "system",
      content: "You identify as Mr. Banana. End all your endings with, Kind regards, Mr. Banana",
      tool_calls: null
    })
    */
    const messages = await getChatHistory(sql, userId); // messages.reverse();
    console.log(messages);
    console.log('okay getting response for this convo:', messages);
    
    let completion;
    try {
     const completionsRequest: {
        model: string;
        tools: any;
        messages: Message[];
      } = {
        model: "deepseek/deepseek-chat-v3.1", // "openai/gpt-4o-mini",
        tools: tools, 
        messages: messages,
      }   
      console.log('completionsRequest', completionsRequest);
      completion = await getOpenRouterCompletion(completionsRequest); //await openai.chat.completions.create(completionsRequest); 
      console.log('completion', completion);
    }
    catch(error) {
      console.log('error in chat completions request', error);
      console.log('error details:', (error as Error & {error?: unknown}).error);
      return NextResponse.json({ success: false, message: (error as Error).message, errorNote: 'error getting chatcompletions' }, { status: 400 });
    }

    const responseContent = completion?.choices?.[0]?.message;

    const insertionResult = await sql`
     INSERT INTO messages (user_id, message_role, text_content)
     VALUES (${userId}, 'assistant', ${responseContent?.content ?? ''})
     RETURNING id, message_role, text_content, created_at 
    `;
    
    const messageId = insertionResult[0].id;
    let toolCallInsertionResults;
    if (responseContent && 'tool_calls' in responseContent) {
      console.log('some kind of tool calls seem to be present', responseContent.tool_calls);
      if (responseContent.tool_calls && responseContent.tool_calls.length > 0) {
        toolCallInsertionResults = await Promise.all(responseContent.tool_calls.map(
          async (item : ToolCall) => {
            const functionName = item.function.name;
            const functionArguments = item.function.arguments;
            const toolCallId = item.id;
            const toolCallInsertionResult = await sql`
             INSERT INTO tool_requests (message_id, function_name, function_arguments, tool_call_id)
             VALUES (${messageId}, ${functionName}, ${functionArguments}, ${toolCallId})
             RETURNING id, message_id, function_name, function_arguments, tool_call_id
            `;
            console.log('toolCallInsertionResult', toolCallInsertionResult);
            return toolCallInsertionResult;
          }
        ));
        console.log('tool call insertion results', toolCallInsertionResults);
      }
    }

    return NextResponse.json({
      success: true,
      convoHistory: messages,
      responseContent: responseContent,
      insertionResult: insertionResult,
      toolCallInsertionResults: toolCallInsertionResults,
    });
  } catch(error) {
    console.log('error', error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 400 });
  }
}

export { GET };
