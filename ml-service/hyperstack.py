# hyperstack.py

import os
import sys
import requests
import uuid
from fastapi import APIRouter, HTTPException, status, Response, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import logging
import asyncio # For timeout handling
import websockets # The new dependency for the health check

# --- Initial Setup ---
router = APIRouter()
logger = logging.getLogger(__name__)

# --- Configuration and Validation ---
# (This section is the same as before)
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

# --- NEW: WebSocket Health Check Helper ---
async def is_websocket_ready(ip: str) -> bool:
    """
    Checks if the ASR WebSocket service is ready by attempting a connection.
    Returns True if successful, False otherwise.
    """
    uri = f"ws://{ip}:8080/api/asr-streaming"
    try:
        # We set a short timeout to prevent the API from hanging for a long time.
        # The 'async with' handles opening and closing the connection.
        async with websockets.connect(uri, open_timeout=3):
            logger.info(f"Successfully connected to WebSocket at {uri}")
            return True
    except (ConnectionRefusedError, asyncio.TimeoutError, websockets.exceptions.InvalidURI, websockets.exceptions.InvalidHandshake) as e:
        # These are expected errors if the service is not ready.
        logger.warning(f"WebSocket check for {ip} failed (service not ready): {e}")
        return False
    except Exception as e:
        # Catch any other unexpected errors.
        logger.error(f"An unexpected error occurred during WebSocket check for {ip}: {e}")
        return False

# --- Security & Authorization Dependencies ---
# (This section is the same as before)
def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if credentials.credentials != HYPERSTACK_ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Admin privileges are required.")

def get_spinup_user_or_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if credentials.credentials not in [HYPERSTACK_ADMIN_TOKEN, HYPERSTACK_SPINUP_TOKEN]:
        raise HTTPException(status_code=403, detail="Insufficient permissions.")

# --- Helper Functions (unchanged) ---
def get_hyperstack_headers():
    return {"accept": "application/json", "api_key": API_KEY, "content-type": "application/json"}

def get_all_vms():
    # ... (code is the same)
    url = f"{API_BASE_URL}/virtual-machines"
    try:
        response = requests.get(url, headers=get_hyperstack_headers())
        response.raise_for_status()
        data = response.json()
        return data.get("instances", []) if data.get("status") else None
    except requests.exceptions.RequestException:
        return None

def _create_a4000_vm():
    # ... (code is the same)
    instances = get_all_vms()
    if instances is None or len(instances) >= MAX_SPINNED_UP:
        return False, "Failed to check capacity or max instances reached."
    # ... rest of creation logic
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

# --- API Endpoints (with updated logic) ---

@router.get("/get_ip_or_spin_up", dependencies=[Depends(get_spinup_user_or_admin)])
async def get_ip_or_spin_up(response: Response):
    """
    Checks for a VM with a fully ready service. If found, returns the IP.
    Reports status if a VM is deploying or initializing. If none exist, spins up a new one.
    """
    logger.info("Received request for /get_ip_or_spin_up")
    instances = get_all_vms()

    if instances is None:
        raise HTTPException(status_code=502, detail="Could not retrieve VM list from Hyperstack API.")

    for vm in instances:
        # Check for infrastructure readiness first
        is_active = vm.get("status") == "ACTIVE"
        has_ip = vm.get("floating_ip") is not None
        ip_is_attached = vm.get("floating_ip_status") == "ATTACHED"

        if is_active and has_ip and ip_is_attached:
            ip_address = vm.get("floating_ip")
            
            # --- NEW LOGIC: Check application readiness ---
            service_ready = await is_websocket_ready(ip_address)
            
            if service_ready:
                logger.info(f"VM at {ip_address} is active and service is ready.")
                return {"status": "success", "message": "Found active VM with ready-to-use public IP.", "ip_address": ip_address}
            else:
                logger.info(f"VM at {ip_address} is active but the ASR service is not yet ready.")
                # We return a 200 OK because this is a valid, expected state.
                return {"status": "ip_assigned_service_not_ready", "message": "VM has a public IP, but the service is still initializing.", "ip_address": ip_address}

        # If a VM is still being created, report it as deploying.
        if vm.get("status") in ["CREATING", "BUILDING"] or vm.get("floating_ip_status") == "ATTACHING":
            return {"status": "already_deploying", "message": "A VM is currently being deployed."}
    
    # If loop finishes, no suitable VM exists.
    logger.info("No suitable VM found. Attempting to spin up a new A4000.")
    success, result = _create_a4000_vm()

    if success:
        response.status_code = status.HTTP_202_ACCEPTED
        return {"status": "now_spinning_up", "message": "A new VM is being created.", "details": result}
    else:
        response.status_code = status.HTTP_409_CONFLICT
        return {"status": "tried_spinning_up_failed", "message": "Failed to spin up a new VM.", "error_details": result}


# ... (The rest of your endpoints: spin_up_a4000, spin_down_all, list_vms remain the same)
# (I've omitted them here for brevity, but they should remain in your file)
# --- The rest of your file (spin_up_a4000, spin_down_all, etc.) goes here ---
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
            return False, data.get("message")
    except requests.exceptions.RequestException as e:
        logger.error(f"An HTTP error occurred while deleting VM {vm_id}: {e}")
        return False, str(e)


@router.post("/spin_up_a4000", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(get_spinup_user_or_admin)])
async def spin_up_a4000():
    success, result = _create_a4000_vm()
    if success:
        return result
    else:
        # The reason for failure is in the result, so return it with a conflict status.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=result)


@router.post("/spin_down_all", dependencies=[Depends(get_admin_user)])
async def spin_down_all():
    # ... (logic is the same, just protected now)
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
    # ... (logic is the same, just protected now)
    logger.info("Received request for /list_vms")
    instances = get_all_vms()
    if instances is None:
        raise HTTPException(status_code=502, detail="Could not retrieve VM list from Hyperstack API.")
    return {"count": len(instances), "instances": instances}
