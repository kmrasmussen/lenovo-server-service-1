"use client";

import DumperBox from '@/app/ui/DumperBox';
import DumpList from '@/app/ui/DumpList';
import CountdownTimer from '@/app/ui/widgets/CountdownTimer';
import AssistantResponse from '@/app/ui/AssistantResponse';
import RecordVoiceMessage from '@/app/ui/RecordVoiceMessage';
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


export default function Otherpage() {
  const [dumpList, setDumpList] = useState([]);
  const [boardWidgets, setBoardWidgets] = useState<Widget[]>([]);
  const start_timerTool = (args: string) => {
    const args_parsed = JSON.parse(args);
    console.log('hey im the timer i parsed the args', args, args_parsed);
    addWidget('countdown_timer', {
      duration: args_parsed.duration || 60,
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
  const fetchDumpList = useCallback(() => {
    fetch('api/transcribe', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    .then((result) => result.json())
    .then((data) => {
      console.log('dump list fetch data', data);
      setDumpList(data.messages) //data.dbResult.map((item: any) => item.transcript))
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
      <span className="ml-2"><RecordVoiceMessage fetchDumpList={fetchDumpList} /></span>
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
        onRemove={() => setBoardWidgets(prev => 
          prev.filter(w => w.id !== widget.id)
        )}
      />
    ) : null;
  })}
    </div>
  </div>

</TabsContent>
</Tabs>
  </div>);
}
