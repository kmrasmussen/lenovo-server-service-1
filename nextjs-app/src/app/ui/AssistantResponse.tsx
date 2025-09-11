"use client";
import { Button } from '@/components/ui/button';

type AssistantResponseProp = {
  retrieveLLMResponse: (stateHash: string) => void;
  currentStateHash: string | null,
  isRetrievingLLMResponse: boolean;
}
const AssistantResponse = ({ retrieveLLMResponse, currentStateHash, isRetrievingLLMResponse }: AssistantResponseProp) => {

  const onClick = () => {
    if (currentStateHash == null) {
      console.error('assistant response button: current state hash is null') 
    } else {
      retrieveLLMResponse(currentStateHash)
    }
  }

  return (<Button disabled={isRetrievingLLMResponse} onClick={onClick}>
    {isRetrievingLLMResponse ? '...' : 'get AI input'}
    </Button>)
};

export default AssistantResponse;
