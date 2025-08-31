use tokio::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use tokio_tungstenite::{accept_async, connect_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};

#[tokio::main]
async fn main() {
  println!("starting websocket server");
  let ip = "127.0.0.1";
  let port = "8004";
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

async fn process_messages(
  accumulated_msgs: Arc<Mutex<Vec<String>>>,
  mut notify_rx: tokio::sync::watch::Receiver<()>,
  worker2client_tx: tokio::sync::mpsc::UnboundedSender<Message> 
) {
  while notify_rx.changed().await.is_ok() {
    let messages = {
      let guard = accumulated_msgs.lock().unwrap();
      guard.clone()
    };

    println!("worker got {} messages", messages.len());
    let response = format!("hey i am the worker and i see you sent {} messages", messages.len());
    if let Err(e) = worker2client_tx.send(Message::Text(response.to_string())) {
      println!("worker failed to send response: {}", e);
      break;
    }
    
    if messages.len() > 0 && messages.len() % 10 == 0 {
      println!("Making api request for {} messages", messages.len());
      let client = reqwest::Client::new();
      let api_key = std::env::var("OPENROUTER_API_KEY").unwrap_or_else(|_| "".to_string());

      let conversation_history: Vec<serde_json::Value> = messages
        .iter()
        .map(|message|  serde_json::json!({
          "role": "user",
          "content": message
        }))
        .collect();
      let body = serde_json::json!({
        "model": "Qwen/Qwen2.5-1.5B-Instruct", //openai/gpt-4o-mini",
        "messages": conversation_history 
      });

      match client
        .post("http://149.36.1.167:8080/v1/chat/completions") //"https://openrouter.ai/api/v1/chat/completions")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await {
         Ok(response) =>  {
          match response.text().await {
            Ok(text) => {
              println!("got openrouter text: {}", text);
              if let Err(e) = worker2client_tx.send(Message::Text(text)) {
                println!("error when sending openrouter text to client: {}", e);
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

  println!("websocket established");

  let stt_url = "ws://127.0.0.1:8005";
  println!("will now try to connect to stt {}", stt_url);
  let stt_connect_result = connect_async(stt_url).await;
  println!("got result of attempt to connect to stt");
  let stt_stream = match stt_connect_result {
    Ok((stt_ws, _response)) => {
      println!("connected to stt at {}", stt_url);
      stt_ws
    }
    Err(e) => {
      println!("error connecting to stt: {}", e);
      return;
    }
  };

  let (mut client2me_sender, mut client2me_receiver) = ws_stream.split();
  let (mut me2stt_sender, mut me2stt_receiver) = stt_stream.split();

  let (to_client_tx, mut to_client_rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
  let to_client_tx_clone_stt2client = to_client_tx.clone();


  println!("both directions etablished");

  let accumulated_client_msgs = Arc::new(Mutex::new(Vec::<String>::new()));
  let accumulated_client_msgs_clone = accumulated_client_msgs.clone();
  let accumulated_client_msgs_worker = accumulated_client_msgs.clone();

  let (notify_tx, notify_rx) = tokio::sync::watch::channel(());

  let worker_notify_rx = notify_rx.clone();
  tokio::spawn(async move {
    process_messages(accumulated_client_msgs_worker, worker_notify_rx, to_client_tx).await
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
              println!("got msg from client {}", text);

              {
                println!("locking accumulated msgs to insert msg {}", text);
                let mut messages = accumulated_client_msgs_clone.lock().unwrap();
                println!("got hold of acc msgs");
                messages.push(text.clone());
                println!("accumulated msgs count {}", messages.len()); 
                let _ = notify_tx.send(());
                println!("notified worker");
              }

              let send_result = me2stt_sender.send(Message::Text(text)).await;
              match send_result {
                Ok(()) => {
                  println!("forwarded msg successfully");
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
            let forwarded_message = Message::Text(text);
            
            let send_result = to_client_tx_clone_stt2client.send(forwarded_message);
            match send_result {
              Ok(()) => {
                println!("stt2client forwarding succeeded");
              }
              Err(e) => {
                println!("stt2client msg forwarding failed: {}", e);
              }
            }
          }
          Ok(Message::Close(_)) => {
            println!("stt closed the connection");
          }
          Err(e) => {
            println!("error receiving from stt: {}", e);
          }
          _ => {
            println!("unknown msg from stt");
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
