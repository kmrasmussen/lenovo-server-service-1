import subprocess
import json
from typing import Tuple

def ssh_execute_command(ip: str, command: str, username: str = "ubuntu", timeout: int = 30) -> Tuple[bool, str]:
    """
    Execute a command via SSH and return success status and output
    """
    ssh_command = [
        "ssh", 
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        "-o", "UserKnownHostsFile=/dev/null",
        f"{username}@{ip}",
        command
    ]
    
    print(f"Executing SSH command: {' '.join(ssh_command)}")
    
    try:
        result = subprocess.run(
            ssh_command, 
            capture_output=True, 
            text=True, 
            timeout=timeout
        )
        
        success = result.returncode == 0
        output = result.stdout
        if result.stderr:
            output += f"\nSTDERR: {result.stderr}"
            
        return success, output
        
    except subprocess.TimeoutExpired:
        return False, f"SSH command timeout after {timeout} seconds"
    except Exception as e:
        return False, f"SSH error: {str(e)}"

def test_ssh_connection(ip: str):
    """
    Test SSH connection with basic commands
    """
    print(f"Testing SSH connection to {ip}")
    print("=" * 50)
    
    test_commands = [
        ("pwd", "Get current directory"),
        ("whoami", "Check current user"),
        ("uname -a", "System information"),
        ("ls -la", "List files in home directory"),
        ("df -h", "Check disk usage"),
        ("nvidia-smi", "Check GPU status"),
        ("ps aux | grep moshi", "Check if moshi is running")
    ]
    
    for command, description in test_commands:
        print(f"\n--- {description} ---")
        print(f"Command: {command}")
        
        success, output = ssh_execute_command(ip, command)
        
        if success:
            print("Success!")
            print(f"Output:\n{output}")
        else:
            print("Failed!")
            print(f"Error: {output}")

if __name__ == "__main__":
    # Use the IP from your GPU service output
    test_ip = "149.36.0.36"
    
    print(f"SSH Test for IP: {test_ip}")
    test_ssh_connection(test_ip)
