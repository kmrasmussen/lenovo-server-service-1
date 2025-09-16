'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button"
import init, { 
    connect_websocket, 
    port_text_message,
    port_audio_message, // 1. Import the new WASM function
    set_event_callback,
    load_app,
} from '@/public/pkg/parfit_frontend_wasm.js';
import RecordVoiceMessage from '@/components/custom/RecordVoiceMessage'; // 2. Import the new component

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [input, setInput] = useState('');
  const [events, setEvents] = useState<any[]>([]);
  const url = process.env.NEXT_PUBLIC_PARFIT_BACKEND_WEBSOCKET_URL || 'ws://localhost:8005';
  
  const connectHandler = async () => {
    try {
      console.log('trying connect', url);
      
      const initStart = performance.now();
      await init();
      const initEnd = performance.now();
      
      console.log(`WASM init took ${(initEnd - initStart).toFixed(2)}ms`);
      
      set_event_callback((eventJson: string) => {
        const event = JSON.parse(eventJson);
        if (event.event?.AudioSubmission?.data) {
          console.log('New audio event from WASM, data omitted for brevity.');
        } else {
          console.log('New event from WASM:', eventJson);
        }

        setEvents(prev => {
          const eventExists = prev.some(existingEvent => 
            existingEvent.curr_hash === event.curr_hash
          );
          if (eventExists) {
            return prev;
          }
          const newEvents = [...prev, event];
          return newEvents;
        });
      });
      
      await connect_websocket(url);
      console.log('WebSocket connected successfully!');
      setIsConnected(true);

      try {
        console.log("Loading app definitions via WASM...");
        load_app("gymbro_app"); // Pass any name you like for the app
        console.log("App definitions loaded and sent to backend.");
      } catch (error) {
        console.error("Failed to execute load_app:", error);
      }

    } catch (error) {
      console.error('Connection failed:', error);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    try {
      port_text_message(input);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
    setInput('');
  }

  // Helper to prevent rendering huge audio data arrays in the UI
  const renderEventForDisplay = (event: any) => {
    const eventCopy = JSON.parse(JSON.stringify(event));
    if (eventCopy.event?.AudioSubmission?.data) {
        const data = eventCopy.event.AudioSubmission.data;
        const truncatedData = data.slice(0, 15);
        eventCopy.event.AudioSubmission.data = `[${truncatedData.join(', ')}, ...] (${data.length} bytes)`;
    }
    return JSON.stringify(eventCopy, null, 2);
  }

  return (
    <div>
      {!isConnected && (
        <Button onClick={connectHandler} variant="outline">Connect</Button>
      )}
      
      {isConnected && (
        <>
          <p>Connected</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexGrow: 1 }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                placeholder="Type a message..."
                style={{ width: '100%', padding: '8px' }}
              />
            </form>
            {/* 3. Add the component here */}
            <RecordVoiceMessage />
          </div>
          
          <div>
            <h3>Events: ({events.length})</h3>
            <div>
              {events.map((event, index) => (
                <pre key={event.curr_hash || index} style={{fontSize: '12px', margin: '5px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>
                  {renderEventForDisplay(event)}
                </pre>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
