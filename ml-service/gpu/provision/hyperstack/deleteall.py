import os
import requests
import sys

# --- Configuration ---
API_BASE_URL = "https://infrahub-api.nexgencloud.com/v1/core"
API_KEY = os.environ.get("HYPERSTACK_API_KEY")

# --- Helper Functions ---

def get_all_vms(headers):
    """Fetches a list of all virtual machines."""
    url = f"{API_BASE_URL}/virtual-machines"
    print("Fetching list of all virtual machines...")
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()  # Raises an exception for bad status codes (4xx or 5xx)
        data = response.json()
        if data.get("status"):
            return data.get("instances", [])
        else:
            print(f"Error listing VMs: {data.get('message')}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"An error occurred while fetching VMs: {e}")
        return None

def delete_vm(headers, vm_id, vm_name):
    """Deletes a single virtual machine by its ID."""
    url = f"{API_BASE_URL}/virtual-machines/{vm_id}"
    print(f"Attempting to delete VM: {vm_name} (ID: {vm_id})...")
    try:
        response = requests.delete(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        if data.get("status"):
            print(f"Successfully initiated deletion for VM: {vm_name} (ID: {vm_id})")
            return True
        else:
            print(f"Failed to delete VM {vm_name} (ID: {vm_id}): {data.get('message')}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"An error occurred while deleting VM {vm_id}: {e}")
        return False

# --- Main Execution ---

def main():
    """Main function to orchestrate the deletion of all VMs."""
    if not API_KEY:
        print("Error: HYPERSTACK_API_KEY environment variable not set.")
        print("Please set it before running the script.")
        sys.exit(1)

    headers = {
        "accept": "application/json",
        "api_key": API_KEY
    }

    instances = get_all_vms(headers)

    if instances is None:
        print("Could not retrieve VM list. Exiting.")
        sys.exit(1)

    if not instances:
        print("No virtual machines found to delete.")
        return

    print("-" * 50)
    print(f"Found {len(instances)} virtual machine(s) to delete:")
    for vm in instances:
        print(f"  - Name: {vm.get('name')}, ID: {vm.get('id')}")
    print("-" * 50)

    # Safety Check
    confirm = input("Are you sure you want to permanently delete all these virtual machines? (yes/no): ")
    if confirm.lower() != 'yes':
        print("Deletion cancelled by user.")
        return

    print("\nStarting deletion process...")
    deleted_count = 0
    failed_count = 0
    for vm in instances:
        vm_id = vm.get("id")
        vm_name = vm.get("name")
        if vm_id:
            if delete_vm(headers, vm_id, vm_name):
                deleted_count += 1
            else:
                failed_count += 1
        else:
            print(f"Could not find ID for VM: {vm_name}")
            failed_count += 1
    
    print("\n--- Deletion Summary ---")
    print(f"Successfully deleted: {deleted_count} machine(s).")
    print(f"Failed to delete: {failed_count} machine(s).")
    print("------------------------")


if __name__ == "__main__":
    main()
