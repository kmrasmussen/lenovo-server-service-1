use crate::chat_completions::{ChatMessage, UserMessage };
use crate::Event;
use crate::EventContainer;

pub fn event_containers_to_messages(containers: &[EventContainer]) -> Vec<ChatMessage> {
    containers
        .iter()
        .filter_map(|container| event_to_message(&container.event))
        .collect()
}

pub fn event_to_message(event: &Event) -> Option<ChatMessage> {
    match event {
        Event::UserTextSubmission { text } => {
            Some(ChatMessage::User(UserMessage {
                role: "user".to_string(),
                content: text.clone(),
            }))
        },
        Event::NonstreamingChatCompletion { chat_completion } => {
            // Extract the assistant message from the chat completion
            chat_completion.choices
                .as_ref()?
                .first()
                .map(|choice| choice.message.clone())
        },
        Event::ToolExecutionResult { tool_message } => {
          Some(ChatMessage::Tool(tool_message.clone()))
        }
        _ => {
          panic!("the backtrace should already only have moved the relevant Event enumvalues in here");
        },
    }
}
