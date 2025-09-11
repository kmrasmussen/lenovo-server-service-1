// app/api/socket/route.ts
import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { WebSocketServer } from 'ws';
import type WebSocket from 'ws';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

export async function GET(req: NextRequest) {
  // Check authentication first
  const session = await auth();
  
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('WebSocket connection attempt by user:', session.user.id);

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', function connection(ws: WebSocket) {
    console.log(`Client connected to WebSocket - User ID: ${session.user.id}`);
    
    ws.on('message', function incoming(message: Buffer) {
      const messageStr = message.toString();
      console.log('received from user %s: %s', session.user.id, messageStr);
      // Echo the message back with user info
      ws.send(`Echo from ${session.user.id}: ${messageStr}`);
    });

    ws.on('close', () => {
      console.log(`Client disconnected - User ID: ${session.user.id}`);
    });
  });

  // Get the raw response from Next.js
  const response = new Response(null, {
    status: 101,
    headers: {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
    },
  });

  // Handle the WebSocket upgrade
  if (req.headers.get('upgrade') === 'websocket') {
    const socket = (req as unknown as { socket: Socket }).socket;
    const head = Buffer.alloc(0);
    
    wss.handleUpgrade(req as unknown as IncomingMessage, socket, head, function done(ws: WebSocket) {
      wss.emit('connection', ws, req);
    });
  }

  return response;
}
