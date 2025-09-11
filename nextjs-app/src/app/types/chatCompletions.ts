export type FunctionCall = {
  name: string,
  arguments: string
}
export type ToolCall = {
  id: string,
  type: "function",
  function: FunctionCall 
}
export type ToolResponseMessage = {
  role: 'tool',
  content: string,
  name: string, // function name
  tool_call_id: string, // given by OR
  _createdAt: string,
}
export type NormalMessage = {
  role: string,
  content: string,
  tool_calls: ToolCall[] | null,
  _createdAt: string
}
export type Message = NormalMessage | ToolResponseMessage

export type ChatCompletionChoice = {
  message: Message
}
export type ChatCompletion = {
  id: string | null,
  choices: ChatCompletionChoice[] | null
}

export type ChatCompletionTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: {
        [key: string]: {
          type: string;
          description: string;
        };
      };
      required: string[];
    };
  };
};

// Defines the overall structure of the request body sent to the AI service
export type ChatCompletionRequestBody = {
  model: string;
  tools: ChatCompletionTool[];
  messages: Message[];
};

export type UserTextSubmissionEvent = {
  type: 'UserTextSubmissionEvent';
  text: string;
  timestamp: number; 
}
export type UserTextSubmissionReceiptEvent = {
  type: 'UserTextSubmissionReceiptEvent';
  text: string;
  timestamp: number; 
}
export type RequestAssistantMessageEvent = {
  type: 'RequestAssistantMessageEvent';
  text: 'ready',
  timestamp: number;
}
export type AssistantMessageGenerationStartedEvent = {
  type: 'AssistantMessageGenerationStartedEvent';
  text: 'generating',
  timestamp: number;
}
export type AssistantMessageEvent = {
  type: 'AssistantMessageEvent';
  completion: ChatCompletion
  timestamp: number;
}
export type Event = AssistantMessageEvent | AssistantMessageGenerationStartedEvent | UserTextSubmissionEvent | UserTextSubmissionReceiptEvent | RequestAssistantMessageEvent; 
export type EventContainer = {
  event: Event
  prevEventHash: string | null,
  currentEventHash: string
}
