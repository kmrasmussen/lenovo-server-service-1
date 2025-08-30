import asyncio
import websockets
import logging
import argparse
import sys

# --- DIAGNOSTICS ---
# Let's print version information to be 100% sure what's running.
# This helps rule out any environment path issues.
print("--- Diagnostics ---")
print(f"Python Version: {sys.version}")
try:
    print(f"Websockets Library Version: {websockets.__version__}")
    print(f"Websockets Library Path: {websockets.__file__}")
except Exception as e:
    print(f"Could not get websockets version info: {e}")
print("-------------------\n")


# --- Basic Setup ---
# Set up logging to get clear, timestamped output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# --- Main Connection Logic ---
async def check_service(ip: str):
    """
    Attempts to connect to the ASR WebSocket service with proper headers
    and provides detailed diagnostic output.
    """
    uri = f"ws://{ip}:8080/api/asr-streaming"
    headers = {
        "kyutai-api-key": "public_token"
    }
    timeout = 10

    logging.info(f"Attempting to connect to: {uri}")
    logging.info(f"Using timeout: {timeout} seconds")
    logging.info(f"With headers: {headers}")

    try:
        # NEW APPROACH: We will wrap the connection attempt in asyncio.wait_for
        # to handle the timeout, removing the `open_timeout` keyword from the
        # connect() call. This isolates the `extra_headers` argument and tests
        # a different code path that might avoid the bug.
        
        # websockets.connect() returns an awaitable that produces a connection object
        connection_coroutine = websockets.connect(uri, additional_headers=headers)
        
        # We wrap it in wait_for and then enter the context manager
        async with await asyncio.wait_for(connection_coroutine, timeout=timeout):
            logging.info("✅ SUCCESS: Successfully connected and authenticated.")
            logging.info("The service is ready.")
            return True

    # --- Detailed Error Handling ---
    except websockets.exceptions.InvalidHandshake as e:
        logging.error(f"❌ FAILED: The WebSocket handshake failed. This often means an authentication or protocol error.")
        logging.error(f"   - Server response status: {e.status_code}")
        logging.error(f"   - Server response headers: {e.headers}")
    except ConnectionRefusedError:
        logging.error(f"❌ FAILED: Connection refused. Is the service running on port 8080 on the target machine?")
    except asyncio.TimeoutError:
        logging.error(f"❌ FAILED: Connection timed out after {timeout} seconds. Check for firewalls or network issues.")
    except Exception as e:
        # Catch any other unexpected errors.
        logging.error(f"❌ FAILED: An unexpected error occurred.")
        logging.error(f"   - Error Type: {type(e).__name__}")
        logging.error(f"   - Error Details: {e}")
        
    return False

# --- Script Entrypoint ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check the readiness of the ASR WebSocket service (v2).")
    parser.add_argument("ip_address", type=str, help="The public IP address of the VM to check.")
    
    args = parser.parse_args()
    
    # Run the async function
    asyncio.run(check_service(args.ip_address))
