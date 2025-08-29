from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging
import asyncio
import msgpack
import websockets
import json
from fastapi.responses import HTMLResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


router = APIRouter()

@router.websocket("/ws-helloworld")
async def websocket_helloworld(websocket: WebSocket):
    await websocket.accept()
    print('ws-helloworld accepted')
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f'Hello world! You said {data}')
    except Exception as e:
        print(f'connection close ws-helloworld, error {e}')
        
@router.websocket("/ws-kyutai-tts")
async def websocket_kyutai_tts(websocket: WebSocket):
    await websocket.accept()
    print('ws-helloworld accepted')
    try:
        headers = { "kyutai-api-key": "public_token" }
        rust_ws = await websockets.connect(
                    "ws://149.36.0.23:8080/api/asr-streaming",
                    additional_headers=headers
                )
        logger.info("connected to kyutai")
    except Exception as e:
        logger.error(f'failed to connect to kyutai: error: {e}')
        await websocket.close()
        return

    async def client_to_rust():
        try:
            while True:
                data = await websocket.receive_text()

                client_msg = json.loads(data)
                logger.info(f'received data from client: {client_msg.keys()}')

                if client_msg['type'] == 'Audio':
                    chunk = {
                                'type': 'Audio',
                                'pcm': client_msg['pcm']
                            }
                    msg = msgpack.packb(
                                chunk,
                                use_bin_type=True,
                                use_single_float=True
                            )
                    await rust_ws.send(msg)
        except WebSocketDisconnect:
            logger.info('client disconnected')
        except Exception as e:
            logger.error(f'client->rust error {e}')

    async def rust_to_client():
        try:
            async for message in rust_ws:
                data = msgpack.unpackb(message, raw=False)
                await websocket.send_text(json.dumps(data))
        except Exception as e:
            logger.error(f'Rust->client error {e}')

    try:
        await asyncio.gather(client_to_rust(), rust_to_client())
    finally:
        await rust_ws.close()

@router.get("/transcribe.html", response_class=HTMLResponse)
async def get_frontend():
    """Serve the frontend HTML."""
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Real-time Speech Recognition</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background: #f5f5f5;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .controls {
                margin-bottom: 20px;
                text-align: center;
            }
            button {
                padding: 12px 24px;
                font-size: 16px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                margin: 0 10px;
            }
            .start-btn {
                background: #28a745;
                color: white;
            }
            .stop-btn {
                background: #dc3545;
                color: white;
            }
            .start-btn:disabled, .stop-btn:disabled {
                background: #6c757d;
                cursor: not-allowed;
            }
            .transcript {
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 5px;
                padding: 20px;
                min-height: 200px;
                font-size: 16px;
                line-height: 1.5;
                white-space: pre-wrap;
            }
            .status {
                margin: 10px 0;
                padding: 10px;
                border-radius: 5px;
                text-align: center;
            }
            .status.connected {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            .status.disconnected {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }
            .vad-indicator {
                display: inline-block;
                margin-left: 10px;
                font-weight: bold;
                color: #007bff;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Real-time Speech Recognition</h1>
            
            <div class="controls">
                <button id="startBtn" class="start-btn">Start Recording</button>
                <button id="stopBtn" class="stop-btn" disabled>Stop Recording</button>
            </div>
            
            <div id="status" class="status disconnected">Disconnected</div>
            
            <div id="transcript" class="transcript">Transcript will appear here...</div>
        </div>

        <script>
            class SpeechRecognizer {
                constructor() {
                    this.ws = null;
                    this.mediaRecorder = null;
                    this.audioContext = null;
                    this.isRecording = false;
                    
                    this.startBtn = document.getElementById('startBtn');
                    this.stopBtn = document.getElementById('stopBtn');
                    this.status = document.getElementById('status');
                    this.transcript = document.getElementById('transcript');
                    
                    this.startBtn.addEventListener('click', () => this.start());
                    this.stopBtn.addEventListener('click', () => this.stop());
                    
                    this.transcript.textContent = 'Click "Start Recording" to begin...';
                }
                
                async start() {
                    try {
                        // Get microphone access
                        const stream = await navigator.mediaDevices.getUserMedia({
                            audio: {
                                sampleRate: 24000,
                                channelCount: 1
                            }
                        });
                        
                        // Set up WebSocket
                        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                        this.ws = new WebSocket(`${protocol}//${window.location.host}/realtime/ws-kyutai-tts`);
                        
                        this.ws.onopen = () => {
                            this.updateStatus('Connected', true);
                            this.transcript.textContent = '';
                        };
                        
                        this.ws.onmessage = (event) => {
                            const data = JSON.parse(event.data);
                            this.handleMessage(data);
                        };
                        
                        this.ws.onclose = () => {
                            this.updateStatus('Disconnected', false);
                            this.stop();
                        };
                        
                        this.ws.onerror = (error) => {
                            console.error('WebSocket error:', error);
                            this.updateStatus('Connection Error', false);
                        };
                        
                        // Set up audio processing
                        this.audioContext = new AudioContext({ sampleRate: 24000 });
                        const source = this.audioContext.createMediaStreamSource(stream);
                        
                        // Use ScriptProcessorNode for audio processing
                        const processor = this.audioContext.createScriptProcessor(2048, 1, 1);
                        
                        processor.onaudioprocess = (event) => {
                            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                                const inputBuffer = event.inputBuffer.getChannelData(0);
                                const audioData = Array.from(inputBuffer);
                                
                                this.ws.send(JSON.stringify({
                                    type: 'Audio',
                                    pcm: audioData
                                }));
                            }
                        };
                        
                        source.connect(processor);
                        processor.connect(this.audioContext.destination);
                        
                        this.processor = processor;
                        this.stream = stream;
                        this.isRecording = true;
                        
                        this.startBtn.disabled = true;
                        this.stopBtn.disabled = false;
                        
                    } catch (error) {
                        console.error('Error starting recording:', error);
                        this.updateStatus('Error: ' + error.message, false);
                    }
                }
                
                stop() {
                    this.isRecording = false;
                    
                    if (this.ws) {
                        this.ws.close();
                        this.ws = null;
                    }
                    
                    if (this.processor) {
                        this.processor.disconnect();
                        this.processor = null;
                    }
                    
                    if (this.stream) {
                        this.stream.getTracks().forEach(track => track.stop());
                        this.stream = null;
                    }
                    
                    if (this.audioContext) {
                        this.audioContext.close();
                        this.audioContext = null;
                    }
                    
                    this.startBtn.disabled = false;
                    this.stopBtn.disabled = true;
                    this.updateStatus('Stopped', false);
                }
                
                handleMessage(data) {
                    if (data.type === 'Word') {
                        this.transcript.textContent += data.text + ' ';
                        this.transcript.scrollTop = this.transcript.scrollHeight;
                    } else if (data.type === 'Step') {
                        // Handle VAD predictions if needed
                        const pausePrediction = data.prs[2]; // Index 2 for 2.0 second predictions
                        if (pausePrediction > 0.5) {
                            // Add visual indicator for pause
                            const vadIndicator = document.createElement('span');
                            vadIndicator.className = 'vad-indicator';
                            vadIndicator.textContent = ' | ';
                            this.transcript.appendChild(vadIndicator);
                        }
                    }
                }
                
                updateStatus(message, isConnected) {
                    this.status.textContent = message;
                    this.status.className = isConnected ? 'status connected' : 'status disconnected';
                }
            }
            
            // Initialize the app
            const recognizer = new SpeechRecognizer();
        </script>
    </body>
    </html>
    """
