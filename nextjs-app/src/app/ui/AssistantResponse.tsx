"use client";
import { Button } from '@/components/ui/button';
import { useState } from 'react';

type AssistantResponseProp = {
  fetchDumpList: () => void
}
const AssistantResponse = ({ fetchDumpList }: AssistantResponseProp) => {
  const [isLoading, setIsLoading] = useState(false);

  const onClick = () => {
    setIsLoading(true)
    fetch('/api/assistant', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json'} 
    })
    .then((response) => response.json())
    .then((result) => {
      console.log('assistant result', result)
      fetchDumpList();
      setIsLoading(false);
    })
    .catch((error) => {
      console.log('assistant error', error)
      setIsLoading(false);
    });
  }

  return (<Button disabled={isLoading} onClick={onClick}>
    {isLoading ? '...' : 'get AI input'}
    </Button>)
};

export default AssistantResponse;
