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
  _createdAt: string
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
