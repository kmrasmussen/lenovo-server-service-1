"use client";

import RealtimeTranscribe from '@/app/ui/RealtimeTranscribe';
import { useState, useEffect, useCallback, useRef } from 'react';
import { WebSocketMessage, isWordMessage } from '@/app/ui/RealtimeTranscribe';

export default function RealtimePage() {
  const [messages, setMessages] = useState<WebSocketMessage[]>([])
  const [transcripts, setTranscripts] = useState<string[]>([])
  const messagesRef = useRef<WebSocketMessage[]>([])

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const realtimeOnMessage = useCallback((data: WebSocketMessage) => {
    console.log('realtimeTranscriptionHandler', data);
    setMessages(prev => [...prev, data]);
  }, []);

  const realtimeOnStart = useCallback(() => {
    console.log('realtime start');
    setMessages([])
  }, []);
  const realtimeOnEnd = useCallback(() => {
    console.log('realtime end');
    const transcript : string = messagesRef.current
      .filter((msg) => isWordMessage(msg))
      .map((msg) => msg.text)
      .join(' ');
    setTranscripts(prev => [...prev, transcript]);
    const formData = new FormData();
    formData.append('text', transcript);
    fetch('/api/message', {
      method: 'POST',
      body: formData
    })
    .then((result) => result.json())
    .then((data) => {
      console.log('result of trying to submit transcript', data);
    })
    .catch((error) => console.log('error fetching dump list', error));
    setMessages([])
  }, []);

  const renderMessage = (msg: WebSocketMessage, index: number) => {
    if (isWordMessage(msg)) {
      return (<span key={index}>{msg.text}</span>);
    }
    return (<span key={index}>-</span>);
  }

  const renderTranscript = (transcript: string, index: number) => {
    return (<li key={index}>{transcript}</li>);
  }

  return (<div className="h-full flex flex-col w-full">
    <div className="p-6 w-full flex">
      <span className="ml-2"><RealtimeTranscribe
          onMessage={realtimeOnMessage}
          onStart={realtimeOnStart}
          onEnd={realtimeOnEnd}
        /></span>
    </div>
    <div className="p-6">
        {messages.map((msg,index) => renderMessage(msg,index)) }
    </div>
    <div>
        <ul>
          {transcripts.map((transcript, index) => renderTranscript(transcript,index)) }
        </ul>
    </div>
  </div>);
}
