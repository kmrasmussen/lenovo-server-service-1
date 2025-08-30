import requests
import json
import os
from typing import Dict, Any, Tuple
from enum import Enum

class DeploymentResult(Enum):
    SUCCESS = "success"
    NO_AVAILABILITY = "no_availability"
    CREATION_ERROR = "creation_error"

class PodCheckResult(Enum):
    HAS_PODS = "has_pods"
    NO_PODS = "no_pods"
    ERROR = "error"

class PrimeIntellectClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("API key is required")
        
        self.api_key = api_key
        self.base_url = "https://api.primeintellect.ai/api/v1"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def get_availability(self, gpu_type: str = "A4000_16GB") -> Dict[str, Any]:
        """
        Get GPU availability for specified GPU type
        """
        url = f"{self.base_url}/availability/"
        params = {"gpu_type": gpu_type}
        
        try:
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            print(f"Error fetching availability: {e}")
            return {}
    
    def find_hyperstack_a4000(self, gpu_count: int = 1, image: str = "ubuntu_22_cuda_12") -> Dict[str, Any] | None:
        """
        Find available Hyperstack A4000 GPU with specified configuration
        """
        availability = self.get_availability("A4000_16GB")
        
        if "A4000_16GB" not in availability:
            return None
        
        for config in availability["A4000_16GB"]:
            if (config.get("provider") == "hyperstack" and
                config.get("gpuCount") == gpu_count and
                config.get("stockStatus") == "Available" and
                image in config.get("images", [])):
                
                return config
        
        return None
    
    def create_pod_payload(self, config: Dict[str, Any], image: str = "ubuntu_22_cuda_12") -> Dict[str, Any]:
        """
        Create the payload for pod creation based on found configuration
        """
        return {
            "pod": {
                "autoRestart": False,
                "cloudId": config["cloudId"],
                "gpuType": config["gpuType"],
                "socket": config["socket"],
                "gpuCount": config["gpuCount"],
                "image": image,
                "security": config["security"],
                "dataCenterId": config["dataCenter"]
            },
            "provider": {
                "type": config["provider"]
            }
        }
    
    def get_existing_pods(self, limit: int = 100) -> Dict[str, Any]:
        """
        Get list of existing pods
        """
        url = f"{self.base_url}/pods/"
        params = {"limit": limit}
        
        try:
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            return {
                "error": str(e),
                "status_code": getattr(e.response, 'status_code', None) if hasattr(e, 'response') else None
            }
    
    def check_existing_pods(self) -> Tuple[PodCheckResult, Dict[str, Any]]:
        """
        Check if user has any existing pods
        Returns tuple of (result_type, payload)
        """
        pods_response = self.get_existing_pods()
        
        if "error" in pods_response:
            return PodCheckResult.ERROR, {
                "message": "Failed to fetch existing pods",
                "error_details": pods_response
            }
        
        total_count = pods_response.get("total_count", 0)
        pods_data = pods_response.get("data", [])
        
        if total_count == 0:
            return PodCheckResult.NO_PODS, {
                "message": "No existing pods found",
                "total_count": 0,
                "pods": []
            }
        else:
            return PodCheckResult.HAS_PODS, {
                "message": f"Found {total_count} existing pod(s)",
                "total_count": total_count,
                "pods": pods_data
            }
        """
        Create a pod with the specified configuration
        """
        url = f"{self.base_url}/pods/"
        
        try:
            response = requests.post(url, headers=self.headers, json=payload)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            error_info = {
                "error": str(e),
                "status_code": getattr(e.response, 'status_code', None) if hasattr(e, 'response') else None,
                "response_text": getattr(e.response, 'text', None) if hasattr(e, 'response') else None
            }
            return error_info
    
    def try_deploy_gpu(self, gpu_count: int = 1, image: str = "ubuntu_22_cuda_12") -> Tuple[DeploymentResult, Dict[str, Any]]:
        """
        Attempt to deploy a GPU instance
        Returns tuple of (result_type, payload)
        """
        # Find available configuration
        config = self.find_hyperstack_a4000(gpu_count, image)
        
        if not config:
            return DeploymentResult.NO_AVAILABILITY, {
                "message": f"No available Hyperstack A4000 with {gpu_count} GPU(s) and {image} image",
                "searched_specs": {
                    "provider": "hyperstack",
                    "gpu_type": "A4000_16GB", 
                    "gpu_count": gpu_count,
                    "image": image,
                    "required_status": "Available"
                }
            }
        
        # Create pod
        payload = self.create_pod_payload(config, image)
        result = self.create_pod(payload)
        
        # Check if creation was successful
        if "id" in result and "status" in result:
            return DeploymentResult.SUCCESS, result
        else:
            return DeploymentResult.CREATION_ERROR, {
                "message": "Failed to create pod",
                "error_details": result,
                "attempted_payload": payload
            }

    def smart_deploy_gpu(self, gpu_count: int = 1, image: str = "ubuntu_22_cuda_12") -> Tuple[str, Dict[str, Any]]:
        """
        Smart deployment: check for existing pods first, only deploy if none exist
        Returns tuple of (action_taken, payload)
        """
        # First check if we have existing pods
        check_result, check_payload = self.check_existing_pods()
        
        if check_result == PodCheckResult.ERROR:
            return "check_error", check_payload
            
        elif check_result == PodCheckResult.HAS_PODS:
            return "existing_found", check_payload
            
        else:  # NO_PODS
            # No existing pods, try to deploy new one
            deploy_result, deploy_payload = self.try_deploy_gpu(gpu_count, image)
            
            if deploy_result == DeploymentResult.SUCCESS:
                return "deployed_new", deploy_payload
            elif deploy_result == DeploymentResult.NO_AVAILABILITY:
                return "no_availability", deploy_payload
            else:  # CREATION_ERROR
                return "deployment_error", deploy_payload

# Example usage
if __name__ == "__main__":
    api_key = os.getenv("PRIMEINTELLECT_API_KEY")
    if not api_key:
        print("Error: PRIMEINTELLECT_API_KEY environment variable not set")
        exit(1)
    
    try:
        client = PrimeIntellectClient(api_key)
        
        print("=== Checking for existing pods ===")
        check_result, check_payload = client.check_existing_pods()
        
        if check_result == PodCheckResult.HAS_PODS:
            print(f"Found {check_payload['total_count']} existing pod(s):")
            for pod in check_payload['pods']:
                print(f"  - {pod['name']} (ID: {pod['id']}, Status: {pod['status']})")
                
        elif check_result == PodCheckResult.NO_PODS:
            print("No existing pods found")
            
        else:  # ERROR
            print(f"Error checking pods: {check_payload['message']}")
        
        print("\n=== Smart deployment ===")
        action, payload = client.smart_deploy_gpu(gpu_count=1, image="ubuntu_22_cuda_12")
        
        if action == "existing_found":
            print(f"Skipping deployment - found {payload['total_count']} existing pod(s)")
            for pod in payload['pods']:
                print(f"  - {pod['name']} (Status: {pod['status']}, Price: ${pod['priceHr']}/hr)")
                
        elif action == "deployed_new":
            print("No existing pods found, deployed new GPU:")
            print(f"  Pod ID: {payload.get('id')}")
            print(f"  Name: {payload.get('name')}")
            print(f"  Status: {payload.get('status')}")
            print(f"  Price/hr: ${payload.get('priceHr')}")
            
        elif action == "no_availability":
            print("No existing pods and no GPUs available for deployment")
            print(f"  Searched for: {payload['searched_specs']}")
            
        elif action == "deployment_error":
            print("No existing pods but failed to deploy new GPU")
            print(f"  Error: {payload['message']}")
            
        elif action == "check_error":
            print("Failed to check existing pods")
            print(f"  Error: {payload['message']}")
                
    except ValueError as e:
        print(f"Configuration error: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")
