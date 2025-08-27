import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';
import { Message } from '@/app/types/chatCompletions';
import { MessageRow } from '@/app/types/db';

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

    console.log('got transcription', transcription);

    const userId = parseInt(session.user.id);

    const insertionResult = await sql`
     INSERT INTO messages (user_id, message_role, text_content)
     VALUES (${userId}, 'user', ${transcription.text})
     RETURNING id, message_role, text_content, created_at 
    `;

    const result = await sql`
     INSERT INTO voice_messages (user_id, transcript)
     VALUES (${userId}, ${transcription.text})
     RETURNING id, transcript, created_at
    `;

    return NextResponse.json({ success: true, insertionResult: insertionResult, transcription: transcription, dbResult: result });
  } catch(error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
  }
};

const GET = async (_req: NextRequest) => {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ message: "not authenticated", success: false}, {status: 401});
  }

  try {
    const userId = parseInt(session.user.id);

    const result = await sql`
      SELECT * FROM messages
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 5
    ` as MessageRow[];
    /*
    const result = await sql`
      SELECT id, transcript, created_at FROM voice_messages
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    */
    
    const messages: Message[] = result.map((item: MessageRow) => ({ 
      role: item.message_role,
      content: item.text_content 
    }));

    return NextResponse.json({ success: true, dbResult: result, messages: messages });
  } catch(error) {
    return NextResponse.json({ success: false, message: error }, { status: 400 });
  }
}

export { POST, GET };
