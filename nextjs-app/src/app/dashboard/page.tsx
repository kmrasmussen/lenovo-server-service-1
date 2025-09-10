"use client";

import DumperBox from '@/app/ui/DumperBox';
import DumpList from '@/app/ui/DumpList';
import CountdownTimer from '@/app/ui/widgets/CountdownTimer';
import AssistantResponse from '@/app/ui/AssistantResponse';
import RecordVoiceMessage from '@/app/ui/RecordVoiceMessage';
import RecordVoiceMessageNonBlocking from '@/app/ui/RecordVoiceMessageNonBlocking';
import { useState, useEffect, useCallback } from 'react';
import { ToolCall, Message, ToolResponseMessage } from '@/app/types/chatCompletions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const widgetRegistry: Record<string, React.ComponentType<Record<string, unknown>>> = {
  'countdown_timer': CountdownTimer
}

type Widget = {
  id: number;
  type: string;
  props: Record<string, unknown>;
}

type TimerState = {
  timeLeft: number;
  isRunning: boolean;
  isFinished: boolean;
  duration: number;
}

export default function Otherpage() {
  const [dumpList, setDumpList] = useState([]);
  const [boardWidgets, setBoardWidgets] = useState<Widget[]>([]);
  const [timerStates, setTimerStates] = useState<Record<number, TimerState>>({});
  const [machineProps, setMachineProps] = useState<String>('');
  
  const start_timerTool = (args: string) => {
    const args_parsed = JSON.parse(args);
    console.log('hey im the timer i parsed the args', args, args_parsed);
    addWidget('countdown_timer', {
      duration: args_parsed.minutes * 60,
      label: args_parsed.label || 'Timer'
    });
    return `Successfully started ${args_parsed.minutes} timer`;
  }

  const addWidget = (widgetType: string, props = {}) => {
    const newWidget = {
      id: Date.now(),
      type: widgetType,
      props: props
    };
    setBoardWidgets(prev => [...prev, newWidget]);
    
    // Initialize timer state if it's a countdown timer
    if (widgetType === 'countdown_timer') {
      const duration = (props as { duration?: number }).duration || 60;
      setTimerStates(prev => ({
        ...prev,
        [newWidget.id]: {
          timeLeft: duration,
          isRunning: true,
          isFinished: false,
          duration: duration
        }
      }));
    }
  };

  const updateTimerState = (id: number, updates: Partial<TimerState>) => {
    setTimerStates(prev => ({
      ...prev,
      [id]: { ...prev[id], ...updates }
    }));
  };

  const removeWidget = (id: number) => {
    setBoardWidgets(prev => prev.filter(w => w.id !== id));
    setTimerStates(prev => {
      const newStates = { ...prev };
      delete newStates[id];
      return newStates;
    });
  };

  const tools = {
    'start_timer': start_timerTool
  }

  const handleToolRequest = (toolRequest: ToolCall) => {
    const tool = tools[toolRequest.function.name as keyof typeof tools];
    if (tool) {
      const toolResponse = tool(toolRequest.function.arguments);
      console.log('got toolresponse', toolResponse, toolRequest.id);
      const payload = {
          toolCallId: toolRequest.id,
          toolResponseText: toolResponse,
          toolFunctionName: toolRequest.function.name
        }
      console.log('payload', payload);
      fetch('/api/tools/toolResponse', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
        .then((result) => result.json())
        .then((data) => {
          console.log('result of posting tool response', data);
          fetchDumpList();
        })
        .catch((error) => console.log('error posting tool response', error));
    } else {
      console.log('Tool not found:', toolRequest.function.name);
    }
  }

  const awaitingTranscript = useCallback((uuid: string) => {
    console.log('awaiting transcript', uuid);
  }, []);

  const startRecordingCallback = useCallback((uuid: string) => {
    console.log('recording started', uuid);
  }, []);

  const receivedTranscriptCallback = useCallback((result: unknown, uuid: string) => {
    console.log('received transcript callback', uuid, result);
  }, [])

const state2props = useCallback((eventSequence: Message[], currentTime: Date) => {
    console.log('running state2props on', eventSequence, currentTime);
    const activeTimers: Array<{
        toolCallId: string;
        durationMinutes: number;
        elapsedMinutes: number;
        remainingMinutes: number;
        startTime: Date;
        isExpired: boolean;
    }> = [];

    // Process each message
    eventSequence.forEach(message => {
        // Check if this is a tool response message
        if (message.role === 'tool') {
            // TypeScript still doesn't know it has 'name', so we check if the property exists
            if ('name' in message && 'toolCallId' in message && 'content' in message) {
                if (message.name === 'start_timer' && message._createdAt) {
                    // Extract duration from content like "Successfully started 5 timer"
                    const match = message.content.match(/Successfully started (\d+) timer/);
                    const durationMinutes = match ? parseInt(match[1]) : 0;
                    
                    const startTime = new Date(message._createdAt);
                    const elapsedMs = currentTime.getTime() - startTime.getTime();
                    const elapsedMinutes = elapsedMs / (1000 * 60);
                    const remainingMinutes = durationMinutes - elapsedMinutes;
                    
                    activeTimers.push({
                        toolCallId: message.tool_call_id,
                        durationMinutes,
                        elapsedMinutes,
                        remainingMinutes,
                        startTime,
                        isExpired: remainingMinutes <= 0
                    });
                }
            }
        }
    });

    if (activeTimers.length === 0) {
        return "No active timers";
    }

    // Group by status
    const expiredTimers = activeTimers.filter(t => t.isExpired);
    const runningTimers = activeTimers.filter(t => !t.isExpired);

    let description = "";
    
    if (runningTimers.length > 0) {
        const timerDescriptions = runningTimers.map(timer => {
            const remaining = Math.ceil(timer.remainingMinutes);
            return `${timer.durationMinutes}-minute timer (${remaining} min remaining)`;
        });
        description += `Active timers: ${timerDescriptions.join(", ")}`;
    }

    if (expiredTimers.length > 0) {
        if (description) description += ". ";
        const expiredDescriptions = expiredTimers.map(timer => {
            const overdue = Math.floor(timer.elapsedMinutes - timer.durationMinutes);
            return `${timer.durationMinutes}-minute timer (finished ${overdue} min ago)`;
        });
        description += `Finished timers: ${expiredDescriptions.join(", ")}`;
    }

    console.log('state2props description', description);

    return description;
}, []);
useEffect(() => {
  if (dumpList.length > 0) {
    const timerStatus = state2props(dumpList, new Date());
    setMachineProps(timerStatus);
  }
}, [dumpList, state2props]);
  const fetchDumpList = useCallback(() => {
    fetch('api/transcribe', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    .then((result) => result.json())
    .then((data) => {
      console.log('dump list fetch data', data);
      setDumpList(data.messages)
      state2props(dumpList, new Date())
    })
    .catch((error) => console.log('error fetching dump list', error));
  }, []);

  useEffect(() => {
    fetchDumpList();
  }, [fetchDumpList]);

  return (<div>
<Tabs defaultValue="chat">
  <TabsList>
    <TabsTrigger value="chat">chat</TabsTrigger>
    <TabsTrigger value="board">board</TabsTrigger>
  </TabsList>
  <TabsContent value="chat">
  <div className="h-full flex flex-col w-full">
    <div className="p-6 w-full flex">
      <DumperBox
        fetchDumpList={fetchDumpList}
      />
      <span className="ml-2">
        <RecordVoiceMessageNonBlocking
          awaitingTranscript={awaitingTranscript}
          fetchDumpList={fetchDumpList}
          startRecordingCallback={startRecordingCallback}
          receivedTranscriptCallback={receivedTranscriptCallback}
        />
      </span>
      <span className="ml-2"><AssistantResponse fetchDumpList={fetchDumpList} /></span>
    </div>
    <div className="p-6">
      <DumpList dumpList={dumpList}
        handleToolRequest={handleToolRequest}
      />
    </div>
  </div>
</TabsContent>
  <TabsContent value="board">
    <div className="h-full flex flex-col w-full">
    <div className="p-6 w-full flex">
      <DumperBox
        fetchDumpList={fetchDumpList}
      />
      <span className="ml-2"><RecordVoiceMessage fetchDumpList={fetchDumpList} /></span>
      <span className="ml-2"><AssistantResponse fetchDumpList={fetchDumpList} /></span>
    </div>
    <div className="p-6">
        {boardWidgets.map(widget => {
    const WidgetComponent = widgetRegistry[widget.type];
    return WidgetComponent ? (
      <WidgetComponent
        key={widget.id}
        {...widget.props}
        widgetId={widget.id}
        timerState={timerStates[widget.id]}
        updateTimerState={updateTimerState}
        onRemove={() => removeWidget(widget.id)}
      />
    ) : null;
  })}
    </div>
  </div>

</TabsContent>
</Tabs>
  </div>);
}
