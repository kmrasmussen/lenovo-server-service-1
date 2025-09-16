'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button"
import init, { 
    connect_websocket, 
    port_text_message,
    set_event_callback,
} from '@/public/pkg/parfit_frontend_wasm.js';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [input, setInput] = useState('');
  const [events, setEvents] = useState<any[]>([]);
  const url = process.env.NEXT_PUBLIC_PARFIT_BACKEND_WEBSOCKET_URL || 'ws://couldnotfindenvvariable.com:8005';
  
  console.log('Current events state length:', events.length);
  
  const connectHandler = async () => {
    try {
      console.log('trying connect', url);
      
      const initStart = performance.now();
      await init();
      const initEnd = performance.now();
      
      console.log(`WASM init took ${(initEnd - initStart).toFixed(2)}ms`);
      
      set_event_callback((eventJson: string) => {
        console.log('New event from WASM:', eventJson);
        const event = JSON.parse(eventJson);
        setEvents(prev => {
          console.log('Previous events length:', prev.length);
          const eventExists = prev.some(existingEvent => 
            existingEvent.curr_hash === event.curr_hash
          );
          if (eventExists) {
            console.log('Event already exists, skipping');
            return prev;
          }
          const newEvents = [...prev, event];
          console.log('Adding new event, new length:', newEvents.length);
          return newEvents;
        });
      });
      
      await connect_websocket(url);
      console.log('WebSocket connected successfully!');
      setIsConnected(true);
    } catch (error) {
      console.error('Connection failed:', error);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log(input);
    try {
      port_text_message(input);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
    setInput('');
  }

  return (
    <div>
      {!isConnected && (
        <Button onClick={connectHandler} variant="outline">Connect</Button>
      )}
      
      {isConnected && (
        <>
          <p>Connected</p>
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
            />
          </form>
          
          <div>
            <h3>Events: ({events.length})</h3>
            <div>
              {events.map((event, index) => (
                <pre key={event.curr_hash || index} style={{fontSize: '12px', margin: '5px 0'}}>
                  {JSON.stringify(event, null, 2)}
                </pre>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
