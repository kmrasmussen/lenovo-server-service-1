"use client";

import DumperBox from '@/app/ui/DumperBox';
import DumpList from '@/app/ui/DumpList';
import AssistantResponse from '@/app/ui/AssistantResponse';
import RecordVoiceMessage from '@/app/ui/RecordVoiceMessage';
import RealtimeTranscribe from '@/app/ui/RealtimeTranscribe';
import { useState, useEffect, useCallback } from 'react';
import { WebSocketMessage } from '@/app/ui/RealtimeTranscribe';

export default function Otherpage() {
  const [dumpList, setDumpList] = useState([]);

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

  const realtimeOnMessage = useCallback((data: WebSocketMessage) => {
    console.log('realtimeTranscriptionHandler', data);
  }, []);

  const realtimeOnStart = useCallback(() => {
    console.log('realtime start');
  }, []);
  const realtimeOnEnd = useCallback(() => {
    console.log('realtime end');
  }, []);
  useEffect(() => {
    fetchDumpList();
  }, [fetchDumpList]);


  return (<div className="h-full flex flex-col w-full">
    <div className="p-6 w-full flex">
      <DumperBox fetchDumpList={fetchDumpList} />
      <span className="ml-2"><RealtimeTranscribe
          onMessage={realtimeOnMessage}
          onStart={realtimeOnStart}
          onEnd={realtimeOnEnd}
        /></span>
      <span className="ml-2"><RecordVoiceMessage fetchDumpList={fetchDumpList} /></span>
      <span className="ml-2"><AssistantResponse fetchDumpList={fetchDumpList} /></span>
    </div>
    <div className="p-6">
      <DumpList dumpList={dumpList} />
    </div>
  </div>);
}
