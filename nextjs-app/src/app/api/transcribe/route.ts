import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';
import { Message, NormalMessage, ToolResponseMessage } from '@/app/types/chatCompletions';
import { MessageJoinedToolRequestsAndResponsesRow, ToolResponsesRow } from '@/app/types/db';
import { TranscribePostDto} from '@/app/types/routeDtos';
import { filterOrphanedToolCalls } from '@/app/lib/historyUtils';

const sql = neon(process.env.DATABASE_URL!);

const openai = new OpenAI();
export const getChatHistory = async (sql : any, userId : number) => {
 const result = await sql`
   SELECT
      messages.id as message_id,
      messages.message_role,
      messages.text_content,
      messages.created_at,
      tool_requests.function_name,
      tool_requests.function_arguments,
      tool_requests.tool_call_id
   FROM messages
    LEFT JOIN tool_requests ON messages.id = tool_requests.message_id
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 10;` as MessageJoinedToolRequestsAndResponsesRow[];
    // Create normal messages and collect tool_call_ids that are present
    const presentToolCallIds = new Set<string>();
    const normalMessages: NormalMessage[] = result.map((item: MessageJoinedToolRequestsAndResponsesRow) => {
      const message: NormalMessage = {
        role: item.message_role,
        content: item.text_content,
        tool_calls: null,
        _createdAt: item.created_at
      }
      if (item.function_name != null) {
        message.tool_calls = [{
            id: item.tool_call_id,
            type: 'function',
            function: {
              name: item.function_name,
              arguments: item.function_arguments
            }
        }];
        // Track this tool_call_id as present
        presentToolCallIds.add(item.tool_call_id);
      }
      return message;
    });

    // Find the oldest message's timestamp to filter tool responses
    const oldestMessageTime = result.length > 0 
        ? Math.min(...result.map(msg => new Date(msg.created_at).getTime()))
        : Date.now();

    const toolResponsesSelect = await sql`
    SELECT tool_requests.tool_call_id, tool_requests.function_name, tool_responses.response_text, tool_responses.created_at 
    FROM tool_responses
    RIGHT JOIN tool_requests ON tool_responses.tool_request_id = tool_requests.id
    RIGHT JOIN messages on tool_requests.message_id = messages.id
    WHERE messages.user_id = ${userId}
      AND messages.created_at >= ${new Date(oldestMessageTime)}
    ORDER BY tool_responses.created_at DESC;
    ` as ToolResponsesRow[];
    
    // Deduplicate tool responses and only include those with corresponding tool_calls
    const toolResponseMap = new Map<string, ToolResponsesRow>();
    
    toolResponsesSelect
        .filter(row => row.tool_call_id && row.function_name && row.response_text) // Filter out null entries
        .filter(row => presentToolCallIds.has(row.tool_call_id)) // Only include if tool_call is present
        .forEach(row => {
            const existing = toolResponseMap.get(row.tool_call_id);
            if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
                toolResponseMap.set(row.tool_call_id, row);
            }
        });

    const toolMessages: ToolResponseMessage[] = Array.from(toolResponseMap.values())
        .map((row: ToolResponsesRow) => ({
            role: 'tool',
            tool_call_id: row.tool_call_id,
            name: row.function_name,
            content: row.response_text,
            _createdAt: row.created_at
        }));
    
    const allMessages: Message[] = [...normalMessages, ...toolMessages].sort((a, b) => 
     new Date(a._createdAt).getTime() - new Date(b._createdAt).getTime()
    );

    const finalMessages = allMessages; //filterOrphanedToolCalls(allMessages);
   
    console.log('final messages', JSON.stringify(finalMessages, null, 2));
    
    return finalMessages;
}

const POST = async (req: NextRequest) => {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ message: "not authenticated", success: false}, {status: 401});
  }
  console.log('got session', session);
  console.log('openai api key', process.env.OPENAI_API_KEY);
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({ success: false, message: "no audio file" }, { status: 400 });
    }

    console.log('got audio file', audioFile.name, audioFile.size);

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
    });

    const transcriptText = transcription.text;

    console.log('got transcription', transcriptText);

    const userId = parseInt(session.user.id);

    await sql`
     INSERT INTO messages (user_id, message_role, text_content)
     VALUES (${userId}, 'user', ${transcription.text})
     RETURNING id, message_role, text_content, created_at 
    `;

    await sql`
     INSERT INTO voice_messages (user_id, transcript)
     VALUES (${userId}, ${transcription.text})
     RETURNING id, transcript, created_at
    `;
    
    const endpointResponse: TranscribePostDto = {
      success: true,
      transcriptText: transcriptText
    }
    return NextResponse.json(endpointResponse);
  } catch(error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
  }
};

const GET = async () => {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ message: "not authenticated", success: false}, {status: 401});
  }

  try {
    const userId = parseInt(session.user.id);

    const allMessages = await getChatHistory(sql, userId);

    return NextResponse.json({ success: true, messages: allMessages });
  } catch(error) {
    return NextResponse.json({ success: false, message: error }, { status: 400 });
  }
}

export { POST, GET };
