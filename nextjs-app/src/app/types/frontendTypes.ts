// app/types/frontend.ts
import { NormalMessage, ToolResponseMessage } from '@/app/types/chatCompletions';

/**
 * A map where the key is the tool_call_id and the value is the
 * entire ToolResponseMessage object.
 */
export type AssociatedToolResponses = {
  [toolCallId: string]: ToolResponseMessage;
};

/**
 * The frontend-specific message type. It's the original NormalMessage
 * plus an optional field to hold the map of tool response objects.
 */
export type DisplayMessage = NormalMessage & {
  associatedToolResponses?: AssociatedToolResponses | null;
};
