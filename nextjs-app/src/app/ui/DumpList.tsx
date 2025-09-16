// app/ui/DumpList.tsx
'use client';

import { useMemo } from 'react';
import DumpListItem from '@/app/ui/DumpListItem';
import { Message, NormalMessage, ToolResponseMessage, ToolCall } from '@/app/types/chatCompletions';
import { DisplayMessage, AssociatedToolResponses } from '@/app/types/frontendTypes';

type DumpListProps = {
  dumpList: Message[];
  handleToolRequest: (toolRequest: ToolCall, stateHash: string) => void;
  currentStateHash: string | null;
}

const DumpList = (props: DumpListProps) => {
  const displayList = useMemo(() => {
    // 1. Create a map of tool_call_id -> ToolResponseMessage for efficient lookup.
    const toolResponsesMap = new Map<string, ToolResponseMessage>();
    props.dumpList.forEach(message => {
      if (message.role === 'tool') {
        const toolMessage = message as ToolResponseMessage;
        toolResponsesMap.set(toolMessage.tool_call_id, toolMessage);
      }
    });

    // 2. Process messages to associate full response objects with the message that made the call.
    const processedMessages = props.dumpList
      // THIS IS THE FIX: We use a type guard to inform TypeScript that
      // any message passing this filter is guaranteed to be a NormalMessage.
      .filter((message): message is NormalMessage => message.role !== 'tool')
      .map(message => {
        // Now, TypeScript correctly knows that `message` is a NormalMessage,
        // so this assignment is safe.
        const displayMessage: DisplayMessage = { ...message };

        if (displayMessage.tool_calls) {
          const responses: AssociatedToolResponses = {};
          let foundAResponse = false;

          displayMessage.tool_calls.forEach(toolCall => {
            if (toolResponsesMap.has(toolCall.id)) {
              responses[toolCall.id] = toolResponsesMap.get(toolCall.id)!;
              foundAResponse = true;
            }
          });

          if (foundAResponse) {
            displayMessage.associatedToolResponses = responses;
          }
        }
        return displayMessage;
      });

    // 3. Reverse the list for chronological display.
    return processedMessages.reverse();
  }, [props.dumpList]);

  return (
    <ul className="space-y-2 p-0">
      {
        displayList.map((item, idx) => (<DumpListItem
          handleToolRequest={props.handleToolRequest} currentStateHash={props.currentStateHash} key={idx} item={item} />))
      }
    </ul>
  );
}

export default DumpList;
