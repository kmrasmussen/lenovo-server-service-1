'use client';

import { useState, ChangeEvent, KeyboardEvent } from 'react';

import { Input } from '@/components/ui/input';

type DumperBoxProps = {
  fetchDumpList: () => void;
  submitText: (text: string) => void;
}
const DumperBox = (props : DumperBoxProps) => {
  const [dumpValue, setDumpValue] = useState('');

  const submitDump = (content: string) => {
    props.submitText(content);
    /*
    console.log('ok sending dump to server now', content);
    const formData = new FormData();
    formData.append('text', content);
    fetch('/api/message', {
      method: 'POST',
      body: formData
    })
    .then((result) => result.json())
    .then((data) => {
      console.log('result of trying to submit transcript', data);
      if (data.success) {
        setDumpValue('');
        props.fetchDumpList(); 
      }
    })
    .catch((error) => console.log('error fetching dump list', error));
    */
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
