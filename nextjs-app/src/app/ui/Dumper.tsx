"use client";

import DumperBox from '@/app/ui/DumperBox';
import DumpList from '@/app/ui/DumpList';
import { useState, useEffect } from 'react';

const Dumper =  () => {
  const [dumpList, setDumpList] = useState([]);

  useEffect(() => {
    console.log('use effect', dumpList);
     
    fetchDumpList();

    const pollingInterval = setInterval(fetchDumpList, 5000);
    return () => {
      console.log('useeffect cleanup');	
      clearInterval(pollingInterval);
    };
  }, []);

  const fetchDumpList = () => {
    fetch('api/transcribe', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    .then((result) => result.json())
    .then((data) => {
      console.log('dump list fetch data', data);
      setDumpList(data.dbResult.map((item: any) => item.transcript))
    })
    .catch((error) => console.log('error fetching dump list'));
  }
  return (
	<div className="w-full">
	<DumperBox fetchDumpList={fetchDumpList} />
	<DumpList dumpList={dumpList} />
	</div>
	);
}

export default Dumper;
