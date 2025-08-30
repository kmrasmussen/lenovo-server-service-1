import logging
import asyncio
import websockets
import os
import sys
import requests
import uuid
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# --- Initial Setup ---
router = APIRouter()
logger = logging.getLogger(__name__)

# --- Configuration and Validation ---
API_BASE_URL = "https://infrahub-api.nexgencloud.com/v1/core"
API_KEY = os.environ.get("HYPERSTACK_API_KEY")
MAX_SPINNED_UP = int(os.environ.get("MAX_SPINNED_UP", 1))
HYPERSTACK_ADMIN_TOKEN = os.environ.get("HYPERSTACK_ADMIN_TOKEN")
HYPERSTACK_SPINUP_TOKEN = os.environ.get("HYPERSTACK_SPINUP_PERMISSION_TOKEN")
bearer_scheme = HTTPBearer()

required_vars = {
    "HYPERSTACK_API_KEY": API_KEY, "HYPERSTACK_ADMIN_TOKEN": HYPERSTACK_ADMIN_TOKEN,
    "HYPERSTACK_SPINUP_PERMISSION_TOKEN": HYPERSTACK_SPINUP_TOKEN,
}
missing_vars = [var for var, val in required_vars.items() if not val]
if missing_vars:
    print(f"FATAL ERROR: Server cannot start. Missing env vars: {', '.join(missing_vars)}", file=sys.stderr)
    sys.exit(1)

# --- Enhanced WebSocket Health Check Helper ---
async def is_websocket_ready(ip: str) -> bool:
    """
    Checks if the ASR WebSocket service is ready by attempting a connection
    with the required authentication headers.
    Returns True if successful, False otherwise.
    """
    uri = f"ws://{ip}:8080/api/asr-streaming"
    headers = {
        "kyutai-api-key": "public_token"
    }
    
    logger.info(f"    🔍 WebSocket check starting for {uri}")
    logger.info(f"    📋 Using headers: {headers}")
    
    try:
        logger.info("    ⚡ Creating WebSocket connection coroutine...")
        connection_coroutine = websockets.connect(uri, additional_headers=headers)
        
        logger.info("    ⏱️  Attempting connection with 10-second timeout...")
        start_time = asyncio.get_event_loop().time()
        
        async with await asyncio.wait_for(connection_coroutine, timeout=10):
            end_time = asyncio.get_event_loop().time()
            duration = end_time - start_time
            logger.info(f"    ✅ WebSocket connection successful in {duration:.2f}s")
            return True

    except ConnectionRefusedError as e:
        logger.info(f"    ❌ Connection refused: {e}")
        return False
    except asyncio.TimeoutError as e:
        logger.info(f"    ⏱️  Connection timeout after 10 seconds: {e}")
        return False
    except websockets.exceptions.InvalidURI as e:
        logger.warning(f"    ❌ Invalid URI: {e}")
        return False
    except websockets.exceptions.InvalidHandshake as e:
        logger.info(f"    ❌ Invalid handshake (auth/protocol issue): {e}")
        return False
    except Exception as e:
        logger.error(f"    ❌ Unexpected error: {type(e).__name__}: {e}")
        return False

# --- Security & Authorization Dependencies ---
def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if credentials.credentials != HYPERSTACK_ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Admin privileges are required.")

def get_spinup_user_or_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if credentials.credentials not in [HYPERSTACK_ADMIN_TOKEN, HYPERSTACK_SPINUP_TOKEN]:
        raise HTTPException(status_code=403, detail="Insufficient permissions.")

# --- Helper Functions ---
def get_hyperstack_headers():
    return {"accept": "application/json", "api_key": API_KEY, "content-type": "application/json"}

def get_all_vms():
    url = f"{API_BASE_URL}/virtual-machines"
    logger.info(f"📡 Making API request to: {url}")
    try:
        response = requests.get(url, headers=get_hyperstack_headers())
        logger.info(f"📡 API response status: {response.status_code}")
        response.raise_for_status()
        data = response.json()
        
        api_status = data.get("status")
        instances = data.get("instances", [])
        
        logger.info(f"📡 API response status field: {api_status}")
        logger.info(f"📡 Number of instances returned: {len(instances)}")
        
        return instances if api_status else None
    except requests.exceptions.RequestException as e:
        logger.error(f"📡 API request failed: {e}")
        return None

def _create_a4000_vm():
    instances = get_all_vms()
    if instances is None or len(instances) >= MAX_SPINNED_UP:
        return False, "Failed to check capacity or max instances reached."
    vm_payload = {
        "name": f"vm-from-api-{uuid.uuid4().hex[:6]}",
        "environment_name": "myenv", "image_name": "Ubuntu Server 22.04 LTS R535 CUDA 12.2",
        "flavor_name": "n3-RTX-A4000x1", "key_name": "mykey", "count": 1, "assign_floating_ip": True,
        "user_data": "#cloud-config\nruncmd:\n  - wget https://raw.githubusercontent.com/kmrasmussen/lenovo-server-service-1/refs/heads/gpus/ml-service/gpu/provision/a4000_downloadandrun.sh\n  - chmod +x a4000_downloadandrun.sh\n  - ./a4000_downloadandrun.sh",
        "security_rules": [
            {"direction": "ingress", "protocol": "tcp", "ethertype": "IPv4", "remote_ip_prefix": "0.0.0.0/0", "port_range_min": 5000, "port_range_max": 5000},
            {"direction": "ingress", "protocol": "tcp", "ethertype": "IPv4", "remote_ip_prefix": "0.0.0.0/0", "port_range_min": 8080, "port_range_max": 8080}
        ]
    }
    url = f"{API_BASE_URL}/virtual-machines"
    try:
        response = requests.post(url, headers=get_hyperstack_headers(), json=vm_payload)
        response.raise_for_status()
        api_response_data = response.json()
        return api_response_data.get("status", False), api_response_data
    except requests.exceptions.RequestException as e:
        return False, {"error": str(e)}

# --- Enhanced Reusable Service Status Checker ---
async def get_service_status() -> dict:
    """
    Checks for a ready VM, reports status, or spins one up.
    Returns a dictionary with the status and relevant details.
    """
    logger.info("=== Starting service status check ===")
    logger.info("Retrieving VM list from Hyperstack API...")
    instances = get_all_vms()

    if instances is None:
        logger.error("❌ Failed to retrieve VM list from Hyperstack API")
        return {"status": "error", "message": "Could not retrieve VM list from Hyperstack API."}

    logger.info(f"✅ Retrieved {len(instances)} VMs from API")
    
    # Log all VMs for debugging
    for i, vm in enumerate(instances):
        logger.info(f"VM {i+1}: name='{vm.get('name')}', status='{vm.get('status')}', "
                   f"floating_ip='{vm.get('floating_ip')}', floating_ip_status='{vm.get('floating_ip_status')}'")

    logger.info("--- Checking each VM for readiness ---")
    
    for i, vm in enumerate(instances):
        vm_name = vm.get('name', 'unnamed')
        vm_status = vm.get("status")
        vm_ip = vm.get("floating_ip")
        ip_status = vm.get("floating_ip_status")
        
        logger.info(f"Checking VM {i+1} ({vm_name}):")
        logger.info(f"  - VM Status: {vm_status}")
        logger.info(f"  - Floating IP: {vm_ip}")
        logger.info(f"  - IP Status: {ip_status}")
        
        is_active = vm_status == "ACTIVE"
        has_ip = vm_ip is not None
        ip_is_attached = ip_status == "ATTACHED"
        
        logger.info(f"  - is_active: {is_active}")
        logger.info(f"  - has_ip: {has_ip}")
        logger.info(f"  - ip_is_attached: {ip_is_attached}")

        if is_active and has_ip and ip_is_attached:
            logger.info(f"  ✅ VM {vm_name} meets basic criteria (ACTIVE + IP attached)")
            logger.info(f"  🔍 Testing WebSocket service readiness at {vm_ip}...")
            
            service_ready = await is_websocket_ready(vm_ip)
            
            if service_ready:
                logger.info(f"  ✅ SERVICE READY! VM {vm_name} at {vm_ip} is fully operational")
                return {"status": "success", "message": "Found active VM with ready-to-use public IP.", "ip_address": vm_ip}
            else:
                logger.info(f"  ⏳ VM {vm_name} at {vm_ip} is active but ASR service is not yet ready")
                return {"status": "ip_assigned_service_not_ready", "message": "VM has a public IP, but the service is still initializing.", "ip_address": vm_ip}

        elif vm_status in ["CREATING", "BUILDING"]:
            logger.info(f"  ⏳ VM {vm_name} is in deployment state: {vm_status}")
            return {"status": "already_deploying", "message": "A VM is currently being deployed."}
        
        elif ip_status == "ATTACHING":
            logger.info(f"  ⏳ VM {vm_name} is attaching floating IP")
            return {"status": "already_deploying", "message": "A VM is currently being deployed."}
        
        else:
            logger.info(f"  ❌ VM {vm_name} does not meet criteria - skipping")
    
    logger.info("--- No suitable VM found ---")
    logger.info(f"Checked {len(instances)} VMs, none were ready")
    logger.info("Attempting to spin up a new A4000...")
    
    success, result = _create_a4000_vm()
    
    if success:
        logger.info("✅ Successfully initiated new VM creation")
        logger.info(f"Creation result: {result}")
        return {"status": "now_spinning_up", "message": "A new VM is being created.", "details": result}
    else:
        logger.error("❌ Failed to spin up new VM")
        logger.error(f"Failure details: {result}")
        return {"status": "tried_spinning_up_failed", "message": "Failed to spin up a new VM.", "error_details": result}

# --- Enhanced API Endpoints ---

@router.get("/get_ip_or_spin_up", dependencies=[Depends(get_spinup_user_or_admin)])
async def get_ip_or_spin_up(response: Response):
    """
    Checks for a VM with a fully ready service. If found, returns the IP.
    Reports status if a VM is deploying or initializing. If none exist, spins up a new one.
    """
    logger.info("🚀 Received request for /get_ip_or_spin_up")
    
    status_result = await get_service_status()
    
    logger.info(f"📊 Service status result: {status_result}")
    
    if status_result["status"] == "success":
        logger.info("✅ Returning success response with ready IP")
        return status_result
    elif status_result["status"] == "ip_assigned_service_not_ready":
        logger.info("⏳ Returning 'service not ready' response")
        return status_result
    elif status_result["status"] == "already_deploying":
        logger.info("⏳ Returning 'already deploying' response")
        return status_result
    elif status_result["status"] == "now_spinning_up":
        logger.info("🔄 Returning 202 'spinning up' response")
        response.status_code = status.HTTP_202_ACCEPTED
        return status_result
    elif status_result["status"] == "tried_spinning_up_failed":
        logger.error("❌ Returning 409 'spin up failed' response")
        response.status_code = status.HTTP_409_CONFLICT
        return status_result
    else: # Handles the "error" case
        logger.error(f"💥 Returning 502 error response: {status_result}")
        raise HTTPException(status_code=502, detail=status_result.get("message"))

# --- The rest of your endpoints ---
def delete_vm(vm_id, vm_name):
    url = f"{API_BASE_URL}/virtual-machines/{vm_id}"
    logger.info(f"Attempting to delete VM: {vm_name} (ID: {vm_id})")
    try:
        response = requests.delete(url, headers=get_hyperstack_headers())
        response.raise_for_status()
        data = response.json()
        if data.get("status"):
            logger.info(f"Successfully initiated deletion for VM: {vm_name}")
            return True, data.get("message")
        else:
            logger.error(f"Failed to delete VM {vm_name}: {data.get('message')}")
            return False, data.get('message')
    except requests.exceptions.RequestException as e:
        logger.error(f"An HTTP error occurred while deleting VM {vm_id}: {e}")
        return False, str(e)


@router.post("/spin_up_a4000", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(get_spinup_user_or_admin)])
async def spin_up_a4000():
    success, result = _create_a4000_vm()
    if success:
        return result
    else:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=result)


@router.post("/spin_down_all", dependencies=[Depends(get_admin_user)])
async def spin_down_all():
    logger.warning("Received ADMIN request for /spin_down_all.")
    instances = get_all_vms()
    
    if instances is None:
        raise HTTPException(status_code=502, detail="Could not retrieve VM list from Hyperstack API.")
    if not instances:
        return {"message": "No virtual machines found to delete.", "deleted_vms": []}

    deleted_vms_report = []
    for vm in instances:
        vm_id, vm_name = vm.get("id"), vm.get("name", "N/A")
        if vm_id:
            success, message = delete_vm(vm_id, vm_name)
            deleted_vms_report.append({"id": vm_id, "name": vm_name, "status": "SUCCESS" if success else "FAILED", "detail": message})
        else:
            deleted_vms_report.append({"id": None, "name": vm_name, "status": "SKIPPED", "detail": "VM had no ID."})
            
    return {"message": "VM deletion process completed.", "deleted_vms": deleted_vms_report}


@router.get("/list_vms", dependencies=[Depends(get_spinup_user_or_admin)])
async def list_vms():
    logger.info("Received request for /list_vms")
    instances = get_all_vms()
    if instances is None:
        raise HTTPException(status_code=502, detail="Could not retrieve VM list from Hyperstack API.")
    return {"count": len(instances), "instances": instances}
