import { Message, ToolCall } from '@/app/types/chatCompletions';

/**
 * Examines message changes and triggers tool calls for auto-responding.
 * This function is framework-agnostic and does not use React hooks.
 *
 * @param previousStateHash The hash of the previous message list.
 * @param currentStateHash The hash of the new message list.
 * @param messages The new array of messages.
 * @param autorespond A boolean flag to enable or disable auto-responding.
 * @param handleToolRequest A callback function to execute a given tool call.
 */
export const runtime = (
  previousStateHash: string | null,
  currentStateHash: string,
  messages: Message[],
  autoexecute: boolean,
  handleToolRequest: (toolCall: ToolCall, currentStateHash: string) => void,
  autorespond: boolean,
  retrieveLLMResponse: (currentStateHash: string) => void,
  autotoolfollowup: boolean,
): void => {
  console.log(`runtime-init-${currentStateHash}`);
  // Exit if auto-response is off, or if the state has not changed.
  if (!previousStateHash) {
    console.log('runtime-early-exit-no-previous-state-hash');
    return;
  }
  if (previousStateHash === currentStateHash) {
    console.log('runtime-early-exit-previousStateHash-equals-currentStateHash');
    console.log('but doing anyway');
    //return;
  }
  if (messages.length == 0) {
    console.log('runtime-early-exit-messages-length-is-0');
    return;
  }

  console.log('runtime-not-early-exit');

  // First we check if the newest message is a user message, in that case we only have to deal with it if autorespond is active
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role === 'user') {
    console.log('runtime-lastmessageisuser');
    if (!autorespond) {
      console.log('runtime-lastmessageisuser-autorespond-inactive');
      return;
    }
    console.log('runtime-lastmessageisuser-autorespond-active-calling-retrieveLLMresponse');
    retrieveLLMResponse(currentStateHash);
    return;
  }

  // Second, if autotoolfollowup is enabled then we check whether the last message is a tool response message and
  if (lastMessage.role == 'tool') {
    console.log('runtime-lastmessage-is-tool');
    if (!autotoolfollowup) {
      console.log('runtime-lastmessage-is-tool-autotoolfolloup-inactive');
      return;
    }
    console.log('runtime-lastmessage-is-user-autotoolfollowup-active-calling-retrieveLLMresponse');
    retrieveLLMResponse(currentStateHash);
    return;

  }

  // Now if it is not a user message or tool, then we only want to do something if autoexecute is on
  if (!autoexecute) {
    console.log('runtime-autoexecute-inactive');
    return;
  }

  // Check if the last message is from the assistant and contains tool_calls.
  if (lastMessage.role === 'assistant' && 'tool_calls' in lastMessage && lastMessage.tool_calls) {
    console.log('runtime-last-message-has-toolcall');
    console.log(`Runtime found ${lastMessage.tool_calls.length} tool_calls in the last message.`);
    
    // Execute each tool call.
    lastMessage.tool_calls.forEach(toolCall => {
      console.log(`Runtime is executing tool: ${toolCall.function.name} with id: ${toolCall.id}`);
      console.log(`runtime-executing-tool-call-${toolCall.function.name}`);
      handleToolRequest(toolCall, currentStateHash);
    });
  }
};
