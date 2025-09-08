export type ToolRequest = {
  name: string,
  args: string,
}
export type Message = {
  role: string,
  content: string,
  toolRequests: ToolRequest[]
}
