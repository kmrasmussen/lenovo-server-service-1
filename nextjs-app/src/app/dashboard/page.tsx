'use client';

import DumperBox from '@/app/ui/DumperBox';
import DumpList from '@/app/ui/DumpList';
import CountdownTimer from '@/app/ui/widgets/CountdownTimer';
import AssistantResponse from '@/app/ui/AssistantResponse';
import RecordVoiceMessageNonBlocking from '@/app/ui/RecordVoiceMessageNonBlocking';
import { useState, useEffect, useCallback } from 'react';
import { ToolCall, Message, ToolResponseMessage } from '@/app/types/chatCompletions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculateMessagesHash } from '@/app/lib/messageHash';

// =================================================================
// TYPE DEFINITIONS
// =================================================================
export type TimerDescriptor = {
  id: string;
  label: string;
  startTime: Date;
  durationSeconds: number;
};

export type StateDerivedProps = {
  activeTimers: TimerDescriptor[];
};


export default function Otherpage() {
  // =================================================================
  // STATE & CALLBACKS
  // =================================================================
  const [dumpList, setDumpList] = useState<Message[]>([]);
  const [derivedState, setDerivedState] = useState<StateDerivedProps>({
    activeTimers: [],
  });
  
  const awaitingTranscript = useCallback((uuid: string) => {
    console.log('awaiting transcript for uuid:', uuid);
  }, []);

  const startRecordingCallback = useCallback((uuid: string) => {
    console.log('recording started for uuid:', uuid);
  }, []);

  const receivedTranscriptCallback = useCallback((result: unknown, uuid: string) => {
    console.log('received transcript callback for uuid:', uuid, result);
  }, []);
  
  // =================================================================
  // AUDIO LOGIC (CENTRALIZED IN THE PARENT)
  // =================================================================
  
  const playBellSound = useCallback(() => {
    const audioEl = document.getElementById('timer-bell-audio') as HTMLAudioElement;
    if (audioEl) {
      audioEl.currentTime = 0;
      audioEl.play().catch(error => console.log("Error playing bell sound:", error));
    }
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      const audioEl = document.getElementById('timer-bell-audio') as HTMLAudioElement;
      if (audioEl) {
        audioEl.play().catch(() => {});
        audioEl.pause();
        audioEl.currentTime = 0;
        
        window.removeEventListener('touchstart', unlockAudio);
        console.log("Audio context unlocked by user touch for #timer-bell-audio.");
      }
    };
    window.addEventListener('touchstart', unlockAudio);
    return () => {
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // =================================================================
  // TOOL DEFINITIONS
  // =================================================================
  const start_timerTool = (args: string): string => {
    try {
      const args_parsed = JSON.parse(args);
      const minutes = args_parsed.minutes || 0;
      const seconds = args_parsed.seconds || 0;
      return `Successfully started a ${minutes} minute and ${seconds} second timer for ${args_parsed.label || 'general purpose'}`;
    } catch (e) {
      console.error("Error parsing start_timer arguments:", e);
      return "Error starting timer: invalid arguments.";
    }
  };

  const tools = {
    'start_timer': start_timerTool,
  };

  const handleToolRequest = (toolRequest: ToolCall) => {
    const tool = tools[toolRequest.function.name as keyof typeof tools];
    if (!tool) {
      console.log('Tool not found:', toolRequest.function.name);
      return;
    }
    
    const toolResponse = tool(toolRequest.function.arguments);
    const payload = {
      toolCallId: toolRequest.id,
      toolResponseText: toolResponse,
      toolFunctionName: toolRequest.function.name
    };

    fetch('/api/tools/toolResponse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(result => result.json())
      .then(data => {
        console.log('Result of posting tool response:', data);
        fetchDumpList();
      })
      .catch(error => console.error('Error posting tool response:', error));
  };

  // =================================================================
  // STATE DERIVATION LOGIC
  // =================================================================
  const state2props = useCallback((eventSequence: Message[]): StateDerivedProps => {
    const activeTimers: TimerDescriptor[] = [];
    const toolResponsesMap = new Map<string, ToolResponseMessage>();
    
    eventSequence.forEach(message => {
      if (message.role === 'tool') {
        const toolMessage = message as ToolResponseMessage;
        toolResponsesMap.set(toolMessage.tool_call_id, toolMessage);
      }
    });
    
    eventSequence.forEach(message => {
      if (message.role !== 'assistant' || !('tool_calls' in message) || !message.tool_calls) {
        return;
      }
      
      message.tool_calls.forEach(toolCall => {
        const toolResponse = toolResponsesMap.get(toolCall.id);
        if (toolCall.function.name === 'start_timer' && toolResponse) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const minutes = args.minutes || 0;
            const seconds = args.seconds || 0;
            const totalDurationSeconds = (minutes * 60) + seconds;

            activeTimers.push({
              id: toolCall.id,
              label: args.label || 'Timer',
              durationSeconds: totalDurationSeconds,
              startTime: new Date(toolResponse._createdAt),
            });
          } catch (e) {
            console.error("Failed to parse timer arguments:", toolCall.function.arguments, e);
          }
        }
      });
    });

    return {
      activeTimers: activeTimers,
    };
  }, []);

  // =================================================================
  // DATA FETCHING AND EFFECTS
  // =================================================================
 const fetchDumpList = useCallback(async () => {
    try {
      const response = await fetch('api/transcribe', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      
      // Verify hash
      const computedHash = await calculateMessagesHash(data.messages || []);
      
      if (computedHash !== data.messagesHash) {
        console.error('Hash mismatch!', { server: data.messagesHash, client: computedHash });
        return;
      } else {
        console.log('frontend verified state hash agreement', computedHash);
        setDumpList(data.messages);
      }
    } catch (error) {
      console.error('Error fetching dump list:', error);
    }
  }, []);

  useEffect(() => {
    fetchDumpList();
  }, [fetchDumpList]);

  useEffect(() => {
    if (dumpList.length > 0) {
      const newDerivedState = state2props(dumpList);
      setDerivedState(newDerivedState);
    }
  }, [dumpList, state2props]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (dumpList.length > 0) {
        const newDerivedState = state2props(dumpList);
        setDerivedState(newDerivedState);
      }
    }, 10000);
    return () => clearInterval(intervalId);
  }, [dumpList, state2props]);
  
  // =================================================================
  // RENDER
  // =================================================================
  return (
    <div>
      <audio id="timer-bell-audio" src="/sounds/bell1.wav" preload="auto" />
      
      <div style={{ display: 'none' }}>
        {derivedState.activeTimers.map(timer => (
          <CountdownTimer
            key={timer.id}
            id={timer.id}
            label={timer.label}
            startTime={timer.startTime}
            durationSeconds={timer.durationSeconds}
            onFinish={playBellSound}
          />
        ))}
      </div>

      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="board">Board</TabsTrigger>
        </TabsList>
        <TabsContent value="chat">
          <div className="h-full flex flex-col w-full">
            <div className="p-6 w-full flex items-center">
              <DumperBox fetchDumpList={fetchDumpList} />
              <span className="ml-2">
                <RecordVoiceMessageNonBlocking
                  fetchDumpList={fetchDumpList}
                  awaitingTranscript={awaitingTranscript}
                  startRecordingCallback={startRecordingCallback}
                  receivedTranscriptCallback={receivedTranscriptCallback}
                />
              </span>
              <span className="ml-2">
                <AssistantResponse fetchDumpList={fetchDumpList} />
              </span>
            </div>
            <div className="p-6">
              <DumpList 
                dumpList={dumpList}
                handleToolRequest={handleToolRequest}
              />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="board">
          <div className="h-full flex flex-col w-full">
            <div className="p-6 w-full flex items-center">
              <DumperBox fetchDumpList={fetchDumpList} />
              <span className="ml-2">
                  <RecordVoiceMessageNonBlocking
                    fetchDumpList={fetchDumpList}
                    awaitingTranscript={awaitingTranscript}
                    startRecordingCallback={startRecordingCallback}
                    receivedTranscriptCallback={receivedTranscriptCallback}
                  />
              </span>
              <span className="ml-2">
                <AssistantResponse fetchDumpList={fetchDumpList} />
              </span>
            </div>
            <div className="p-6 flex flex-wrap gap-4">
              {derivedState.activeTimers.map(timer => (
                <CountdownTimer
                  key={timer.id}
                  id={timer.id}
                  label={timer.label}
                  startTime={timer.startTime}
                  durationSeconds={timer.durationSeconds}
                />
              ))}
              {derivedState.activeTimers.length === 0 && (
                <p className="text-gray-500">No active timers. Ask the assistant to start one!</p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
