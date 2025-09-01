#!/bin/bash

# Combined GPU Worker Setup Script
# 1. Sets up Cloudflare Tunnel with multiple port mappings
# 2. Sets up Moshi ASR server

set -e  # Exit on any error

# Setup logging
SETUP_LOG="/home/ubuntu/setuplog.txt"
exec > >(tee -a "$SETUP_LOG")
exec 2>&1

echo "=== Starting Combined GPU Worker Setup ===" >> "$SETUP_LOG"
echo "$(date): Beginning setup process" >> "$SETUP_LOG"

# --- CONFIGURATION ---
CF_API_TOKEN="${CF_API_TOKEN}"
CF_ZONE_ID="${CF_ZONE_ID}"

TUNNEL_NAME="$(hostname)-gpu"
DOMAIN="intercebd.com"

echo "=== GPU Worker Tunnel Setup Script ===" >> "$SETUP_LOG"
echo "Tunnel name: $TUNNEL_NAME" >> "$SETUP_LOG"
echo "Domain: $DOMAIN" >> "$SETUP_LOG"
echo "" >> "$SETUP_LOG"

# Function to check if a command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Cleanup existing setup
cleanup_existing() {
    echo "=== Cleaning up existing setup ===" >> "$SETUP_LOG"
    
    # Stop existing services
    sudo systemctl stop cloudflared cloudflared-gpu 2>/dev/null || true
    sudo systemctl disable cloudflared cloudflared-gpu 2>/dev/null || true
    
    # Remove old service files
    sudo rm -f /etc/systemd/system/cloudflared.service
    sudo rm -f /etc/systemd/system/cloudflared-gpu.service
    
    # Clean up old/orphaned credential files
    if [ -d "/etc/cloudflared" ]; then
        echo "Cleaning up old credential files..." >> "$SETUP_LOG"
        # Remove any .json files that don't correspond to active tunnels
        find /etc/cloudflared -name "*.json" -type f | while read -r cred_file; do
            tunnel_id=$(basename "$cred_file" .json)
            # Check if this tunnel ID exists in Cloudflare
            if [ ${#tunnel_id} -eq 36 ]; then  # UUID length check
                echo "Checking tunnel credentials: $tunnel_id" >> "$SETUP_LOG"
            fi
        done
    fi
    
    sudo systemctl daemon-reload
    echo "Cleanup complete" >> "$SETUP_LOG"
    echo "" >> "$SETUP_LOG"
}

# Install system dependencies
install_dependencies() {
    echo "=== Installing System Dependencies ===" >> "$SETUP_LOG"
    
    export DEBIAN_FRONTEND=noninteractive
    
    # Handle any existing apt locks more aggressively
    echo "Cleaning package manager locks..." >> "$SETUP_LOG"
    sudo pkill -f apt-get || true
    sudo pkill -f apt || true
    sudo pkill -f dpkg || true
    sudo rm -f /var/lib/dpkg/lock-frontend || true
    sudo rm -f /var/lib/dpkg/lock || true
    sudo rm -f /var/cache/apt/archives/lock || true
    sudo rm -f /var/lib/apt/lists/lock || true
    sudo dpkg --configure -a || true
    
    # Update package list
    echo "Updating package list..." >> "$SETUP_LOG"
    sudo apt update
    
    # Install basic tools
    sudo apt install -y curl jq git htop
    
    # Install Python and pip if not present
    if ! command_exists python3; then
        sudo apt install -y python3 python3-pip
    fi
    
    # Install Docker
    if command_exists docker; then
        echo "Docker is already installed" >> "$SETUP_LOG"
        docker --version >> "$SETUP_LOG"
    else
        echo "Installing Docker..." >> "$SETUP_LOG"
        # Remove old versions
        sudo apt remove docker.io docker-doc docker-compose podman-docker containerd runc -y 2>/dev/null || true
        
        # Install prerequisites
        sudo apt install ca-certificates curl gnupg lsb-release -y
        
        # Add Docker's official GPG key
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        
        # Set up repository
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        # Install Docker Engine
        sudo apt update
        sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y
        
        # Add user to docker group
        sudo usermod -aG docker $USER
        
        echo "Docker installed" >> "$SETUP_LOG"
    fi
    
    # Install Docker Compose (standalone)
    if command_exists docker-compose; then
        echo "Docker Compose is already installed" >> "$SETUP_LOG"
        docker-compose --version >> "$SETUP_LOG"
    else
        echo "Installing Docker Compose..." >> "$SETUP_LOG"
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        echo "Docker Compose installed" >> "$SETUP_LOG"
    fi
    
    echo "System Dependencies Complete" >> "$SETUP_LOG"
    echo "" >> "$SETUP_LOG"
}

# Install cloudflared
install_cloudflared() {
    if command_exists cloudflared; then
        echo "cloudflared is already installed" >> "$SETUP_LOG"
        return 0
    fi
    
    echo "=== Installing Cloudflared ===" >> "$SETUP_LOG"
    
    # Add Cloudflare's GPG key
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    
    # Add the repository
    echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
    
    # Update package list and install
    sudo apt update
    sudo apt install cloudflared -y
    
    echo "cloudflared installed successfully" >> "$SETUP_LOG"
    echo "" >> "$SETUP_LOG"
}

# Create tunnel via API
create_tunnel() {
    echo "=== Creating Tunnel via API ===" >> "$SETUP_LOG"
    
    # Get account ID
    ACCOUNT_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts" -H "Authorization: Bearer ${CF_API_TOKEN}")
    ACCOUNT_ID=$(echo "$ACCOUNT_RESPONSE" | jq -r '.result[0].id // empty')
    
    if [ -z "$ACCOUNT_ID" ]; then
        echo "Failed to get account ID. Check your API token." >> "$SETUP_LOG"
        exit 1
    fi
    
    # Check if tunnel already exists and is active
    TUNNELS_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel" -H "Authorization: Bearer ${CF_API_TOKEN}")
    EXISTING_TUNNEL=$(echo "$TUNNELS_RESPONSE" | jq -r ".result[]? | select(.name==\"${TUNNEL_NAME}\" and (.deleted_at == null)) | .id // empty")
    
    if [ ! -z "$EXISTING_TUNNEL" ]; then
        echo "Active tunnel ${TUNNEL_NAME} found with ID: $EXISTING_TUNNEL" >> "$SETUP_LOG"
        TUNNEL_ID="$EXISTING_TUNNEL"
        
        # Check if credentials exist for this tunnel
        if [ ! -f "/etc/cloudflared/${TUNNEL_ID}.json" ]; then
            echo "Warning: Tunnel exists but no credentials found. This may cause issues." >> "$SETUP_LOG"
            echo "Deleting and recreating tunnel to ensure proper credentials..." >> "$SETUP_LOG"
            
            # Delete the problematic tunnel
            curl -s -X DELETE "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}" \
                -H "Authorization: Bearer ${CF_API_TOKEN}" > /dev/null
            
            # Create new tunnel
            echo "Creating fresh tunnel: ${TUNNEL_NAME}" >> "$SETUP_LOG"
            TUNNEL_SECRET=$(openssl rand -base64 32)
            
            TUNNEL_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel" \
                -H "Authorization: Bearer ${CF_API_TOKEN}" \
                -H "Content-Type: application/json" \
                --data "{\"name\":\"${TUNNEL_NAME}\",\"tunnel_secret\":\"${TUNNEL_SECRET}\"}")
            
            TUNNEL_ID=$(echo "$TUNNEL_RESPONSE" | jq -r '.result.id // empty')
            
            if [ -z "$TUNNEL_ID" ]; then
                echo "Failed to create fresh tunnel:" >> "$SETUP_LOG"
                echo "$TUNNEL_RESPONSE" >> "$SETUP_LOG"
                exit 1
            fi
            
            echo "Created fresh tunnel with ID: $TUNNEL_ID" >> "$SETUP_LOG"
        fi
    else
        echo "Creating new tunnel: ${TUNNEL_NAME}" >> "$SETUP_LOG"
        TUNNEL_SECRET=$(openssl rand -base64 32)
        
        TUNNEL_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel" \
            -H "Authorization: Bearer ${CF_API_TOKEN}" \
            -H "Content-Type: application/json" \
            --data "{\"name\":\"${TUNNEL_NAME}\",\"tunnel_secret\":\"${TUNNEL_SECRET}\"}")
        
        TUNNEL_ID=$(echo "$TUNNEL_RESPONSE" | jq -r '.result.id // empty')
        
        if [ -z "$TUNNEL_ID" ]; then
            echo "Failed to create tunnel:" >> "$SETUP_LOG"
            echo "$TUNNEL_RESPONSE" >> "$SETUP_LOG"
            exit 1
        fi
        
        echo "Created tunnel with ID: $TUNNEL_ID" >> "$SETUP_LOG"
    fi
    
    export TUNNEL_ID ACCOUNT_ID TUNNEL_SECRET
    echo "" >> "$SETUP_LOG"
}

# Setup credentials
setup_credentials() {
    echo "=== Setting up Credentials ===" >> "$SETUP_LOG"
    
    sudo mkdir -p /etc/cloudflared
    
    # Always ensure credentials exist
    if [ ! -f "/etc/cloudflared/${TUNNEL_ID}.json" ]; then
        if [ ! -z "$TUNNEL_SECRET" ]; then
            # Create new credentials
            sudo cat <<EOF > /etc/cloudflared/${TUNNEL_ID}.json
{
  "AccountTag": "${ACCOUNT_ID}",
  "TunnelSecret": "${TUNNEL_SECRET}",
  "TunnelID": "${TUNNEL_ID}"
}
EOF
            echo "Created new credentials file" >> "$SETUP_LOG"
        else
            echo "Error: No tunnel secret available and no existing credentials found" >> "$SETUP_LOG"
            exit 1
        fi
    else
        echo "Using existing credentials file" >> "$SETUP_LOG"
    fi
    echo "" >> "$SETUP_LOG"
}

# Create config file
create_config() {
    echo "=== Creating Configuration ===" >> "$SETUP_LOG"
    
    cat << EOF | sudo tee /etc/cloudflared/config.yml > /dev/null
tunnel: $TUNNEL_ID
credentials-file: /etc/cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $TUNNEL_NAME-ssh.$DOMAIN
    service: ssh://localhost:22
  - hostname: $TUNNEL_NAME-8000.$DOMAIN
    service: http://localhost:8000
  - hostname: $TUNNEL_NAME-8050.$DOMAIN
    service: http://localhost:8050
  - hostname: $TUNNEL_NAME-8051.$DOMAIN
    service: http://localhost:8051
  - hostname: $TUNNEL_NAME-8052.$DOMAIN
    service: http://localhost:8052
  - hostname: $TUNNEL_NAME-8080.$DOMAIN
    service: http://localhost:8080
  - hostname: $TUNNEL_NAME-9050.$DOMAIN
    service: http://localhost:9050
  - hostname: $TUNNEL_NAME-9051.$DOMAIN
    service: http://localhost:9051
  - hostname: $TUNNEL_NAME-9052.$DOMAIN
    service: http://localhost:9052
  - service: http_status:404
EOF
    
    echo "Configuration file created" >> "$SETUP_LOG"
    echo "" >> "$SETUP_LOG"
}

# Setup DNS records via API
setup_dns() {
    echo "=== Setting up DNS Records via API ===" >> "$SETUP_LOG"
    
    TUNNEL_CNAME="${TUNNEL_ID}.cfargotunnel.com"
    
    hostnames=(
        "$TUNNEL_NAME-ssh"
        "$TUNNEL_NAME-8000"
        "$TUNNEL_NAME-8050" 
        "$TUNNEL_NAME-8051"
        "$TUNNEL_NAME-8052"
        "$TUNNEL_NAME-8080"
        "$TUNNEL_NAME-9050"
        "$TUNNEL_NAME-9051"
        "$TUNNEL_NAME-9052"
    )
    
    for hostname in "${hostnames[@]}"; do
        echo "Creating DNS record for: ${hostname}.${DOMAIN}" >> "$SETUP_LOG"
        
        API_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
             -H "Authorization: Bearer ${CF_API_TOKEN}" \
             -H "Content-Type: application/json" \
             --data "{\"type\":\"CNAME\",\"name\":\"${hostname}\",\"content\":\"${TUNNEL_CNAME}\",\"ttl\":1,\"proxied\":true}")
        
        if echo "$API_RESPONSE" | grep -q '"success":true' || echo "$API_RESPONSE" | grep -q '"code":81053'; then
            echo "  DNS record created or already exists" >> "$SETUP_LOG"
        else
            echo "  Warning: Failed to create DNS record for ${hostname}" >> "$SETUP_LOG"
        fi
    done
    
    echo "DNS setup complete" >> "$SETUP_LOG"
    echo "" >> "$SETUP_LOG"
}

# Create systemd service
create_service() {
    echo "=== Creating Systemd Service ===" >> "$SETUP_LOG"
    
    cat << EOF | sudo tee /etc/systemd/system/cloudflared-gpu.service > /dev/null
[Unit]
Description=Cloudflare Tunnel GPU Worker
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/cloudflared tunnel --config /etc/cloudflared/config.yml run
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable cloudflared-gpu
    
    echo "Systemd service created and enabled" >> "$SETUP_LOG"
    echo "" >> "$SETUP_LOG"
}

# Setup Moshi ASR Server
setup_moshi_server() {
    echo "=== Setting up Moshi ASR Server ===" >> "$SETUP_LOG"
    
    echo "Creating directory" >> "$SETUP_LOG"
    mkdir -p /home/ubuntu/ran_downloadandrundotsh
    
    echo "Changing to home directory" >> "$SETUP_LOG"
    cd /home/ubuntu
    
    echo "Cloning repository" >> "$SETUP_LOG"
    git clone https://github.com/kyutai-labs/delayed-streams-modeling.git
    
    echo "Updating packages" >> "$SETUP_LOG"
    sudo DEBIAN_FRONTEND=noninteractive apt update
    
    echo "Installing CUDA toolkit" >> "$SETUP_LOG"
    sudo DEBIAN_FRONTEND=noninteractive apt install -y nvidia-cuda-toolkit
    
    echo "Downloading moshi-server binary" >> "$SETUP_LOG"
    wget https://github.com/kmrasmussen/delayed-streams-modeling/releases/download/moshi/moshi-server
    
    echo "Making binary executable" >> "$SETUP_LOG"
    chmod +x moshi-server
    
    echo "Moving binary to project directory" >> "$SETUP_LOG"
    mv moshi-server delayed-streams-modeling/
    
    echo "Changing to project directory" >> "$SETUP_LOG"
    cd delayed-streams-modeling
    
    echo "Moshi server setup complete" >> "$SETUP_LOG"
    echo "" >> "$SETUP_LOG"
}

# Create Moshi systemd service
create_moshi_service() {
    echo "=== Creating Moshi Systemd Service ===" >> "$SETUP_LOG"
    
    cat << EOF | sudo tee /etc/systemd/system/moshi-server.service > /dev/null
[Unit]
Description=Moshi ASR Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/delayed-streams-modeling
ExecStart=/home/ubuntu/delayed-streams-modeling/moshi-server worker --config configs/config-stt-en_fr-hf.toml
Restart=on-failure
RestartSec=10s
Environment=HOME=/home/ubuntu
StandardOutput=append:/home/ubuntu/moshilog.txt
StandardError=append:/home/ubuntu/moshilog.txt

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable moshi-server
    
    echo "Moshi systemd service created and enabled" >> "$SETUP_LOG"
    echo "Moshi server logs will be written to /home/ubuntu/moshilog.txt" >> "$SETUP_LOG"
    echo "" >> "$SETUP_LOG"
}

# Main execution
main() {
    echo "$(date): Starting cleanup" >> "$SETUP_LOG"
    cleanup_existing
    
    echo "$(date): Installing dependencies" >> "$SETUP_LOG"
    install_dependencies
    
    echo "$(date): Installing cloudflared" >> "$SETUP_LOG"
    install_cloudflared
    
    echo "$(date): Creating tunnel" >> "$SETUP_LOG"
    create_tunnel
    
    echo "$(date): Setting up credentials" >> "$SETUP_LOG"
    setup_credentials
    
    echo "$(date): Creating config" >> "$SETUP_LOG"
    create_config
    
    echo "$(date): Setting up DNS" >> "$SETUP_LOG"
    setup_dns
    
    echo "$(date): Creating cloudflare service" >> "$SETUP_LOG"
    create_service
    
    echo "$(date): Setting up Moshi server" >> "$SETUP_LOG"
    setup_moshi_server
    
    echo "$(date): Creating Moshi service" >> "$SETUP_LOG"
    create_moshi_service
    
    echo "=== Starting Services ===" >> "$SETUP_LOG"
    echo "$(date): Starting cloudflared service" >> "$SETUP_LOG"
    sudo systemctl start cloudflared-gpu
    
    # Wait and check cloudflared status
    sleep 3
    if sudo systemctl is-active --quiet cloudflared-gpu; then
        echo "$(date): Cloudflared service is running and active" >> "$SETUP_LOG"
    else
        echo "$(date): Cloudflared service may have issues. Check with: sudo systemctl status cloudflared-gpu" >> "$SETUP_LOG"
    fi
    
    echo "$(date): Starting moshi server" >> "$SETUP_LOG"
    sudo systemctl start moshi-server
    
    # Wait and check moshi status
    sleep 5
    if sudo systemctl is-active --quiet moshi-server; then
        echo "$(date): Moshi server is running and active" >> "$SETUP_LOG"
    else
        echo "$(date): Moshi server may have issues. Check with: sudo systemctl status moshi-server" >> "$SETUP_LOG"
    fi
    
    echo "" >> "$SETUP_LOG"
    echo "=== Setup Complete ===" >> "$SETUP_LOG"
    echo "$(date): All setup tasks completed" >> "$SETUP_LOG"
    echo "" >> "$SETUP_LOG"
    echo "Your tunnel hostnames:" >> "$SETUP_LOG"
    echo "  - $TUNNEL_NAME-ssh.$DOMAIN -> SSH (port 22)" >> "$SETUP_LOG"
    echo "  - $TUNNEL_NAME-8000.$DOMAIN -> localhost:8000" >> "$SETUP_LOG"
    echo "  - $TUNNEL_NAME-8050.$DOMAIN -> localhost:8050" >> "$SETUP_LOG"
    echo "  - $TUNNEL_NAME-8051.$DOMAIN -> localhost:8051" >> "$SETUP_LOG"
    echo "  - $TUNNEL_NAME-8052.$DOMAIN -> localhost:8052" >> "$SETUP_LOG"
    echo "  - $TUNNEL_NAME-8080.$DOMAIN -> localhost:8080" >> "$SETUP_LOG"
    echo "  - $TUNNEL_NAME-9050.$DOMAIN -> localhost:9050" >> "$SETUP_LOG"
    echo "  - $TUNNEL_NAME-9051.$DOMAIN -> localhost:9051" >> "$SETUP_LOG"
    echo "  - $TUNNEL_NAME-9052.$DOMAIN -> localhost:9052" >> "$SETUP_LOG"
    echo "" >> "$SETUP_LOG"
    echo "Service management:" >> "$SETUP_LOG"
    echo "  sudo systemctl status cloudflared-gpu" >> "$SETUP_LOG"
    echo "  sudo systemctl status moshi-server" >> "$SETUP_LOG"
    echo "  sudo systemctl restart cloudflared-gpu" >> "$SETUP_LOG"
    echo "  sudo systemctl restart moshi-server" >> "$SETUP_LOG"
    echo "  sudo journalctl -u cloudflared-gpu -f" >> "$SETUP_LOG"
    echo "  sudo journalctl -u moshi-server -f" >> "$SETUP_LOG"
    echo "  tail -f /home/ubuntu/moshilog.txt  # Moshi server logs" >> "$SETUP_LOG"
    echo "$(date): Setup script completed successfully" >> "$SETUP_LOG"
}

# Run main function
main
