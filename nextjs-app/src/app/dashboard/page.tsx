'use client';

import DumperBox from '@/app/ui/DumperBox';
import DumpList from '@/app/ui/DumpList';
import CountdownTimer from '@/app/ui/widgets/CountdownTimer';
import AssistantResponse from '@/app/ui/AssistantResponse';
import RecordVoiceMessageNonBlocking from '@/app/ui/RecordVoiceMessageNonBlocking';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ToolCall, Message, ToolResponseMessage } from '@/app/types/chatCompletions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculateMessagesHash } from '@/app/lib/messageHash';
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { tools } from '@/app/lib/serverSideTools';
import { runtime } from '@/app/lib/runtime';

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
  const [stateHash, setStateHash] = useState<string | null>(null);
  const [autorespond, setAutorespond] = useState<boolean>(true);
  const [autoexecute, setAutoexecute] = useState<boolean>(true);
  const [autotoolfollowup, setAutotoolfollowup] = useState<boolean>(true);
  const [derivedState, setDerivedState] = useState<StateDerivedProps>({
    activeTimers: [],
  });
  const [isRetrievingLLMResponse, setIsRetrievingLLMResponse] = useState(false);

  const {fetchDumpList, handleToolRequest, retrieveLLMResponse} = useMemo(() => {
    const fetchDumpList = async () => {
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
        }

        // =================================================================
        // MODIFIED: Pass retrieved data to the runtime function
        // It is called before setting state, so `stateHash` is the "previous" hash.
        // This allows it to compare the old hash with the new `computedHash`.
        // =================================================================
        runtime(stateHash, computedHash, data.messages || [], autoexecute, handleToolRequest, autorespond, retrieveLLMResponse, autotoolfollowup);

        // Now, update the component's state
        console.log('frontend verified state hash agreement', computedHash);
        setDumpList(data.messages);
        setStateHash(computedHash);

      } catch (error) {
        console.error('Error fetching dump list:', error);
      }
      // =================================================================
      // MODIFIED: The dependency array is updated to include state variables
      // that the function depends on for the runtime logic.
      // `handleToolRequest` is omitted to prevent a circular dependency warning,
      // as it depends on `fetchDumpList`.
      // =================================================================
    }

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

    const retrieveLLMResponse = (stateHashArg: string) => {
      const params = new URLSearchParams({ stateHash: stateHashArg })
      setIsRetrievingLLMResponse(true)
      fetch(`/api/assistant?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json'} 
      })
      .then((response) => response.json())
      .then((result) => {
        console.log('assistant result', result)
        fetchDumpList();
        setIsRetrievingLLMResponse(false);
      })
      .catch((error) => {
        console.log('assistant error', error)
        setIsRetrievingLLMResponse(false);
      });
    }

    return {fetchDumpList, handleToolRequest, retrieveLLMResponse}
  }, [stateHash, setIsRetrievingLLMResponse, autoexecute, autorespond, autotoolfollowup]);

  // =================================================================
  // SERVER SIDE EVENTS
  // =================================================================
  // Use a simple boolean flag that toggles
// Use a simple boolean flag that toggles
// Use a simple boolean flag that toggles
const [shouldRefresh, setShouldRefresh] = useState(false);
const sseMessagesRef = useRef<unknown[]>([]);

const triggerRefresh = useCallback(() => {
  setShouldRefresh(prev => !prev);
}, []);

const handleSSEMessage = useCallback((event: MessageEvent) => {
  const data = JSON.parse(event.data);
  sseMessagesRef.current = [...sseMessagesRef.current, data];
  console.log('all sseMessages', sseMessagesRef.current);
  
  if (data.type === 'new_message') {
    console.log('New user message:', data.content);
    triggerRefresh();
  }
}, [triggerRefresh]);

// Separate useEffect for the refresh logic
useEffect(() => {
  fetchDumpList();
}, [shouldRefresh, fetchDumpList]);

// SSE connection useEffect
useEffect(() => {
  console.log('Connecting to SSE...');
  const eventSource = new EventSource('/api/sse');
  
  eventSource.onopen = () => {
    console.log('SSE connection opened');
  };
  
  eventSource.onmessage = handleSSEMessage;
  
  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
  };
  
  return () => {
    console.log('Closing SSE connection');
    eventSource.close();
  };
}, [handleSSEMessage]);
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
                <div className="flex items-center space-x-2">
                  <Switch
                    id="autorespond-chat"
                    checked={autorespond}
                    onCheckedChange={setAutorespond}
                  />
                  <Label htmlFor="autorespond-chat">Autorespond</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="autoexecute-chat"
                    checked={autoexecute}
                    onCheckedChange={setAutoexecute}
                  />
                  <Label htmlFor="autoexectute-chat">Autoexecute</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="autotoolfollowup-chat"
                    checked={autotoolfollowup}
                    onCheckedChange={setAutotoolfollowup}
                  />
                  <Label htmlFor="autotoolfollowup-chat">Autotoolfollowup</Label>
                </div>
              </span>
              {/* MODIFIED: The AssistantResponse component is now always visible */}
              <span className="ml-2">
                <AssistantResponse retrieveLLMResponse={retrieveLLMResponse} currentStateHash={stateHash} isRetrievingLLMResponse={isRetrievingLLMResponse} />
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
