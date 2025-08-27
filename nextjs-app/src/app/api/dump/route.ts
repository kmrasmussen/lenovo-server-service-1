import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';


const allDumps: Record<string, string[]> = {};

const POST = async (req: NextRequest) => {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ message: "not authenticated", success: false}, {status: 401});
  }
  console.log('got session', session);
  const { text } = await req.json();
  console.log('received dump on server:', text);
  if (session.user.id in allDumps) {
    allDumps[session.user.id].push(text);
  } else {
    allDumps[session.user.id] = [text];
  }
  return NextResponse.json({ success: true, allDumps: allDumps[session.user.id] });
};

const GET = async () => {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ message: "not authenticated", success: false}, {status: 401});
  }

  if (session.user.id in allDumps) {
    return NextResponse.json({ dumps: allDumps[session.user.id] });
  } else {
    return NextResponse.json({ dumps: [] });
  }

}

export { POST, GET };
