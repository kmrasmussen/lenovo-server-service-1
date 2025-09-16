use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use futures_util::{StreamExt, SinkExt};
use shared::{append_event,EventContainer,append_event_only_hash,Event,MachineOutput,SideEffect, ExecutionPolicy, ChatCompletionRequestSideEffect, AudioTranscriptionRequestSideEffect};
use shared::chat_completions::{ChatCompletionRequestBody, ChatCompletion, ChatCompletionTool, ChatMessage, ToolResponseMessage, ToolCall};
use shared::stt::{WhisperTranscriptionResponse};
use tokio::sync::{RwLock, mpsc, watch};
use std::sync::{Arc};
use std::collections::HashMap;
use shared::utils::{event_containers_to_messages};
use std::time::{SystemTime, UNIX_EPOCH};
use reqwest::multipart;
use gymbro::{list_exercises};


use tokio::signal;

struct HeapState {
  ecs: Vec<EventContainer>,
  hash_to_index: HashMap<String, usize>,
  successors: HashMap<String, Vec<String>>,
}

impl HeapState {
  fn new() -> Self {
    Self {
      ecs: Vec::new(),
      hash_to_index: HashMap::new(),
      successors: HashMap::new(),
    }
  }

  fn add_event(&mut self, ec: EventContainer) {
    let index = self.ecs.len();
    self.hash_to_index.insert(ec.curr_hash.clone(), index);
    if let Some(prev_hash) = &ec.prev_hash {
      self.successors
        .entry(prev_hash.clone())
        .or_insert_with(Vec::new)
        .push(ec.curr_hash.clone());
    }

    self.ecs.push(ec);
  }
}

#[tokio::main]
async fn main() {
    if std::env::var("OPENROUTER_API_KEY").is_err() {
      eprintln!("Error: OPENROUTER_API_KEY environment variable is required");
      std::process::exit(1);
    }
    
    println!("starting parfit server");
    let listener = TcpListener::bind("0.0.0.0:8005").await.unwrap();
    println!("echo server listening on 0.0.0.0:8005");
    
    tokio::select! {
        _ = run_server(listener) => {},
        _ = signal::ctrl_c() => {
            println!("Received shutdown signal, exiting gracefully");
        }
    }
}

async fn run_server(listener: TcpListener) {
    loop {
        let result = listener.accept().await;
        match result {
            Ok((stream, addr)) => {
                println!("New connection from: {}", addr);
                tokio::spawn(handle_echo_connection(stream));
            }
            Err(e) => {
                println!("Error accepting connection {}", e);
                break;
            }
        }
    }
}
fn simple_tool_call_exector(tool_call: ToolCall) -> ToolResponseMessage {
  match tool_call.function.name.as_str() {
    "start_timer" => {
      println!("starting timer");
      let curr_time = SystemTime::now()
          .duration_since(UNIX_EPOCH)
          .unwrap()
          .as_secs()
          .to_string();
      let tool_response_message = ToolResponseMessage {
        role: "tool".to_string(),
        content: format!("started timer at unix time {}", curr_time),
        name: tool_call.function.name.clone(),
        tool_call_id: tool_call.id.clone(),
      };
      tool_response_message
    }
    "list_exercises" => {
      println!("simple tool call executor got list_exercises");
      ToolResponseMessage {
        role: "tool".to_string(),
        content: list_exercises(),
        name: tool_call.function.name.clone(),
        tool_call_id: tool_call.id.clone(),
      }
    }
    _ => {
      panic!("unknown tool function 234324324");
    }
  }
}
fn machine(state: &HeapState, eval_hash : String) -> Option<MachineOutput> {
  let hash_to_index = &state.hash_to_index;
  let ecs = &state.ecs;
  let successors = &state.successors;

  let eval_index = hash_to_index.get(&eval_hash)?;
  let eval_ec = &ecs[*eval_index];

  let backtrace_chat = |from_hash: String| -> Vec<EventContainer> {
    let mut result = Vec::new();
    let mut current_hash = Some(from_hash);
      
    while let Some(hash) = current_hash {
     if let Some(&index) = hash_to_index.get(&hash) {
       let ec = &ecs[index];
       if matches!(ec.event, Event::UserTextSubmission { .. } | Event::NonstreamingChatCompletion { .. } | Event::ToolExecutionResult { .. }) {
         result.push(ec.clone());
       }
       current_hash = ec.prev_hash.clone();
     } else {
       break;
     }
    }
    result.reverse();
    result
  };

  let backtrace_scoped_tools = |from_hash: String| -> Option<Vec<ChatCompletionTool>> {
    let mut result = Vec::new();
    let mut current_hash = Some(from_hash);
    
    while let Some(hash) = current_hash {
      if let Some(&index) = hash_to_index.get(&hash) {
        let ec = &ecs[index];
        
        match &ec.event {
          Event::ScopedChatCompletionToolSchema { .. } => {
            result.push(ec.clone());
            current_hash = ec.prev_hash.clone();
          }
          Event::ChatCompletionToolSchemaScope { .. } => {
            current_hash = ec.prev_hash.clone();
          }
          Event::CloseChatCompletionToolSchemaScope { tool_schema_scope_hash } => {
            current_hash = tool_schema_scope_hash.clone().or(ec.prev_hash.clone());
          }
          _ => {
            current_hash = ec.prev_hash.clone();
          }
        }
      } else {
        break;
      }
    }
    
    result.reverse();
    let tools: Option<Vec<ChatCompletionTool>> = if result.is_empty() { None } else { Some(result.into_iter().filter_map(|ec| match &ec.event { Event::ScopedChatCompletionToolSchema { tool_schema, .. } => Some(tool_schema.clone()), _ => None }).collect()) };
    tools
  };

  let backtrace_execution_policy = |from_hash: String| -> Option<ExecutionPolicy> {
    let mut current_hash = Some(from_hash);
    
    while let Some(hash) = current_hash {
      if let Some(&index) = hash_to_index.get(&hash) {
        let ec = &ecs[index];
        
        if let Event::ToolCallExecutionPolicy { policy } = &ec.event {
          return Some(policy.clone());
        }
        
        current_hash = ec.prev_hash.clone();
      } else {
        break;
      }
    }
    
    None
  };

  fn backtrace_audio_data(state: &HeapState, from_hash: String) -> Option<Vec<u8>> {
    let mut current_hash = Some(from_hash);
    while let Some(hash) = current_hash {
        if let Some(&index) = state.hash_to_index.get(&hash) {
            let ec = &state.ecs[index];
            if let Event::AudioSubmission { data } = &ec.event {
                return Some(data.clone());
            }
            current_hash = ec.prev_hash.clone();
        } else {
            break;
        }
    }
    None
  }

  match &eval_ec.event {
    Event::UserTextSubmission {..} => {
      let has_receipt_successor = successors
        .get(&eval_ec.curr_hash)
        .unwrap_or(&vec![])
        .iter()
        .any(|succ_hash| {
          if let Some(&idx) = hash_to_index.get(succ_hash) {
            matches!(ecs[idx].event, Event::Receipt { .. })
          } else {
            false
          }
        });
      if !has_receipt_successor {
        let receipt = Event::Receipt {
          text: "readit".to_string()
        };
        let receipt_ec = append_event(&eval_ec, &receipt);
        return Some(MachineOutput { ecs: Some(vec![receipt_ec]), side_effect: None });
      }
    }
    Event::TranscriptionResult { text } => {
      println!("parfit machine is processing a transcription result gotta make that usersubmission");
      let user_submission_event = Event::UserTextSubmission { text: text.to_string() };
      let user_submission_ec = append_event(&eval_ec, &user_submission_event);
      let request_assistant_response = Event::RequestNonstreamingAssistantMessage {};
      let request_assistant_response_ec = append_event(&user_submission_ec, &request_assistant_response);
      return Some(MachineOutput { 
        ecs: Some(vec![user_submission_ec, request_assistant_response_ec]),
        side_effect: None 
      });
    }
    Event::RequestNonstreamingAssistantMessage {} => {
      println!("hey");
      let has_genstarted_successor = successors
        .get(&eval_ec.curr_hash)
        .unwrap_or(&vec![])
        .iter()
        .any(|succ_hash| {
          if let Some(&idx) = hash_to_index.get(succ_hash) {
            matches!(ecs[idx].event, Event::AssistantMessageGenerationStartedEvent { .. })
          } else {
            false
          }
        });
      if !has_genstarted_successor {
        /*
         * TODO: think hard about all the conditions we require before we are willing to do a
         * request for real - what ways could we end up making many requests of the same by
         * accident?
         * * */
        let backtraced_tools = backtrace_scoped_tools(eval_ec.curr_hash.clone());
        let convo_ecs = backtrace_chat(eval_ec.curr_hash.clone());
        let messages = event_containers_to_messages(&convo_ecs);
        let chat_completions_request_body = ChatCompletionRequestBody {
          model: "deepseek/deepseek-chat-v3.1".to_string(),
          tools: backtraced_tools,
          messages: messages.clone()
        };
        let genstarted_event = Event::AssistantMessageGenerationStartedEvent {
          completions_endpoint: "hejsa".to_string(),
          request_body: chat_completions_request_body.clone(),
        };
        println!("OK, GOTTA CALL THEM OPENROUTER NOW");
        let genstarted_ec = append_event(&eval_ec, &genstarted_event);
        println!("CONVO: {:?}", convo_ecs);
        //println!("msgs! {:?}", &messages);
        let json_msgs = serde_json::to_string(&messages).unwrap();
        println!("msgs json: {}", json_msgs); 
        //println!("backtraced tools! {:?}", &backtraced_tools);
        let completion_side_effect = ChatCompletionRequestSideEffect {
          request_body: chat_completions_request_body,
          callback_hash: genstarted_ec.curr_hash.clone(),
        };
        let completion_side_effect = SideEffect::ChatCompletionRequest(completion_side_effect);
        return Some(MachineOutput { ecs: Some(vec![genstarted_ec]), side_effect : Some(completion_side_effect) });
      }
    }
    Event::RequestAudioSubmissionTranscription {} => {
        println!("Machine processing RequestAudioSubmissionTranscription");

        // We need to check if we already have a result for this request to avoid re-processing
        let has_result_successor = successors
            .get(&eval_ec.curr_hash)
            .unwrap_or(&vec![])
            .iter()
            .any(|succ_hash| {
                if let Some(&idx) = hash_to_index.get(succ_hash) {
                    matches!(ecs[idx].event, Event::TranscriptionResult { .. })
                } else { false }
            });

        if has_result_successor {
            println!("Transcription result already exists, skipping.");
            return None;
        }
        
        // Find the audio data by looking backwards from the current event
        if let Some(audio_data) = backtrace_audio_data(state, eval_ec.curr_hash.clone()) {
            println!("Found audio data ({} bytes), creating side effect.", audio_data.len());
            let transcription_side_effect = SideEffect::AudioTranscriptionRequest(
                AudioTranscriptionRequestSideEffect {
                    audio_data,
                    callback_hash: eval_ec.curr_hash.clone(),
                }
            );
            return Some(MachineOutput { ecs: None, side_effect: Some(transcription_side_effect) });
        } else {
            println!("Error: Could not find corresponding audio data for transcription request.");
        }
    }
    Event::NonstreamingChatCompletion { chat_completion } => {
      if let Some(first_msg) = chat_completion.choices
        .as_ref()
        .and_then(|choices| choices.first())
        .map(|choice| &choice.message) {
        match first_msg {
          ChatMessage::Assistant(assistant_msg) => {
            println!("processing assistant msg!");
            if let Some(tool_calls) = &assistant_msg.tool_calls {
              println!("okay processing tool calls");
              if let Some(policy) = backtrace_execution_policy(eval_ec.curr_hash.clone()) {
                match policy {
                 ExecutionPolicy::LinearAndImmediate => {
                    println!("doing now linear and immediate execution fo these toolcalls {:?}", tool_calls);
                    for tool_call in tool_calls {
                      match tool_call.function.name.as_str() {
                        "start_timer" => {
                          println!("starting timer");
                          let curr_time = SystemTime::now()
                              .duration_since(UNIX_EPOCH)
                              .unwrap()
                              .as_secs()
                              .to_string();
                          let tool_response_message = ToolResponseMessage {
                            role: "tool".to_string(),
                            content: format!("started timer at unix time {}", curr_time),
                            name: tool_call.function.name.clone(),
                            tool_call_id: tool_call.id.clone(),
                          };
                          let toolex_result_event = Event::ToolExecutionResult {
                            tool_message: tool_response_message 
                          };
                          let toolex_result_ec = append_event(&eval_ec, &toolex_result_event);

                          let after_toolex_assistant_req_event = Event::RequestNonstreamingAssistantMessage { };
                          let after_toolex_assistant_req_ec = append_event(
                            &toolex_result_ec, 
                            &after_toolex_assistant_req_event);
                          return Some(MachineOutput { ecs: Some(vec![toolex_result_ec,after_toolex_assistant_req_ec]), side_effect: None });
                        }
                        "list_exercises" => {
                          println!("got list exercises tool call"); 
                        },
                        _ => {
                        }
                      }
                    }
                 } 
                }
              } else {
                panic!("no execution policy found {}", &eval_ec.curr_hash);
              }
            }
          },
          _ => {
            panic!("non-assistant msg in nonstreaming chat completion {}", &eval_ec.curr_hash); 
          }
        }
      }
    }
    _ => {}
  }

  None
}

async fn handle_echo_connection(stream: TcpStream) {
  let ws_stream = match accept_async(stream).await {
    Ok(ws) => ws,
    Err(e) => {
      println!("WebSocket handshake failed: {}", e);
      return;
    }
  };
  let (mut ws_sender, mut ws_receiver) = ws_stream.split();
  let (ws_ec_sender, mut ws_ec_receiver) = mpsc::channel::<EventContainer>(10000);
  tokio::spawn(async move {
    while let Some(ec) = ws_ec_receiver.recv().await {
      let json_msg = serde_json::to_string(&ec).unwrap();
      ws_sender.send(Message::Text(json_msg)).await.unwrap();
    }
  });
  let (manager_sender, mut manager_receiver) = mpsc::channel::<EventContainer>(10000);
  let (watch_tx, mut watch_rx) = watch::channel::<Option<EventContainer>>(None);

  let heap_state = Arc::new(RwLock::new(HeapState::new()));
  let manager_heap_state = Arc::clone(&heap_state);
  tokio::spawn(async move {
    while let Some(ec) = manager_receiver.recv().await {
      {
        let mut state = manager_heap_state.write().await;
        state.add_event(ec.clone());
      }
      ws_ec_sender.send(ec.clone()).await.unwrap();
      watch_tx.send(Some(ec)).unwrap();
    }
  });
    
  let (sideeffector_sender, mut sideeffector_receiver) = mpsc::channel::<SideEffect>(10000);
  let sideeffector_manager_heap_sender_clone = manager_sender.clone();
  tokio::spawn(async move {
    while let Some(se) = sideeffector_receiver.recv().await {
      println!("sideeffector received {:?}", se);
      match se {
        SideEffect::AudioTranscriptionRequest(transcription_request) => {
            println!("Side-effector handling audio transcription request.");
            let client = reqwest::Client::new();
            let api_key = std::env::var("OPENAI_API_KEY")
                .expect("OPENAI_API_KEY must be set");

            // The audio data needs to be wrapped in a part for multipart form upload
            let audio_part = multipart::Part::bytes(transcription_request.audio_data)
                .file_name("audio.webm")
                .mime_str("audio/webm").unwrap();
            
            let form = multipart::Form::new()
                .text("model", "whisper-1")
                .part("file", audio_part);

            let response_result = client
                .post("https://api.openai.com/v1/audio/transcriptions")
                .header("Authorization", format!("Bearer {}", api_key))
                .multipart(form)
                .send()
                .await;

          match response_result {
                Ok(response) => {
                    let status = response.status();
                    match response.text().await {
                        Ok(raw_text) => {
                            if !status.is_success() {
                                println!("Whisper API request failed with status {}. Body: {}", status, raw_text);
                                return; // Stop processing on failure
                            }

                            println!("Whisper API success. Raw response: {}", raw_text);

                            // Now, parse the raw text using our new structs
                            match serde_json::from_str::<WhisperTranscriptionResponse>(&raw_text) {
                                Ok(parsed_response) => {
                                    // Success! Extract the clean text.
                                    println!("Successfully parsed transcription: '{}'", parsed_response.text);

                                    let result_event = Event::TranscriptionResult {
                                        text: parsed_response.text, // Use the parsed text here
                                    };

                                    let result_ec = append_event_only_hash(
                                        transcription_request.callback_hash,
                                        &result_event
                                    );
                                    sideeffector_manager_heap_sender_clone.send(result_ec).await.unwrap();
                                }
                                Err(e) => {
                                    // This can happen if OpenAI changes their API response format.
                                    println!("Failed to deserialize Whisper JSON response: {}. Raw text was: {}", e, raw_text);
                                }
                            }
                        }
                        Err(e) => {
                            println!("Could not read response body from OpenAI: {}", e);
                        }
                    }
                }
                Err(e) => {
                    println!("Error making request to Whisper API: {}", e);
                }
            } 

        }

        SideEffect::ChatCompletionRequest(chat_completion_request_side_effect) => {
          println!("wow got chat completion request {:?}", chat_completion_request_side_effect);
          
          let client = reqwest::Client::new();
          let api_key = std::env::var("OPENROUTER_API_KEY").unwrap_or_else(|_| "".to_string());
          
          match client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&chat_completion_request_side_effect.request_body)
            .send()
            .await 
          {
            Ok(response) => {
              match response.text().await {
                Ok(raw_text) => {
                  println!("Raw response: {}", raw_text);
                  
                  match serde_json::from_str::<ChatCompletion>(&raw_text) {
                    Ok(completion) => {
                      println!("got structured completion: {:?}", completion);
                      // Handle the structured response here
                      // You might want to send this back through another channel
                      let completion_event = Event::NonstreamingChatCompletion { chat_completion: completion };
                      let completion_ec = append_event_only_hash(chat_completion_request_side_effect.callback_hash.clone(), &completion_event);
                      sideeffector_manager_heap_sender_clone.send(completion_ec).await.unwrap();
                    }
                    Err(e) => {
                      println!("error deserializing completion response: {}", e);
                    }
                  }
                }
                Err(e) => {
                  println!("error making openrouter request: {}", e);
                }
              }
            }
            Err(e) => {
              println!("error making openrouter request: {}", e);
            }
          }
        }
      }
    }
  });    
  let worker2manager_sender = manager_sender.clone();
  let worker_heap_state = Arc::clone(&heap_state);
  tokio::spawn(async move {
    while watch_rx.changed().await.is_ok() {
      // Clone the event to avoid holding the borrow across await
      let watch_ec = watch_rx.borrow().clone();
      if let Some(watch_ec) = watch_ec {
        println!("worker watched some ec: {:?}", watch_ec);
        let worker_heap_state_read = worker_heap_state.read().await;
        //let worker_ec_heap = worker_heap.read().await;
        //println!("worker sees {} ecs in its echeap", worker_ec_heap.len());
        let machine_output_opt = machine(&worker_heap_state_read, watch_ec.curr_hash);
        match machine_output_opt {
          Some(MachineOutput { ecs: new_ecs_opt, side_effect: side_effect_opt }) => {
            if let Some(output_ecs) = new_ecs_opt {
              println!("Machine output ecs: {:?}", output_ecs);
              for output_ec in output_ecs {
                worker2manager_sender.send(output_ec.clone()).await.unwrap();
              }
            }
            if let Some(side_effect) = side_effect_opt {
              sideeffector_sender.send(side_effect).await.unwrap();
            }
          }
          None => {
            println!("Machine output no ec");
          }
        }
      }
    }  
  });
    
    
  while let Some(msg_result) = ws_receiver.next().await {
    match msg_result {
      Ok(Message::Text(text)) => {
        println!("Got text, trying to deserialize to EventContainer");
        let ec: EventContainer = serde_json::from_str(&text).unwrap();
        println!("we got an easy on the backend i think {:?}", ec);
        // Send to manager
        manager_sender.send(ec).await.unwrap();
      }
      Ok(Message::Close(_)) => break,
      Err(_) => break,
      _ => {}
    }
  }
    
  println!("Echo connection closed");
}
