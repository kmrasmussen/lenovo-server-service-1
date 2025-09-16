use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};

#[tokio::main]
async fn main() {
    println!("starting echo server");
    let ipport = "127.0.0.1:32001";
    let listener = TcpListener::bind(ipport).await.unwrap();
    println!("echo server listening on {}", ipport);
    
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

async fn handle_echo_connection(stream: TcpStream) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            println!("WebSocket handshake failed: {}", e);
            return;
        }
    };
    
    let (mut sender, mut receiver) = ws_stream.split();
    
    while let Some(msg_result) = receiver.next().await {
        match msg_result {
            Ok(Message::Text(text)) => {
                println!("Echoing: {}", text);
                let response = format!("heybro, you want me to do this stuff?: {}", text);
                if sender.send(Message::Text(response)).await.is_err() {
                    break;
                }
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
        }
    }
    
    println!("Echo connection closed");
}
