use serde::{Serialize, Deserialize};
use blake3;
use chat_completions::{ChatCompletion, ChatCompletionRequestBody,ChatCompletionTool, ToolResponseMessage};
pub mod chat_completions;
pub mod utils;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MachineOutput {
  pub ecs: Option<Vec<EventContainer>>,
  pub side_effect: Option<SideEffect>
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequestSideEffect {
  pub request_body: ChatCompletionRequestBody,
  pub callback_hash: String
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SideEffect {
  ChatCompletionRequest(ChatCompletionRequestSideEffect),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExecutionPolicy {
  LinearAndImmediate,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum Event {
    UserTextSubmission { text: String },
    Receipt  { text: String },
    RequestNonstreamingAssistantMessage {},
    AssistantMessageGenerationStartedEvent { completions_endpoint: String, request_body: ChatCompletionRequestBody},
    NonstreamingChatCompletion { chat_completion: ChatCompletion },
    ChatCompletionToolSchemaScope {},
    CloseChatCompletionToolSchemaScope { tool_schema_scope_hash: Option<String> },
    ScopedChatCompletionToolSchema { tool_schema: ChatCompletionTool, tool_schema_scope_hash: String },
    ToolCallExecutionPolicy { policy: ExecutionPolicy },
    ToolExecutionResult { tool_message: ToolResponseMessage },
    StartEvent { text: String, age: i32 },
    EndEvent { text: String, name: String },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventContainer {
    pub event: Event,
    pub prev_hash: Option<String>,
    pub curr_hash: String,
}

pub fn hash_event(event: &Event) -> String {
    let json = serde_json::to_string(event).unwrap();
    blake3::hash(json.as_bytes()).to_hex().to_string()
}

pub fn make_root_container(event: &Event) -> EventContainer {
    EventContainer {
        event: event.clone(),
        prev_hash: None,
        curr_hash: hash_event(event),
    }
}

pub fn append_event(prev_container: &EventContainer, next_event: &Event) -> EventContainer {
    let next_event_hash = hash_event(next_event);
    let prehash = format!("{}|{}", prev_container.curr_hash, next_event_hash);
    let hash = blake3::hash(prehash.as_bytes()).to_hex().to_string();
    EventContainer {
        event: next_event.clone(),
        prev_hash: Some(prev_container.curr_hash.clone()),
        curr_hash: hash,
    }
}

pub fn append_event_only_hash(prev_hash: String, next_event: &Event) -> EventContainer {
    let next_event_hash = hash_event(next_event);
    let prehash = format!("{}|{}", prev_hash, next_event_hash);
    let hash = blake3::hash(prehash.as_bytes()).to_hex().to_string();
    EventContainer {
        event: next_event.clone(),
        prev_hash: Some(prev_hash),
        curr_hash: hash,
    }
}
