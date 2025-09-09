"use client";

import DumperBox from '@/app/ui/DumperBox';
import DumpList from '@/app/ui/DumpList';
import CountdownTimer from '@/app/ui/widgets/CountdownTimer';
import AssistantResponse from '@/app/ui/AssistantResponse';
import RecordVoiceMessage from '@/app/ui/RecordVoiceMessage';
import RecordVoiceMessageNonBlocking from '@/app/ui/RecordVoiceMessageNonBlocking';
import { useState, useEffect, useCallback } from 'react';
import { ToolRequest } from '@/app/types/chatCompletions';
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
  
  const start_timerTool = (args: string) => {
    const args_parsed = JSON.parse(args);
    console.log('hey im the timer i parsed the args', args, args_parsed);
    addWidget('countdown_timer', {
      duration: args_parsed.minutes * 60 || 60,
      label: args_parsed.label || 'Timer'
    });
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
          isRunning: false,
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

  const handleToolRequest = (toolRequest: ToolRequest) => {
    const tool = tools[toolRequest.name as keyof typeof tools];
    if (tool) {
      tool(toolRequest.args);
    } else {
      console.log('Tool not found:', toolRequest.name);
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

  const fetchDumpList = useCallback(() => {
    fetch('api/transcribe', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    .then((result) => result.json())
    .then((data) => {
      console.log('dump list fetch data', data);
      setDumpList(data.messages)
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
