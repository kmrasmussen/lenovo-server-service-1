import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';
import { Message } from '@/app/types/chatCompletions';
import { MessageJoinedToolRequestsRow } from '@/app/types/db';
import { TranscribePostDto } from '@/app/types/routeDtos';

const sql = neon(process.env.DATABASE_URL!);

const openai = new OpenAI();

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

    const result = await sql`
    SELECT
      messages.*,
      tool_requests.id as tool_request_id,
      tool_requests.function_name,
      tool_requests.function_arguments,
      tool_requests.tool_call_id FROM messages
    LEFT JOIN tool_requests ON messages.id = tool_requests.message_id
    WHERE user_id = ${userId} 
    ORDER BY created_at DESC
    LIMIT 5` as MessageJoinedToolRequestsRow[];
    
    const messages: Message[] = result.map((item: MessageJoinedToolRequestsRow) => {
      const message: Message = {
        role: item.message_role,
        content: item.text_content,
        toolRequests: []
      }
      if (item.function_name != null) {
        message.toolRequests = [{
            name: item.function_name,
            args: item.function_arguments
          }];
      }
      return message;
    });

    return NextResponse.json({ success: true, dbResult: result, messages: messages });
  } catch(error) {
    return NextResponse.json({ success: false, message: error }, { status: 400 });
  }
}

export { POST, GET };
