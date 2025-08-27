"use client";

import DumperBox from '@/app/ui/DumperBox';
import DumpList from '@/app/ui/DumpList';
import AssistantResponse from '@/app/ui/AssistantResponse';
import RecordVoiceMessage from '@/app/ui/RecordVoiceMessage';
import { useState, useEffect } from 'react';

export default function Otherpage() {
  const [dumpList, setDumpList] = useState([]);

  useEffect(() => {
    console.log('use effect', dumpList);
     
    fetchDumpList();
    /*
    const pollingInterval = setInterval(fetchDumpList, 5000);
    return () => {
      console.log('useeffect cleanup');	
      clearInterval(pollingInterval);
    };
    */
  }, [dumpList]);

  const fetchDumpList = () => {
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
  }

  return (<div className="h-full flex flex-col w-full">
    <div className="p-6 w-full flex">
      <DumperBox fetchDumpList={fetchDumpList} />
      <span className="ml-2"><RecordVoiceMessage fetchDumpList={fetchDumpList} /></span>
      <span className="ml-2"><AssistantResponse fetchDumpList={fetchDumpList} /></span>
    </div>
    <div className="p-6">
      <DumpList dumpList={dumpList} />
    </div>
  </div>);
}
