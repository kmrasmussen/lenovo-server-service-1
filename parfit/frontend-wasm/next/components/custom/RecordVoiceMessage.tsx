'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';
import { port_audio_message } from '@/public/pkg/parfit_frontend_wasm.js'; // Assuming this function will be created in your WASM module

const RecordVoiceMessage = () => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        try {
          port_audio_message(uint8Array);
          console.log('Audio sent through WebSocket');
        } catch (error) {
          console.error('Failed to send audio message:', error);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <Button
      onClick={handleToggleRecording}
      variant={isRecording ? 'destructive' : 'default'}
      className={`transition-all duration-200 select-none ${isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''}`}
    >
      {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
};

export default RecordVoiceMessage;
