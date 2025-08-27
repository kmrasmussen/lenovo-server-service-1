import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';
import { MessageRow } from '@/app/types/db';

const sql = neon(process.env.DATABASE_URL!);

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

const GET = async () => {
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

    let messages = result.map((row) => {
      const role = row.message_role as "user" | "assistant" | "system";
      return { role: role, content: row.text_content }
    });
    messages.push({
      role: "system",
      content: "You identify as Mr. Banana. End all your endings with, Kind regards, Mr. Banana"
    })
    messages = messages.reverse();

    console.log('okay getting response for this convo:', messages);
   
    const completion = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: messages
    }); 

    const responseContent = completion?.choices[0]?.message;

    const insertionResult = await sql`
     INSERT INTO messages (user_id, message_role, text_content)
     VALUES (${userId}, 'assistant', ${responseContent.content})
     RETURNING id, message_role, text_content, created_at 
    `;

    return NextResponse.json({ success: true, result: result, responseContent: responseContent, insertionResult: insertionResult });
  } catch(error) {
    return NextResponse.json({ success: false, message: error }, { status: 400 });
  }
}

export { GET };
