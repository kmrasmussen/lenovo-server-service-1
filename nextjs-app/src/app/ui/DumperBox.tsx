'use client';

import { useState, ChangeEvent, KeyboardEvent } from 'react';

import { Input } from '@/components/ui/input';

type DumperBoxProps = {
  fetchDumpList: () => void;
}
const DumperBox = (props : DumperBoxProps) => {
  const [dumpValue, setDumpValue] = useState('');

  const submitDump = (content: string) => {
    console.log('ok sending dump to server now', content);
    fetch('/api/dump', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'text': content })
    }).then((result) => result.json())
    .then((data) => {
      console.log('result json', data);
      setDumpValue('');
      console.log('falling fetch');
      props.fetchDumpList();
    })
    .catch((error) => {
      console.log('error when sending dump to server', error);
    });
  }
  

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDumpValue(event.target.value)
  }


  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    console.log('key down', event.key);
    if (event.key == 'Enter') {
	console.log('okay user wants to dump', dumpValue);
	submitDump(dumpValue);
    }
  }

  return (<Input className="w-full" type="text" value={dumpValue} onChange={handleChange} onKeyDown={handleKeyDown} />);
}

export default DumperBox;
