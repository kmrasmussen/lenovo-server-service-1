'use client';

import DumperBox from '@/app/ui/DumperBox';
import DumpList from '@/app/ui/DumpList';
import CountdownTimer from '@/app/ui/widgets/CountdownTimer';
import AssistantResponse from '@/app/ui/AssistantResponse';
import RecordVoiceMessageNonBlocking from '@/app/ui/RecordVoiceMessageNonBlocking';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ToolCall, Message, AssistantMessageEvent, RequestAssistantMessageEvent, RequestToolExecutionEvent, ToolResponseMessage, EventContainer, UserTextSubmissionEvent } from '@/app/types/chatCompletions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { calculateMessagesHash, calculateEventHash } from '@/app/lib/messageHash';
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
  const [heapIntegrity, setHeapIntegrity] = useState<string>('notcomputed');
  const [eventHeap, setEventHeap] = useState<EventContainer[]>([]);
  const [stateHash, setStateHash] = useState<string | null>(null);
  const [autorespond, setAutorespond] = useState<boolean>(true);
  const [autoexecute, setAutoexecute] = useState<boolean>(true);
  const [autotoolfollowup, setAutotoolfollowup] = useState<boolean>(true);
  const [derivedState, setDerivedState] = useState<StateDerivedProps>({
    activeTimers: [],
  });
  const [isRetrievingLLMResponse, setIsRetrievingLLMResponse] = useState(false);

  const getEventHeapIntegrity = (currentEventHeap: EventContainer[]): string => {
    console.log('inside getEventHeapIntegrity');
    const result = currentEventHeap.length;
    console.log('HEAP LENGTH', currentEventHeap.length);
    if (currentEventHeap.length == 0) {
      console.log('HEAPINTEG EMPTY');
      return 'heapempty';
    }
    const index0event = currentEventHeap[0]
    
    console.log('HEAP index 0 hash', currentEventHeap[0].prevEventHash, currentEventHeap[0].currentEventHash);
    if (index0event.prevEventHash != null) {
      return 'index0notnull';
    }
    
    if (currentEventHeap.length == 1) {
      return 'onlyOneEvent';
    }
    for (let i = 0; i < currentEventHeap.length - 1; i++) {
      const currentHash = currentEventHeap[i].currentEventHash;
      const nextHash = currentEventHeap[i].currentEventHash
      if (currentHash != nextHash) {
        return `found linearity break at position ${i}, ${currentHash} vs next ${nextHash}`;
      }
    }
    return 'normal';
  };

  useEffect(() => {
    console.log('eventHeap useEffect');
    const computedIntegrity = getEventHeapIntegrity(eventHeap)
    setHeapIntegrity(computedIntegrity);
    if (computedIntegrity != 'normal') {
      return;
    }
    console.log('sdfasdf');
    if (eventHeap.length == 0) {
      return;
    }
    const latestEventContainer = eventHeap[eventHeap.length - 1];
    console.log('heyo', latestEventContainer);
    if (latestEventContainer.event.type == 'UserTextSubmissionReceiptEvent') {
      console.log('LATEST EVENT IS USERTextsumbssionReceiptEVENT why NOT LIKE GET A RESPONSE YOU KNOW!?');
      addRequestLLMResponseEvent();
      console.log('OK i deed');
    }
    else if (latestEventContainer.event.type == 'AssistantMessageEvent') {
      const assistantMessageEvent = latestEventContainer.event as AssistantMessageEvent;


    }
  }, [eventHeap]);

  const insertInEventHeap = useCallback((candidateEventContainer: EventContainer) => {
    setEventHeap(prevHeap => {
      // check if hash already exists
      const exists = prevHeap.some(
        e => e.currentEventHash === candidateEventContainer.currentEventHash
      );
      if (exists) {
        console.log('insertInEventHeap, event already exists');
        return prevHeap; // do nothing if duplicate
      } else {
        console.log('insertInEventHeap, did not exist inserting');
        return [...prevHeap, candidateEventContainer];
      }
    });
  }, []);


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

    const handleToolRequest = (toolRequest: ToolCall, stateHashArg: string) => {
      if (stateHashArg != stateHash) {
        console.error(`handleToolRequest called but stateHashARg ${stateHashArg} does not match stateHash ${stateHash}`);
        return;
      }
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

  const getEventTopHash = useCallback((): string | null => {
    if (eventHeap.length > 0) {
      return eventHeap[eventHeap.length - 1].currentEventHash; // JavaScript doesn't support negative indexing
    } else {
      return null;
    }
  }, [eventHeap]); // Don't forget the dependency array
  const getEventTop = useCallback((): EventContainer | null => {
    if (eventHeap.length > 0) {
      return eventHeap[eventHeap.length - 1]; // JavaScript doesn't support negative indexing
    } else {
      return null;
    }
  }, [eventHeap]); // Don't forget the dependency array
  const submitText = useCallback(async (text: string) => {
    console.log('hey requesting LLM response yeah!?', getEventTopHash());
      const submissionEvent : UserTextSubmissionEvent = {
      type: 'UserTextSubmissionEvent',
      text: text,
      timestamp: Date.now()
    }
    const prevEventHash = getEventTopHash();
    const eventContainer : EventContainer = {
      event: submissionEvent,
      prevEventHash: prevEventHash,
      currentEventHash: await calculateEventHash(prevEventHash, submissionEvent) 
    }
    console.log('submissionEvent', submissionEvent);
    console.log('eventContainer', eventContainer);
    setEventHeap(prev => [...prev, eventContainer]);
    console.log('ok sending eventContainer to server now', eventContainer);
    fetch('/api/message/event', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(eventContainer)
    })
    .then((result) => result.json())
    .then((data) => {
      console.log('result of trying to submit eventContainer', data);
      if (data.success) {
        console.log('it was success');
      }
    })
    .catch((error) => console.log('error submitting event container', error));

  }, [eventHeap, getEventTopHash]);
  const addRequestToolExecutionEvent = useCallback(async () => {
    console.log('requesting tool execution event yeah?', getEventTopHash());
    const eventTop = getEventTop();
    if (eventTop == null) {
      console.log('event top is null, breaking');
      return;
    }
    if (eventTop.event.type != 'AssistantMessageEvent') {
      console.log('cannot request tool execution when top event i not assistantmessagevent');
    }
    const requestToolExecutionEvent : RequestToolExecutionEvent = {
      type: 'RequestToolExecutionEvent',
      text: 'please',
      timestamp: Date.now()
    }
    const prevEventHash = getEventTopHash();
    const eventContainer : EventContainer = {
      event: requestToolExecutionEvent,
      prevEventHash: prevEventHash,
      currentEventHash: await calculateEventHash(prevEventHash, requestToolExecutionEvent) 
    }
    console.log('requestToolExecutionEvent', requestToolExecutionEvent);
    console.log('eventContainer requestToolexecution', eventContainer);
    setEventHeap(prev => [...prev, eventContainer]);
    console.log('ok sending requestToolExecution eventContainer to server now', eventContainer);
    fetch('/api/message/event', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(eventContainer)
    })
    .then((result) => result.json())
    .then((data) => {
      console.log('result of trying to submit requesttoolexecution eventContainer', data);
      if (data.success) {
        console.log('it was success submitting requesttoolexecutionEvent');
      }
    })
    .catch((error) => console.log('error submitting requesttoolexecution event container', error));

  }, [eventHeap, getEventTopHash, getEventTop]);
  const addRequestLLMResponseEvent = useCallback(async () => {
    console.log('requesting llm content yeah?', getEventTopHash());
    const assistantRequestEvent : RequestAssistantMessageEvent = {
      type: 'RequestAssistantMessageEvent',
      text: 'ready',
      timestamp: Date.now()
    }
    const prevEventHash = getEventTopHash();
    const eventContainer : EventContainer = {
      event: assistantRequestEvent,
      prevEventHash: prevEventHash,
      currentEventHash: await calculateEventHash(prevEventHash, assistantRequestEvent) 
    }
    console.log('assistantRequestEvent', assistantRequestEvent);
    console.log('eventContainer assistantRequest', eventContainer);
    setEventHeap(prev => [...prev, eventContainer]);
    console.log('ok sending assistantRequest eventContainer to server now', eventContainer);
    fetch('/api/message/event', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(eventContainer)
    })
    .then((result) => result.json())
    .then((data) => {
      console.log('result of trying to submit asistantRequest eventContainer', data);
      if (data.success) {
        console.log('it was success submitting assistantRequestEvent');
      }
    })
    .catch((error) => console.log('error submitting event container', error));

  }, [eventHeap, getEventTopHash]);
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
  console.log('got SSE data', data);
  sseMessagesRef.current = [...sseMessagesRef.current, data];
  console.log('all sseMessages', sseMessagesRef.current);
  if ('event' in data) {
    const sseEventContainer = data as EventContainer
    console.log('inserting SSE eventcontainer in event heap');
    insertInEventHeap(sseEventContainer);
  } else {
    console.log('got SSE but was not event', data);
  }
}, [triggerRefresh, eventHeap, insertInEventHeap]); // Add all dependencies

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
              <DumperBox submitText={submitText} fetchDumpList={fetchDumpList} />
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
              <span className="ml-2">
                <Button onClick={addRequestLLMResponseEvent}>more</Button>
              </span>
              <span className="ml-2">
                <Button onClick={addRequestToolExecutionEvent}>ex</Button>
              </span>
              <span className="ml-2">
              HeapIntegrity: {heapIntegrity}
              </span>
            </div>
            <div>
  {eventHeap.map((e, idx) => (
    <div key={idx}>
      {JSON.stringify(e)}
    </div>
  ))}
</div>

            <div className="p-6">
              <DumpList 
                dumpList={dumpList}
                handleToolRequest={handleToolRequest}
                currentStateHash={stateHash}
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
