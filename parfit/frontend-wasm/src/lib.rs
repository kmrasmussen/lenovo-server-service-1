use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use std::cell::RefCell;
use shared::{Event, EventContainer, make_root_container, append_event, ExecutionPolicy}; 
use shared::chat_completions::{ChatCompletionTool, FunctionSchema, FunctionParameters, PropertyDefinition};
use console_error_panic_hook;
use wasm_bindgen::JsCast;
use ed25519_dalek::{SigningKey, Signer};
use rand::rngs::OsRng;

use web_sys::{WebSocket, MessageEvent, ErrorEvent};
use js_sys;


thread_local! {
    static EC_HEAP: RefCell<Vec<EventContainer>> = RefCell::new(vec![]);
    static WS_CONNECTION: RefCell<Option<WebSocket>> = RefCell::new(None);
    static ON_NEW_EVENT: RefCell<Option<js_sys::Function>> = RefCell::new(None);
    static SIGNING_KEY: RefCell<Option<SigningKey>> = RefCell::new(None);
}

#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    
    // Initialize signing key
    let mut csprng = OsRng{};
    let signing_key = SigningKey::generate(&mut csprng);
    
    SIGNING_KEY.with(|sk| {
        *sk.borrow_mut() = Some(signing_key);
    });
}

// Helper to sign data
fn sign_data(data: &[u8]) -> Result<String, JsValue> {
    SIGNING_KEY.with(|sk| {
        if let Some(signing_key) = &*sk.borrow() {
            let signature = signing_key.sign(data);
            Ok(hex::encode(signature.to_bytes()))
        } else {
            Err(JsValue::from_str("Signing key not initialized"))
        }
    })
}

// Get public key as hex
#[wasm_bindgen]
pub fn get_public_key() -> Result<String, JsValue> {
    SIGNING_KEY.with(|sk| {
        if let Some(signing_key) = &*sk.borrow() {
            let verifying_key = signing_key.verifying_key();
            Ok(hex::encode(verifying_key.to_bytes()))
        } else {
            Err(JsValue::from_str("Signing key not initialized"))
        }
    })
}

// Central entry point for all heap insertions
fn local_heap_manager(ec: EventContainer) -> Result<(), JsValue> {
    // Add to heap
    EC_HEAP.with(|list| {
        let mut list = list.borrow_mut();
        list.push(ec.clone());
        
        // Notify React about the new event
        ON_NEW_EVENT.with(|cb| {
            if let Some(callback) = &*cb.borrow() {
                let event_json = serde_json::to_string(&ec).unwrap();
                let _ = callback.call1(&JsValue::undefined(), &JsValue::from_str(&event_json));
            }
        });
        
        Ok(())
    })
}

#[wasm_bindgen]
pub fn set_event_callback(callback: js_sys::Function) {
    ON_NEW_EVENT.with(|cb| {
        *cb.borrow_mut() = Some(callback);
    });
}

// Remove the old add_ec_to_local_heap function - use local_heap_manager instead
pub fn add_ec_to_local_heap(ec: EventContainer) -> Result<(), JsValue> {
    local_heap_manager(ec)
}

#[wasm_bindgen]
pub fn connect_websocket(url: String) -> js_sys::Promise {
    js_sys::Promise::new(&mut |resolve, reject| {
        let ws_result = WebSocket::new(&url);
        
        match ws_result {
            Ok(ws) => {
                // Clone references for the closures
                let ws_for_onopen = ws.clone();
                let ws_for_onerror = ws.clone();
                let ws_for_onmessage = ws.clone();
                
                // Set up onopen handler to resolve the promise
                let onopen_callback = Closure::wrap(Box::new(move |_e: web_sys::Event| {
                    web_sys::console::log_1(&"WebSocket connected successfully".into());
                    let _ = resolve.call0(&JsValue::undefined());
                }) as Box<dyn FnMut(web_sys::Event)>);
                ws_for_onopen.set_onopen(Some(onopen_callback.as_ref().unchecked_ref()));
                onopen_callback.forget();
                
                // Set up onerror handler to reject the promise
                let onerror_callback = Closure::wrap(Box::new(move |_e: ErrorEvent| {
                    web_sys::console::log_1(&"WebSocket connection failed".into());
                    let _ = reject.call1(&JsValue::undefined(), &JsValue::from_str("Connection failed"));
                }) as Box<dyn FnMut(ErrorEvent)>);
                ws_for_onerror.set_onerror(Some(onerror_callback.as_ref().unchecked_ref()));
                onerror_callback.forget();
                
                // Message handler - now uses local_heap_manager
                let onmessage_callback = Closure::wrap(Box::new(move |e: MessageEvent| {
                    if let Ok(msg) = e.data().dyn_into::<js_sys::JsString>() {
                        web_sys::console::log_1(&format!("WebSocket received: {}", msg).into());
                        let msg_str = msg.as_string().unwrap();
                        let ec: EventContainer = serde_json::from_str(&msg_str).unwrap();
                        web_sys::console::log_1(&format!("it was an ec: {:?}", ec).into());
                        match local_heap_manager(ec) {
                            Ok(()) => {
                                web_sys::console::log_1(&"Successfully added EC to heap".into());
                            }
                            Err(e) => {
                                web_sys::console::log_1(&format!("Failed to add EC to heap: {:?}", e).into());
                            }
                        }
                    }
                }) as Box<dyn FnMut(MessageEvent)>);
                ws_for_onmessage.set_onmessage(Some(onmessage_callback.as_ref().unchecked_ref()));
                onmessage_callback.forget();
                
                // Store the connection
                WS_CONNECTION.with(|conn| {
                    *conn.borrow_mut() = Some(ws);
                });
            }
            Err(e) => {
                let _ = reject.call1(&JsValue::undefined(), &e);
            }
        }
    })
}

#[wasm_bindgen]
pub fn websocket_ready_state() -> Option<u16> {
    WS_CONNECTION.with(|conn| {
        conn.borrow().as_ref().map(|ws| ws.ready_state())
    })
}

#[wasm_bindgen]
pub fn send_websocket_message(message: String) -> Result<(), JsValue> {
    WS_CONNECTION.with(|conn| {
        if let Some(ws) = &*conn.borrow() {
            web_sys::console::log_1(&format!("Sending: {}", message).into());
            ws.send_with_str(&message)
        } else {
            web_sys::console::log_1(&"No WebSocket connection".into());
            Err(JsValue::from_str("No WebSocket connection"))
        }
    })
}

#[wasm_bindgen]
pub fn send_latest_event() -> Result<(), JsValue> {
    let message = EC_HEAP.with(|list| {
        let list = list.borrow();
        if let Some(latest_ec) = list.last() {
            serde_json::to_string(latest_ec).map_err(|e| JsValue::from_str(&e.to_string()))
        } else {
            Err(JsValue::from_str("No events in heap"))
        }
    })?;
    
    WS_CONNECTION.with(|conn| {
        if let Some(ws) = &*conn.borrow() {
            web_sys::console::log_1(&format!("Sending latest EC: {}", message).into());
            ws.send_with_str(&message)
        } else {
            web_sys::console::log_1(&"No WebSocket connection".into());
            Err(JsValue::from_str("No WebSocket connection"))
        }
    })
}

pub fn get_tool_schema_list_exercises() -> ChatCompletionTool {
  let start_timer_tool_schema = ChatCompletionTool {
    tool_type: "function".to_string(),
    function: FunctionSchema {
        name: "list_exercises".to_string(),
        description: "List all exercises".to_string(),
        parameters: FunctionParameters {
            param_type: "object".to_string(),
            properties: HashMap::from([]),
            required: vec![],
        },
    },
  };
  start_timer_tool_schema
}

pub fn get_tool_schema() -> ChatCompletionTool {
  let start_timer_tool_schema = ChatCompletionTool {
    tool_type: "function".to_string(),
    function: FunctionSchema {
        name: "start_timer".to_string(),
        description: "Starts a countdown timer for a set number of minutes".to_string(),
        parameters: FunctionParameters {
            param_type: "object".to_string(),
            properties: HashMap::from([
                (
                    "minutes".to_string(),
                    PropertyDefinition {
                        prop_type: "number".to_string(),
                        description: "the number of minutes the timer should run".to_string(),
                    }
                ),
                (
                    "seconds".to_string(),
                    PropertyDefinition {
                        prop_type: "number".to_string(),
                        description: "if the user wants a whole number of minutes set to 0 otherwise if the user wants a timer with more precision, eg two and a half minute, then set to the relevant number of seconds".to_string(),
                    }
                ),
                (
                    "label".to_string(),
                    PropertyDefinition {
                        prop_type: "string".to_string(),
                        description: "make a short label based on what the user described, if the user gave no info just write Timer".to_string(),
                    }
                ),
            ]),
            required: vec!["minutes".to_string(), "seconds".to_string(), "label".to_string()],
        },
    },
  };
  start_timer_tool_schema
}

#[wasm_bindgen]
pub fn load_app(app_name: String) -> Result<(), JsValue> {
  println!("loading app {}", app_name);
  let tool_scope = Event::ChatCompletionToolSchemaScope {};
  let tool_scope_ec = add_event_to_heap(tool_scope);
  send_latest_event()?;
  let tool_schema_event = Event::ScopedChatCompletionToolSchema { 
    tool_schema: get_tool_schema(),
    tool_schema_scope_hash: tool_scope_ec.curr_hash.clone()
  };
  add_event_to_heap(tool_schema_event);
  send_latest_event()?;
  let tool_schema_event = Event::ScopedChatCompletionToolSchema { 
    tool_schema: get_tool_schema_list_exercises(),
    tool_schema_scope_hash: tool_scope_ec.curr_hash.clone()
  };
  add_event_to_heap(tool_schema_event);
  
  send_latest_event()?;
  let execution_policy = Event::ToolCallExecutionPolicy {
    policy: ExecutionPolicy::LinearAndImmediate,
  }; 
  add_event_to_heap(execution_policy);
  send_latest_event()?;
  Ok(())
}

#[wasm_bindgen]
pub fn port_text_message(text: String) -> Result<(), JsValue>  {
  add_user_submission_local_heap(text);
  send_latest_event()?;
  request_nonstreaming_assistant_message();
  send_latest_event()?;
  /*let close_scope = Event::CloseChatCompletionToolSchemaScope {
        tool_schema_scope_hash: Some(tool_scope_ec.curr_hash.clone())
  };
  add_event_to_heap(close_scope);
  send_latest_event()?;
  */
  Ok(())
}



#[wasm_bindgen]
pub fn get_event_list() -> String {
  EC_HEAP.with(|list| serde_json::to_string(&*list.borrow()).unwrap())
}

// General function to add any event and send it through the heap manager
fn add_event_to_heap(event: Event) -> EventContainer {
    let container = EC_HEAP.with(|list| {
        let list = list.borrow();
        if let Some(prev) = list.last() {
            append_event(prev, &event)
        } else {
            make_root_container(&event)
        }
    });
    
    // Send through heap manager - the ONLY insertion point
    let _ = local_heap_manager(container.clone());
    
    container
}

pub fn add_user_submission_local_heap(text: String) -> String {
    let event = Event::UserTextSubmission { text };
    let container = add_event_to_heap(event);
    serde_json::to_string(&container).unwrap()
}

pub fn request_nonstreaming_assistant_message() -> String {
    let event = Event::RequestNonstreamingAssistantMessage { };
    let container = add_event_to_heap(event);
    serde_json::to_string(&container).unwrap()
}

#[wasm_bindgen]
pub fn port_audio_message(data: &[u8]) -> Result<(), JsValue> {
    // Create the new AudioSubmission event with the provided data
    let audio_event = Event::AudioSubmission { data: data.to_vec() };
    add_event_to_heap(audio_event);
    send_latest_event()?;

    let request_transcription_event = Event::RequestAudioSubmissionTranscription { };
    add_event_to_heap(request_transcription_event);
    send_latest_event()?;
    Ok(())
}
