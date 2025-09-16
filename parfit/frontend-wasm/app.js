import init, { 
    add_user_submission_local_heap, 
    get_event_list, 
    connect_websocket, 
    send_latest_event,
    request_nonstreaming_assistant_message,
} from './pkg/frontend_wasm.js';

async function run() {
    await init();
    const output = document.getElementById('output');
    
    document.getElementById('addLocalHeapBtn').onclick = () => {
        const text = document.getElementById('eventText').value;
        const json = add_user_submission_local_heap(text);
        output.textContent = "Added event:\n" + json;
    };
    
    document.getElementById('showBtn').onclick = () => {
        const json = get_event_list();
        output.textContent = "All events:\n" + json;
    };
    
    document.getElementById('sendLatestEventBtn').onclick = async () => {
        try {
            const result = await send_latest_event();
            console.log('send latest event result', result);
        } catch (error) {
            output.textContent = "Send event error: " + error;
        }
    };
  
    document.getElementById('reqRequestBtn').onclick = async () => {
        try {
            const result = await request_nonstreaming_assistant_message();
            console.log('adding assistant request result', result);
        } catch (error) {
            output.textContent = "Send event error: " + error;
        }
    };
    
    document.getElementById('connectBtn').onclick = () => {
        const url = document.getElementById('wsUrl').value;
        try {
            connect_websocket(url);
            output.textContent = "Connecting to: " + url;
        } catch (error) {
            output.textContent = "Connection error: " + error;
        }
    };
}

run();
