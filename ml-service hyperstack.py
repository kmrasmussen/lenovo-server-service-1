# hyperstack.py

import os
import requests
import uuid
from fastapi import APIRouter, HTTPException, status
import logging

# --- Initial Setup ---
router = APIRouter()
logger = logging.getLogger(__name__)

# --- Hyperstack API Configuration ---
API_BASE_URL = "https://infrahub-api.nexgencloud.com/v1/core"
API_KEY = os.environ.get("HYPERSTACK_API_KEY")

# --- Helper Functions for API Interaction ---

def get_hyperstack_headers():
    """Constructs and returns the required headers for API requests."""
    if not API_KEY:
        logger.error("HYPERSTACK_API_KEY environment variable is not set.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="HYPERSTACK_API_KEY is not configured on the server."
        )
    return {
        "accept": "application/json",
        "api_key": API_KEY,
        "content-type": "application/json"
    }

def get_all_vms():
    """Fetches a list of all virtual machines from Hyperstack."""
    url = f"{API_BASE_URL}/virtual-machines"
    logger.info("Fetching list of all virtual machines...")
    try:
        response = requests.get(url, headers=get_hyperstack_headers())
        response.raise_for_status()
        data = response.json()
        if data.get("status"):
            return data.get("instances", [])
        else:
            logger.error(f"Error listing VMs from API: {data.get('message')}")
            return None
    except requests.exceptions.RequestException as e:
        logger.error(f"An HTTP error occurred while fetching VMs: {e}")
        return None

def delete_vm(vm_id, vm_name):
    """Deletes a single virtual machine by its ID."""
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


# --- API Endpoints ---

@router.post("/spin_up_a4000", status_code=status.HTTP_202_ACCEPTED)
async def spin_up_a4000():
    """
    Creates and deploys a new A4000 virtual machine with a predefined configuration.
    """
    logger.info("Received request for /spin_up_a4000")
    
    # Generate a unique name for the VM to avoid conflicts
    unique_name = f"vm-from-api-{uuid.uuid4().hex[:6]}"
    
    vm_payload = {
        "name": unique_name,
        "environment_name": "myenv",
        "image_name": "Ubuntu Server 22.04 LTS R535 CUDA 12.2",
        "flavor_name": "n3-RTX-A4000x1",
        "key_name": "mykey",
        "count": 1,
        "assign_floating_ip": True,
        "user_data": "#cloud-config\nruncmd:\n  - wget https://raw.githubusercontent.com/kmrasmussen/lenovo-server-service-1/refs/heads/gpus/ml-service/gpu/provision/a4000_downloadandrun.sh\n  - chmod +x a4000_downloadandrun.sh\n  - ./a4000_downloadandrun.sh",
        "security_rules": [
            {
                "direction": "ingress",
                "protocol": "tcp",
                "ethertype": "IPv4",
                "remote_ip_prefix": "0.0.0.0/0",
                "port_range_min": 5000,
                "port_range_max": 5000
            },
            {
                "direction": "ingress",
                "protocol": "tcp",
                "ethertype": "IPv4",
                "remote_ip_prefix": "0.0.0.0/0",
                "port_range_min": 8080,
                "port_range_max": 8080
            }
        ]
    }
    
    url = f"{API_BASE_URL}/virtual-machines"
    logger.info(f"Sending request to create VM: {unique_name}")
    
    try:
        response = requests.post(url, headers=get_hyperstack_headers(), json=vm_payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to create VM. Error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error communicating with Hyperstack API: {e}"
        )


@router.post("/spin_down_all")
async def spin_down_all():
    """
    Finds and permanently deletes all virtual machines in the Hyperstack account.
    This is a destructive operation.
    """
    logger.warning("Received request for /spin_down_all - This is a destructive operation.")
    
    instances = get_all_vms()
    
    if instances is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not retrieve VM list from Hyperstack API."
        )

    if not instances:
        logger.info("No virtual machines found to delete.")
        return {"message": "No virtual machines found to delete.", "deleted_vms": []}

    deleted_vms_report = []
    for vm in instances:
        vm_id = vm.get("id")
        vm_name = vm.get("name", "N/A")
        if vm_id:
            success, message = delete_vm(vm_id, vm_name)
            report_entry = {"id": vm_id, "name": vm_name, "status": "SUCCESS" if success else "FAILED", "detail": message}
            deleted_vms_report.append(report_entry)
        else:
            deleted_vms_report.append({"id": None, "name": vm_name, "status": "SKIPPED", "detail": "VM had no ID."})
            
    return {
        "message": "VM deletion process completed.",
        "deleted_vms": deleted_vms_report
    }

# --- NEW ENDPOINT ---
@router.get("/list_vms")
async def list_vms():
    """
    Retrieves and lists all virtual machines in the Hyperstack account.
    """
    logger.info("Received request for /list_vms")
    
    instances = get_all_vms()
    
    if instances is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not retrieve VM list from Hyperstack API."
        )
        
    return {"count": len(instances), "instances": instances}
