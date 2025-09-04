use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
//use std::sync::{Arc, Mutex};
use tokio_tungstenite::{accept_async, connect_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};

#[tokio::main]
async fn main() {
  println!("starting websocket server");
  let ip = "0.0.0.0";
  let port = "8050";
  let ipport = format!("{}:{}", ip, port);
  let listener = TcpListener::bind(ipport.clone()).await.unwrap();
  println!("listening for tcp on {}", ipport);
  loop {
    let result = listener.accept().await;

    match result {
        Ok((stream, addr)) => {
            println!("New connection from: {}", addr);
            tokio::spawn(handle_connection(stream));
        }
        Err(e) => {
            println!("Error accepting connection {}", e);
            break;
        }
    }
  }
}

#[derive(Debug, Clone)]
pub enum BrainInputType {
  Stt(String),
  CompletionResult(String)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SttMessage {
  Ready,
  Step {
    buffered_pcm: u32,
    prs: Vec<f64>,
    step_idx: u32,
  },
  Word {
    start_time: f64,
    text: String,
  },
  EndWord {
    stop_time: f64,
  },
}

#[derive(Serialize, Deserialize)]
struct ActionMessage {
  r#type: String,
  content: String
}

async fn process_messages(
  worker2client_tx: tokio::sync::mpsc::Sender<Message>,
  mut to_brain_rx: tokio::sync::mpsc::Receiver<BrainInputType>,
  brain_tx: tokio::sync::mpsc::Sender<BrainInputType>
) {
  let mut brain_memory = Vec::<String>::new();
  while let Some(brain_input) = to_brain_rx.recv().await {
    match brain_input {
      BrainInputType::Stt(msg) => {
        println!("brain received msg: {}", msg);
        let msg_to_client = format!("brain->client.{}", brain_memory.len());
        if let Err(e) = worker2client_tx.send(Message::Text(msg_to_client)).await {
          println!("error brain sending to client: {}", e); 
          panic!("message");
        }
        let stt_inserted = format!("stt.{}.{}", brain_memory.len(), msg); 
        brain_memory.push(stt_inserted);
        println!("brain now has {} memories", brain_memory.len());
        if brain_memory.len() > 0 && brain_memory.len() % 10 == 0 {
          println!("number of brain memory mod 10 is 0");
          let brain_memory_clone = brain_memory.clone();
          let worker2client_tx_clone = worker2client_tx.clone();
          let brain_tx_clone = brain_tx.clone();
          tokio::spawn(async move {
            let client = reqwest::Client::new();
            let api_key = std::env::var("OPENROUTER_API_KEY").unwrap_or_else(|_| "".to_string());
            let body = serde_json::json!({
              "model": "openai/gpt-4.1-nano",
              "messages": [
                {
                  "role": "system",
                  "content": "Your name is Mr. Banana, you end all your answers with a greeting from Mr. Banana"
                },
                {
                  "role": "user",
                  "content": "What is the capital of France?"
                }
              ] 
            });
            match client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&body)
            .send()
            .await {
             Ok(response) =>  {
              match response.text().await {
                Ok(text) => {
                  println!("got openrouter text: {}", text);
                  if let Err(e) = brain_tx_clone.send(
                    BrainInputType::CompletionResult(text.clone())).await {
                    println!("error brain completion to itself: {}", e); 
                  }
                }
                Err(e) => {
                  println!("error when getting text from openrouter response: {}", e);
                }
              }
             }
             Err(e) => {
                println!("error making openrouter request: {}", e);
             }
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;
            
            let memories_concat = brain_memory_clone.join("\n");
            let llm_response = format!("llmresponse_youhave{}messages:{}", brain_memory_clone.len(), memories_concat);

            if let Err(e) = worker2client_tx_clone.send(Message::Text(llm_response.clone())).await {
              println!("error brain sending to client: {}", e); 
            }
            if let Err(e) = brain_tx_clone.send(BrainInputType::CompletionResult(llm_response.clone())).await {
              println!("error brain completion to itself: {}", e); 
            }
          });
        }
      }
      BrainInputType::CompletionResult(result) => {
        println!("brain got completion result: {}", result);
        let completion_insertion = format!("completionresult.{}.{}", brain_memory.len(), result);
        brain_memory.push(completion_insertion);
        let action_msg = ActionMessage {
          r#type: "Action".to_string(),
          content: result.to_string(),
        };
        let msg_to_client = serde_json::to_string(&action_msg).unwrap(); 
        if let Err(e) = worker2client_tx.send(Message::Text(msg_to_client.to_string())).await {
          println!("error brain sending to client: {}", e); 
          panic!("message");
        }

      } 
    }
  }
}

async fn handle_connection(stream: TcpStream) {

  let ws_result = accept_async(stream).await;
  let ws_stream = match ws_result {
    Ok(ws) => {
      println!("succeeded in making the tcp into a websocket stream");
      ws
    }
    Err(e) => {
        println!("there was an error making the tcp stream into a websocket stream: {}", e);
        return;
    }
  };
  let stt_url = "ws://149.36.0.220:8080/api/asr-streaming";
  let mut request = stt_url.into_client_request().unwrap();
  request.headers_mut().insert(
    "kyutai-api-key",
    "public_token".parse().unwrap(),
  );

  println!("built request with header");
  println!("will now try to connect to stt {}", stt_url);
  let stt_connect_result = connect_async(request).await;
  println!("got result of attempt to connect to stt");
  let stt_stream = match stt_connect_result {
    Ok((stt_ws, _response)) => {
      println!("connected to stt at {}: response {:?}", stt_url, _response);
      stt_ws
    }
    Err(e) => {
      println!("error connecting to stt: {}", e);
      return;
    }
  };

  let (mut client2me_sender, mut client2me_receiver) = ws_stream.split();
  let (mut me2stt_sender, mut me2stt_receiver) = stt_stream.split();

  let channel_to_client_max_messages = 20000;
  let (to_client_tx, mut to_client_rx) = tokio::sync::mpsc::channel::<Message>(channel_to_client_max_messages);
  let to_client_tx_clone_stt2client = to_client_tx.clone();

  let brain_channel_max = 20000;
  let (brain_tx, brain_rx) = tokio::sync::mpsc::channel::<BrainInputType>(brain_channel_max);
  let brain_tx_clone_stt2client = brain_tx.clone();

  println!("both directions etablished");

  //let accumulated_from_stt_msgs = Arc::new(Mutex::new(Vec::<String>::new()));
  //let accumulated_from_stt_msgs_clone = accumulated_from_stt_msgs.clone();
  //let accumulated_from_stt_msgs_worker = accumulated_from_stt_msgs.clone();

  //let (notify_tx, notify_rx) = tokio::sync::watch::channel(());

  //let worker_notify_rx = notify_rx.clone();
  tokio::spawn(async move {
    process_messages(to_client_tx, brain_rx, brain_tx).await
  });

  let client_sender_task = tokio::spawn(async move {
    while let Some(msg) = to_client_rx.recv().await {
      if let Err(e) = client2me_sender.send(msg).await {
        println!("failed to send to client: {}", e);
        break;
      }
    }
  });

  let client2stt = tokio::spawn(async move {
    loop {
      let msg_result = client2me_receiver.next().await;
      match msg_result {
        Some(msg_inner_result) => {
          match msg_inner_result {
            Ok(Message::Text(text)) => {
              match serde_json::from_str::<serde_json::Value>(&text) {
                Ok(json_data) => {
                  match rmp_serde::to_vec(&json_data) {
                    Ok(msgpack_data) => {
                      if let Err(e) = me2stt_sender.send(Message::Binary(msgpack_data)).await {
                        println!("error sending msgpack data to stt: {}", e);
                      }
                    }
                    Err(e) => {
                      println!("error json from client to msg conversion: {}", e);
                    }
                  }
                }
                Err(e) => {
                  println!("error parsing json from client: {}", e);
                }
              } 

              let send_result = me2stt_sender.send(Message::Text(text)).await;
              match send_result {
                Ok(()) => {
                  //println!("forwarded msg successfully");
                }
                Err(e) => {
                  println!("error when forwarding {}", e);
                  break;
                }
              }
            }
            Ok(Message::Close(_)) => {
              println!("client requested close");
              break;
            }
            Err(e) => {
              println!("error receiving from client {}", e);
              break;
            }
            _ => {
              println!("unknown message from client");
              break;
            }
          }
        }
        None => {
          println!("conn to client ended");
          break;
        }
      }
    }
  }); 
 
  let stt2client = tokio::spawn(async move {
    loop {
      let msg_result = me2stt_receiver.next().await;

      match msg_result {
        Some(msg_inner_result) => { match msg_inner_result {
          Ok(Message::Text(text)) => {
            println!("stt2client received text: {}", text);
            let forwarded_message = Message::Text(text.clone());
            if let Err(e) = to_client_tx_clone_stt2client.send(forwarded_message).await {
              println!("error in stt2client when forwarding text message: {}", e);
              panic!("353245325");
            }
            if let Err(e) = brain_tx_clone_stt2client.send(BrainInputType::Stt(text.clone())).await {
              println!("error in stt2client->brain when forwarding text message: {}", e);
              panic!("2345345");
            }

            /*
            {
              println!("locking accumulated msgs to insert msg {}", text);
              let mut messages = accumulated_from_stt_msgs_clone.lock().unwrap();
              println!("got hold of acc msgs");
              messages.push(text.clone());
              println!("accumulated msgs count {}", messages.len()); 
              let _ = notify_tx.send(());
              println!("notified worker");
            }
            */
          }
          Ok(Message::Binary(data)) => {
              match rmp_serde::from_slice::<SttMessage>(&data) {
                Ok(stt_msg) => {
                  println!("stt sent msgpack data: {:?}", stt_msg);
                  match &stt_msg {
                    SttMessage::Word { text, start_time } => {
                      println!("WORD {}", text);
                      if let Err(e) = brain_tx_clone_stt2client.send(BrainInputType::Stt(text.clone())).await {
                        println!("error in stt2client when forwarding text message: {} {}", e, start_time);
                      }
                    }
                    SttMessage::Step { buffered_pcm : _, prs: _, step_idx } => {

                      println!("STEP {}", step_idx);
                    }
                    SttMessage::Ready => {
                      println!("READY");
                    }
                    SttMessage::EndWord { stop_time } => {
                      println!("ENDWORD {}", stop_time);
                    }
                  }
                  let json_text = serde_json::to_string(&stt_msg).unwrap_or_default();
                  let forward_message = Message::Text(json_text);
                  if let Err(e) = to_client_tx_clone_stt2client.send(forward_message).await {
                    println!("error when forwarding msgpack content to client: {}", e);
                  }
                }
                Err(e) => {
                  println!("failed to decode client binary data as msgpack data: {}", e);
                }
              }
          }
          Ok(Message::Close(_)) => {
            println!("stt closed the connection");
          }
          Err(e) => {
            println!("error receiving from stt: {}", e);
          }
          other => {
            println!("unknown msg from stt: {:?}", other);
          }
        }}
        None => {
        }
      }
    }
  });

  let (client2stt_task_result, stt2client_task_result, client_sender_task_result) = tokio::join!(
    client2stt, 
    stt2client,
    client_sender_task); 

  match client2stt_task_result {
    Ok(()) => println!("client2stt ended successfully"),
    Err(e) => println!("client2sst ended with error: {}", e)
  }

  match stt2client_task_result {
    Ok(()) => println!("stt2client ended successfully"),
    Err(e) => println!("client2stt ended with error: {}", e)
  }

  match client_sender_task_result {
    Ok(()) => println!("client sender ended successfully"),
    Err(e) => println!("client sender ended with error: {}", e)
  }
}
