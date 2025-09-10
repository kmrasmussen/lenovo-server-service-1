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
    const body = await req.json();
    console.log('toolResponse post raw body', body);

    const { toolCallId, toolResponseText, toolFunctionName } = body;
    console.log('got tool response', toolCallId, toolResponseText);

    const userId = parseInt(session.user.id);
    
    // Find the tool Request
    const selectResult = await sql`
      SELECT tool_requests.id as tool_request_id, function_name, function_arguments FROM tool_requests
      JOIN messages on tool_requests.message_id = messages.id
      JOIN users ON messages.user_id = users.id
      WHERE users.id = ${userId} AND tool_requests.tool_call_id = ${toolCallId};
    `;

    if (!selectResult || selectResult.length < 1) {
      console.log('client sent tool response but the associated tool request was not found in db');
      return NextResponse.json({ success: false, message: 'tool request not found' }, { status: 400 });
    }

    if (selectResult[0].function_name != toolFunctionName) {
      console.log('client sent tool response but the tool in db had different function name');
      return NextResponse.json({ success: false, message: 'function name does not match db' }, { status: 400 });
    }

    const toolRequestId = parseInt(selectResult[0].tool_request_id);
    console.log('tool request id', toolRequestId, ' tool call id', toolCallId);

    const insertionResult = await sql`
     INSERT INTO tool_responses (tool_request_id, response_text, success)
     VALUES (${toolRequestId}, ${toolResponseText}, true)
     RETURNING id, created_at
    `;

    const endpointResponse = {
      success: true,
      insertionResult: insertionResult
    }
    return NextResponse.json(endpointResponse);
  } catch(error) {
    console.log('tool response post error', error);
      return NextResponse.json({ success: false, message: error }, { status: 400 });
  }
};

export { POST };
