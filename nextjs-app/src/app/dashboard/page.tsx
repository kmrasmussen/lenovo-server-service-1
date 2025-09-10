'use client';

import DumperBox from '@/app/ui/DumperBox';
import DumpList from '@/app/ui/DumpList';
import CountdownTimer from '@/app/ui/widgets/CountdownTimer';
import AssistantResponse from '@/app/ui/AssistantResponse';
import RecordVoiceMessageNonBlocking from '@/app/ui/RecordVoiceMessageNonBlocking';
import { useState, useEffect, useCallback } from 'react';
import { ToolCall, Message, ToolResponseMessage } from '@/app/types/chatCompletions';
import { DisplayMessage } from '@/app/types/frontendTypes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// =================================================================
// 1. DERIVED STATE AND TIMER TYPES
// =================================================================
export type TimerDescriptor = {
  id: string; // The unique tool_call_id
  label: string;
  startTime: Date;
  durationSeconds: number;
};

export type StateDerivedProps = {
  activeTimers: TimerDescriptor[];
  // Future state derived from conversation history can be added here
};


export default function Otherpage() {
  // =================================================================
  // 2. COMPONENT STATE
  // =================================================================
  const [dumpList, setDumpList] = useState<DisplayMessage[]>([]);
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
  }, [])
  
  // =================================================================
  // 3. TOOL DEFINITIONS
  // =================================================================
  const start_timerTool = (args: string): string => {
    try {
      const args_parsed = JSON.parse(args);
      return `Successfully started ${args_parsed.minutes} minute timer for ${args_parsed.label || 'general purpose'}`;
    } catch (e) {
      console.error("Error parsing start_timer arguments:", e);
      return "Error starting timer: invalid arguments.";
    }
  };

  const tools = {
    'start_timer': start_timerTool
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
        fetchDumpList(); // Refetch history to get the new tool response message
      })
      .catch(error => console.error('Error posting tool response:', error));
  };

  // =================================================================
  // 4. STATE DERIVATION LOGIC
  // =================================================================
 
// The function signature now accepts the raw Message[] array
const state2props = useCallback((eventSequence: Message[]): StateDerivedProps => {
    const activeTimers: TimerDescriptor[] = [];

    // 1. Create a map of tool_call_id -> ToolResponseMessage for efficient lookup,
    //    just for the scope of this function.
    const toolResponsesMap = new Map<string, ToolResponseMessage>();
    eventSequence.forEach(message => {
        if (message.role === 'tool') {
            const toolMessage = message as ToolResponseMessage;
            toolResponsesMap.set(toolMessage.tool_call_id, toolMessage);
        }
    });

    // 2. Iterate through messages to find tool *calls*
    eventSequence.forEach(message => {
        // Ensure the message is a NormalMessage that could contain tool_calls
        if (message.role !== 'assistant' || !('tool_calls' in message) || !message.tool_calls) {
            return;
        }

        message.tool_calls.forEach(toolCall => {
            // 3. Use the local map to check if the call was executed
            const toolResponse = toolResponsesMap.get(toolCall.id);
            if (toolCall.function.name === 'start_timer' && toolResponse) {
                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    activeTimers.push({
                        id: toolCall.id,
                        label: args.label || 'Timer',
                        durationSeconds: (args.minutes || 0) * 60,
                        startTime: new Date(toolResponse._createdAt),
                    });
                } catch (e) {
                    console.error("Failed to parse timer arguments:", toolCall.function.arguments);
                }
            }
        });
    });

    return {
        activeTimers: activeTimers,
    };
}, []);
  // =================================================================
  // 5. DATA FETCHING AND EFFECTS
  // =================================================================
  const fetchDumpList = useCallback(() => {
    fetch('api/transcribe', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    .then(result => result.json())
    .then(data => {
      console.log('Fetched dump list data:', data);
      // NOTE: Assumes the API returns data that can be cast to DisplayMessage[]
      // or that processing to add `associatedToolResponses` happens here.
      setDumpList(data.messages || []);
    })
    .catch(error => console.error('Error fetching dump list:', error));
  }, []);

  // Initial fetch on component mount
  useEffect(() => {
    fetchDumpList();
  }, [fetchDumpList]);

  // Re-run the state derivation whenever the conversation history changes
  useEffect(() => {
    if (dumpList.length > 0) {
      // Call state2props directly with the raw dumpList
      const newDerivedState = state2props(dumpList);
      setDerivedState(newDerivedState);
    }
  }, [dumpList, state2props]);

  // Optional: Periodically re-run derivation to keep timers up-to-date
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (dumpList.length > 0) {
        // Call state2props directly with the raw dumpList here too
        const newDerivedState = state2props(dumpList);
        setDerivedState(newDerivedState);
      }
    }, 10000);

    return () => clearInterval(intervalId);
  }, [dumpList, state2props]);
  
  // =================================================================
  // 6. RENDER
  // =================================================================
  return (
    <div>
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
              <span className="ml-2">
                <RecordVoiceMessageNonBlocking
                  fetchDumpList={fetchDumpList}
                  awaitingTranscript={awaitingTranscript}
                  startRecordingCallback={startRecordingCallback}
                  receivedTranscriptCallback={receivedTranscriptCallback}
                />
              </span>
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
                 <span className="ml-2">
                  <RecordVoiceMessageNonBlocking
                    fetchDumpList={fetchDumpList}
                    awaitingTranscript={awaitingTranscript}
                    startRecordingCallback={startRecordingCallback}
                    receivedTranscriptCallback={receivedTranscriptCallback}
                  />
                </span>
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
