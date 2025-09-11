import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { neon } from '@neondatabase/serverless';
import { redis } from '@/app/lib/redis';
import { AssistantMessageEvent, EventContainer, UserTextSubmissionReceiptEvent, AssistantMessageGenerationStartedEvent, UserTextSubmissionEvent, Message } from '@/app/types/chatCompletions';
import { calculateEventHash } from '@/app/lib/messageHash'
import { getCompletion } from '@/app/lib/completions';
const sql = neon(process.env.DATABASE_URL!);

const eventContainerChainToChatMessages = (eventContainers: EventContainer[]): Message[] => {
  return eventContainers
    .filter(container => container.event.type === 'UserTextSubmissionEvent')
    .map(container => ({
      role: 'user',
      content: (container.event as UserTextSubmissionEvent).text,
      tool_calls: null,
      _createdAt: new Date(container.event.timestamp).toISOString()
    }));
}

type InsertEventContainerInDatabaseType = {
  id: number,
  inserted_at: number,
  prev_event_hash: string | null;
  current_event_hash: string
}
const insertEventContainerInDatabase = async (userId: number, eventContainer: EventContainer) : Promise<InsertEventContainerInDatabaseType|null> => {
    const insertionResult = await sql`
     INSERT INTO event_containers (user_id, raw_event_container_json, prev_event_hash, current_event_hash)
     VALUES (${userId}, ${eventContainer}, ${eventContainer.prevEventHash}, ${eventContainer.currentEventHash})
     RETURNING id, inserted_at, prev_event_hash, current_event_hash
    ` as InsertEventContainerInDatabaseType[];
    if (insertionResult.length == 1) {
      return insertionResult[0];
    } else {
      return null;
    }
}

const getEventChain = async (startingHash: string, userId: number): Promise<EventContainer[]> => {
  const rows = await sql`
    WITH RECURSIVE event_chain AS (
      SELECT id, user_id, inserted_at, raw_event_container_json, 
             prev_event_hash, current_event_hash, 1 as depth
      FROM event_containers 
      WHERE current_event_hash = ${startingHash} AND user_id = ${userId}
      
      UNION ALL
      
      SELECT ec.id, ec.user_id, ec.inserted_at, ec.raw_event_container_json,
             ec.prev_event_hash, ec.current_event_hash, e.depth + 1
      FROM event_containers ec
      JOIN event_chain e ON ec.current_event_hash = e.prev_event_hash
      WHERE ec.user_id = ${userId}
    )
    SELECT raw_event_container_json FROM event_chain
    ORDER BY depth DESC
  `;
  
  // With JSONB, raw_event_container_json is already parsed as an object
  return rows.map(row => row.raw_event_container_json as EventContainer);
};

const sendEventContainerToClient = (userId: number, eventContainer: EventContainer) => {
  redis.publish(`user:${userId}:events`, JSON.stringify(eventContainer)).catch(error => {
    console.error('Redis publish failed:', error);
    // Don't throw - just log the error
  });
}

const POST = async (req: NextRequest) => {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ message: "not authenticated", success: false}, {status: 401});
  }
  console.log('got session', session);
  try {
    const body = await req.json();
    console.log('post raw body', body);
    const eventContainer = body as EventContainer;
    const userId = parseInt(session.user.id);
    
    if (eventContainer.event.type == 'UserTextSubmissionEvent') {
      const insertionResult = await insertEventContainerInDatabase(userId, eventContainer); 
      const receiptEvent : UserTextSubmissionReceiptEvent = {
        type: 'UserTextSubmissionReceiptEvent',
        text: 'ok',
        timestamp: Date.now()
      }
      const receiptEventContainer : EventContainer = {
        event: receiptEvent,
        prevEventHash: eventContainer.currentEventHash,
        currentEventHash: await calculateEventHash(eventContainer.currentEventHash, receiptEvent) 
      }

      redis.publish(`user:${userId}:events`, JSON.stringify(receiptEventContainer)).catch(error => {
        console.error('Redis publish failed:', error);
        // Don't throw - just log the error
      });
      const receiptInsertionResult = await sql`
       INSERT INTO event_containers (user_id, raw_event_container_json, prev_event_hash, current_event_hash)
       VALUES (${userId}, ${receiptEventContainer}, ${receiptEventContainer.prevEventHash}, ${receiptEventContainer.currentEventHash})
       RETURNING id, inserted_at, prev_event_hash, current_event_hash
      `;
      return NextResponse.json({ success: true, body: body, insertionResult: insertionResult, receiptInsertionResult: receiptInsertionResult });
    }
    else if (eventContainer.event.type == 'RequestAssistantMessageEvent') {
      const insertionResult = await insertEventContainerInDatabase(userId, eventContainer);
      if (insertionResult == null) {
        return NextResponse.json({ success: false, message: 'some kind of error on insertion', insertionResult: insertionResult }, { status: 401 });
      }
      const insertedHash = insertionResult.current_event_hash;
      const eventChain = await getEventChain(insertionResult.current_event_hash, userId);
      const messages = eventContainerChainToChatMessages(eventChain); 
      const generationStartedEvent : AssistantMessageGenerationStartedEvent = {
        type: 'AssistantMessageGenerationStartedEvent',
        text: 'generating',
        timestamp: Date.now(),
      }
      const generationStartedEventContainer : EventContainer = {
        event: generationStartedEvent,
        prevEventHash: insertionResult.current_event_hash,
        currentEventHash: await calculateEventHash(insertionResult.current_event_hash, generationStartedEvent)
      }
      sendEventContainerToClient(userId, generationStartedEventContainer);
      const completion = await getCompletion(messages); 
      const assistantMessageEvent : AssistantMessageEvent = {
        type: 'AssistantMessageEvent',
        completion: completion, 
        timestamp: Date.now(),
      }
      const completionEventContainer : EventContainer = {
        event: assistantMessageEvent,
        prevEventHash: generationStartedEventContainer.currentEventHash,
        currentEventHash: await calculateEventHash(generationStartedEventContainer.currentEventHash, assistantMessageEvent)
      }
      sendEventContainerToClient(userId, completionEventContainer);
      return NextResponse.json({ success: true, message: 'got an eventchain', completion: completion, messages: messages, eventChain: eventChain, insertionResult: insertionResult }, { status: 200 });
    }
    else {
      console.error('unknown event type')
      return NextResponse.json({ success: false, message: 'unknown event type' }, { status: 401 });
    }
  } catch(error) {
      console.error('transcript submission error', error)
      return NextResponse.json({ success: false, message: error }, { status: 400 });
  }
};


export { POST };
