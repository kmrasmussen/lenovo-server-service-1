
export type MessageJoinedToolRequestsRow = {
  id: number,
  message_role: string,
  text_content: string,
  created_at: string,
  json_metadata: string
  tool_request_id: number,
  function_name: string,
  function_arguments: string,
  tool_call_id: string,
}

export type MessageRow = {
  id: number,
  message_role: string,
  text_content: string,
  created_at: string,
  json_metadata: string
}

export type PicturesRow = {
  id: number,
  user_id: number,
  created_at: string,
  json_metadata: string,
  s3key: string
}

export type PictureDto = {
  id: number,
  created_at: string,
  signedUrl: string
}
