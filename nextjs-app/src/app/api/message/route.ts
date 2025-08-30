import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const POST = async (req: NextRequest) => {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ message: "not authenticated", success: false}, {status: 401});
  }
  console.log('got session', session);
  try {
    const formData = await req.formData();
    const text = formData.get('text') as string;

    if (!text) {
      return NextResponse.json({ success: false, message: "text" }, { status: 400 });
    }
    if (text == '') {
      return NextResponse.json({ success: false, message: "text is empty" }, { status: 400 });
    }

    const userId = parseInt(session.user.id);

    const insertionResult = await sql`
     INSERT INTO messages (user_id, message_role, text_content)
     VALUES (${userId}, 'user', ${text})
     RETURNING id, message_role, text_content, created_at 
    `;

    return NextResponse.json({ success: true, insertionResult: insertionResult });
  } catch(error) {
      console.error('transcript submission error', error)
      return NextResponse.json({ success: false, message: error }, { status: 400 });
  }
};


export { POST };
