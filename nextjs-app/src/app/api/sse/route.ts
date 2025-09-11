// app/api/events/route.ts
import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { redis } from '@/app/lib/redis';

export async function GET(req: NextRequest) {
  // Check authentication first
  const session = await auth();
  
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('SSE connection for user:', session.user.id);

  // Create SSE response
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // Create a separate Redis client for subscribing
      const subscriber = redis.duplicate();
      await subscriber.connect();
      
      // Subscribe to user's message channel
      const channel = `user:${session.user.id}:messages`;
      await subscriber.subscribe(channel, (message, receivedChannel) => {
        if (receivedChannel === channel) {
          const data = `data: ${message}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      });
      
      // Send initial connection message
      const data = `data: ${JSON.stringify({type: "connected", userId: session.user.id})}\n\n`;
      controller.enqueue(encoder.encode(data));

      // Send periodic heartbeat
      const heartbeatInterval = setInterval(() => {
        const heartbeat = `data: ${JSON.stringify({type: "heartbeat", timestamp: Date.now()})}\n\n`;
        try {
          controller.enqueue(encoder.encode(heartbeat));
        } catch (error) {
          console.error('SSE connection closed, clearing heartbeat.', error);
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Clean up when stream closes
      req.signal?.addEventListener('abort', () => {
        console.log('SSE connection aborted for user:', session.user.id);
        clearInterval(heartbeatInterval);
        subscriber.unsubscribe(channel).then(() => {
          subscriber.disconnect();
        });
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
