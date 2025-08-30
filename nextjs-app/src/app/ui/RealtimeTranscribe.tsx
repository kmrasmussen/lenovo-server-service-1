'use client'; 
import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';
interface BaseMessage {
  type: string;
}

// Ready message - sent when connection is established
interface ReadyMessage extends BaseMessage {
  type: 'Ready';
}

// Step message - contains processing step data with probabilities
interface StepMessage extends BaseMessage {
  type: 'Step';
  buffered_pcm: number;
  prs: number[]; // Array of 4 probability values
  step_idx: number;
}

// Word message - contains transcribed word with timing
interface WordMessage extends BaseMessage {
  type: 'Word';
  start_time: number;
  text: string;
}

// EndWord message - marks end of word with timing
interface EndWordMessage extends BaseMessage {
  type: 'EndWord';
  stop_time: number;
}

// Union type for all possible websocket messages
export type WebSocketMessage = ReadyMessage | StepMessage | WordMessage | EndWordMessage;

// Type guard functions for runtime type checking
export const isReadyMessage = (msg: WebSocketMessage): msg is ReadyMessage => {
  return msg.type === 'Ready';
};

export const isStepMessage = (msg: WebSocketMessage): msg is StepMessage => {
  return msg.type === 'Step';
};

export const isWordMessage = (msg: WebSocketMessage): msg is WordMessage => {
  return msg.type === 'Word';
};

export const isEndWordMessage = (msg: WebSocketMessage): msg is EndWordMessage => {
  return msg.type === 'EndWord';
};

type RealtimeTranscribeProps = {
  onMessage: (message: WebSocketMessage) => void;
  onStart: () => void;
  onEnd: () => void;
}
const RealtimeTranscribe = (props: RealtimeTranscribeProps) => {
  const [isHeld, setIsHeld] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null); 

  const connectWebSocket = useCallback(() => {
    const wsUrl = 'wss://thinkpad-9052.intercebd.com/realtime/ws-kyutai-tts';
    const ws = new WebSocket(wsUrl);
    console.log('making ws', wsUrl);
    ws.onopen = () => {
      console.log('websocket connected');
      setIsConnected(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      console.log('got message', data);
      if (data.type === 'Word') {
        console.log('got words', data.text); 
      } else if (data.type === 'Step') {
        console.log('got space');
      } else {
        console.log('got unknown ws msg type');
      }
      props.onMessage(data);
    };

    ws.onerror = (error: Event) => {
      console.log('ws error', error);
      setIsConnected(false);
    }

    ws.onclose = () => {
      console.log('ws closed');
      setIsConnected(false);
    }

    return ws;
  }, [props]);

  const startRecording = useCallback(async () => {
    try {
      const ws = connectWebSocket();
      wsRef.current = ws;
      
      const stream = await navigator.mediaDevices.getUserMedia(
        {
          audio: {
            sampleRate: 24000,
            channelCount: 1
          }
        }
      );

      streamRef.current = stream;

      const workletCode = `
        class AudioProcessor extends AudioWorkletProcessor {
          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input.length > 0) {
              const channelData = input[0];
              const audioData = Array.from(channelData);
              
              this.port.postMessage({
                type: 'audio',
                data: audioData
              });
            }
            return true;
          }
        }
        registerProcessor('audio-processor', AudioProcessor);
      `;


      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;
      await audioContext.audioWorklet.addModule(workletUrl);
      
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      
      workletNode.port.onmessage = (event) => {
        if (ws && ws.readyState === WebSocket.OPEN && event.data.type === 'audio') {
          ws.send(JSON.stringify({
            type: 'Audio',
            pcm: event.data.data
          }));
        }
      };
      
      source.connect(workletNode);
      workletNodeRef.current = workletNode;
      
      // Clean up blob URL
      URL.revokeObjectURL(workletUrl);
      props.onStart();
    } catch(error) {
      console.log('error starting recording', error);
    } 
  }, [props, connectWebSocket]);

  const stopRecording = useCallback(
    () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
        workletNodeRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      setIsConnected(false);
      props.onEnd();
    },
    [props]
  );

  const handleHoldStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      setIsHeld(true);
      startRecording();

      const handleGlobalEnd = () => {
        setIsHeld(false);
        stopRecording();
        document.removeEventListener('mouseup', handleGlobalEnd);
        document.removeEventListener('touchend', handleGlobalEnd);
        document.removeEventListener('touchcancel', handleGlobalEnd);
        window.removeEventListener('blur', handleGlobalEnd);
        document.removeEventListener('visibilitychange', handleGlobalEnd);
      };

      document.addEventListener('mouseup', handleGlobalEnd);
      document.addEventListener('touchend', handleGlobalEnd);
      document.addEventListener('touchcancel', handleGlobalEnd);
      window.addEventListener('blur', handleGlobalEnd);
      document.addEventListener('visibilitychange', handleGlobalEnd);
    },
    [startRecording, stopRecording]
  );

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);
  const getIcon = () => {
    if (isHeld) return <Square className="h-4 w-4" />;
    return <Mic className="h-4 w-4" />;
  };

  const getVariant = () => {
    if (isHeld) return 'destructive';
    if (isConnected) return 'default';
    return 'secondary';
  };
  return (
    <Button
      onMouseDown={handleHoldStart}
      onTouchStart={handleHoldStart}
      variant={getVariant()}
      className={`transition-all duration-200 select-none touch-none ${
        isHeld ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''
      } ${isConnected ? 'ring-2 ring-green-300' : ''}`}
    >
      Realtime {getIcon()}
    </Button>
  );
};

export default RealtimeTranscribe;
