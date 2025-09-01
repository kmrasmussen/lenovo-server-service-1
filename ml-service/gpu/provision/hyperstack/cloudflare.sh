#!/bin/bash

# GPU Worker Cloudflare Tunnel Setup Script
# Creates hostname-gpu.intercebd.com tunnel with multiple port mappings

set -e  # Exit on any error

# --- CONFIGURATION ---
CF_API_TOKEN="${CF_API_TOKEN}"
CF_ZONE_ID="${CF_ZONE_ID}"

TUNNEL_NAME="$(hostname)-gpu"
DOMAIN="intercebd.com"

echo "=== GPU Worker Tunnel Setup Script ==="
echo "Tunnel name: $TUNNEL_NAME"
echo "Domain: $DOMAIN"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Cleanup existing setup
cleanup_existing() {
    echo "=== Cleaning up existing setup ==="
    
    # Stop existing services
    sudo systemctl stop cloudflared cloudflared-gpu 2>/dev/null || true
    sudo systemctl disable cloudflared cloudflared-gpu 2>/dev/null || true
    
    # Remove old service files
    sudo rm -f /etc/systemd/system/cloudflared.service
    sudo rm -f /etc/systemd/system/cloudflared-gpu.service
    
    # Clean up old/orphaned credential files
    if [ -d "/etc/cloudflared" ]; then
        echo "Cleaning up old credential files..."
        # Remove any .json files that don't correspond to active tunnels
        find /etc/cloudflared -name "*.json" -type f | while read -r cred_file; do
            tunnel_id=$(basename "$cred_file" .json)
            # Check if this tunnel ID exists in Cloudflare
            if [ ${#tunnel_id} -eq 36 ]; then  # UUID length check
                echo "Checking tunnel credentials: $tunnel_id"
            fi
        done
    fi
    
    sudo systemctl daemon-reload
    echo "Cleanup complete"
    echo ""
}

# Install system dependencies
install_dependencies() {
    echo "=== Installing System Dependencies ==="
    
    export DEBIAN_FRONTEND=noninteractive
    
    # Handle any existing apt locks more aggressively
    echo "Cleaning package manager locks..."
    sudo pkill -f apt-get || true
    sudo pkill -f apt || true
    sudo pkill -f dpkg || true
    sudo rm -f /var/lib/dpkg/lock-frontend || true
    sudo rm -f /var/lib/dpkg/lock || true
    sudo rm -f /var/cache/apt/archives/lock || true
    sudo rm -f /var/lib/apt/lists/lock || true
    sudo dpkg --configure -a || true
    
    # Update package list
    echo "Updating package list..."
    sudo apt update
    
    # Install basic tools
    sudo apt install -y curl jq git htop
    
    # Install Python and pip if not present
    if ! command_exists python3; then
        sudo apt install -y python3 python3-pip
    fi
    
    # Install Docker
    if command_exists docker; then
        echo "Docker is already installed"
        docker --version
    else
        echo "Installing Docker..."
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
        
        echo "Docker installed"
    fi
    
    # Install Docker Compose (standalone)
    if command_exists docker-compose; then
        echo "Docker Compose is already installed"
        docker-compose --version
    else
        echo "Installing Docker Compose..."
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        echo "Docker Compose installed"
    fi
    
    echo "System Dependencies Complete"
    echo ""
}

# Install cloudflared
install_cloudflared() {
    if command_exists cloudflared; then
        echo "cloudflared is already installed"
        return 0
    fi
    
    echo "=== Installing Cloudflared ==="
    
    # Add Cloudflare's GPG key
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    
    # Add the repository
    echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
    
    # Update package list and install
    sudo apt update
    sudo apt install cloudflared -y
    
    echo "cloudflared installed successfully"
    echo ""
}

# Create tunnel via API
create_tunnel() {
    echo "=== Creating Tunnel via API ==="
    
    # Get account ID
    ACCOUNT_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts" -H "Authorization: Bearer ${CF_API_TOKEN}")
    ACCOUNT_ID=$(echo "$ACCOUNT_RESPONSE" | jq -r '.result[0].id // empty')
    
    if [ -z "$ACCOUNT_ID" ]; then
        echo "Failed to get account ID. Check your API token."
        exit 1
    fi
    
    # Check if tunnel already exists and is active
    TUNNELS_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel" -H "Authorization: Bearer ${CF_API_TOKEN}")
    EXISTING_TUNNEL=$(echo "$TUNNELS_RESPONSE" | jq -r ".result[]? | select(.name==\"${TUNNEL_NAME}\" and (.deleted_at == null)) | .id // empty")
    
    if [ ! -z "$EXISTING_TUNNEL" ]; then
        echo "Active tunnel ${TUNNEL_NAME} found with ID: $EXISTING_TUNNEL"
        TUNNEL_ID="$EXISTING_TUNNEL"
        
        # Check if credentials exist for this tunnel
        if [ ! -f "/etc/cloudflared/${TUNNEL_ID}.json" ]; then
            echo "Warning: Tunnel exists but no credentials found. This may cause issues."
            echo "Deleting and recreating tunnel to ensure proper credentials..."
            
            # Delete the problematic tunnel
            curl -s -X DELETE "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}" \
                -H "Authorization: Bearer ${CF_API_TOKEN}" > /dev/null
            
            # Create new tunnel
            echo "Creating fresh tunnel: ${TUNNEL_NAME}"
            TUNNEL_SECRET=$(openssl rand -base64 32)
            
            TUNNEL_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel" \
                -H "Authorization: Bearer ${CF_API_TOKEN}" \
                -H "Content-Type: application/json" \
                --data "{\"name\":\"${TUNNEL_NAME}\",\"tunnel_secret\":\"${TUNNEL_SECRET}\"}")
            
            TUNNEL_ID=$(echo "$TUNNEL_RESPONSE" | jq -r '.result.id // empty')
            
            if [ -z "$TUNNEL_ID" ]; then
                echo "Failed to create fresh tunnel:"
                echo "$TUNNEL_RESPONSE"
                exit 1
            fi
            
            echo "Created fresh tunnel with ID: $TUNNEL_ID"
        fi
    else
        echo "Creating new tunnel: ${TUNNEL_NAME}"
        TUNNEL_SECRET=$(openssl rand -base64 32)
        
        TUNNEL_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/cfd_tunnel" \
            -H "Authorization: Bearer ${CF_API_TOKEN}" \
            -H "Content-Type: application/json" \
            --data "{\"name\":\"${TUNNEL_NAME}\",\"tunnel_secret\":\"${TUNNEL_SECRET}\"}")
        
        TUNNEL_ID=$(echo "$TUNNEL_RESPONSE" | jq -r '.result.id // empty')
        
        if [ -z "$TUNNEL_ID" ]; then
            echo "Failed to create tunnel:"
            echo "$TUNNEL_RESPONSE"
            exit 1
        fi
        
        echo "Created tunnel with ID: $TUNNEL_ID"
    fi
    
    export TUNNEL_ID ACCOUNT_ID TUNNEL_SECRET
    echo ""
}

# Setup credentials
setup_credentials() {
    echo "=== Setting up Credentials ==="
    
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
            echo "Created new credentials file"
        else
            echo "Error: No tunnel secret available and no existing credentials found"
            exit 1
        fi
    else
        echo "Using existing credentials file"
    fi
    echo ""
}

# Create config file
create_config() {
    echo "=== Creating Configuration ==="
    
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
    
    echo "Configuration file created"
    echo ""
}

# Setup DNS records via API
setup_dns() {
    echo "=== Setting up DNS Records via API ==="
    
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
        echo "Creating DNS record for: ${hostname}.${DOMAIN}"
        
        API_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
             -H "Authorization: Bearer ${CF_API_TOKEN}" \
             -H "Content-Type: application/json" \
             --data "{\"type\":\"CNAME\",\"name\":\"${hostname}\",\"content\":\"${TUNNEL_CNAME}\",\"ttl\":1,\"proxied\":true}")
        
        if echo "$API_RESPONSE" | grep -q '"success":true' || echo "$API_RESPONSE" | grep -q '"code":81053'; then
            echo "  DNS record created or already exists"
        else
            echo "  Warning: Failed to create DNS record for ${hostname}"
        fi
    done
    
    echo "DNS setup complete"
    echo ""
}

# Create systemd service
create_service() {
    echo "=== Creating Systemd Service ==="
    
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
    
    echo "Systemd service created and enabled"
    echo ""
}

# Main execution
main() {
    cleanup_existing
    install_dependencies
    install_cloudflared
    create_tunnel
    setup_credentials
    create_config
    setup_dns
    create_service
    
    echo "=== Starting Service ==="
    sudo systemctl start cloudflared-gpu
    
    # Wait and check status
    sleep 3
    if sudo systemctl is-active --quiet cloudflared-gpu; then
        echo "Cloudflared service is running and active"
    else
        echo "Service may have issues. Check with: sudo systemctl status cloudflared-gpu"
    fi
    
    echo ""
    echo "=== Setup Complete ==="
    echo ""
    echo "Your tunnel hostnames:"
    echo "  - $TUNNEL_NAME-ssh.$DOMAIN -> SSH (port 22)"
    echo "  - $TUNNEL_NAME-8000.$DOMAIN -> localhost:8000"
    echo "  - $TUNNEL_NAME-8050.$DOMAIN -> localhost:8050"
    echo "  - $TUNNEL_NAME-8051.$DOMAIN -> localhost:8051"
    echo "  - $TUNNEL_NAME-8052.$DOMAIN -> localhost:8052"
    echo "  - $TUNNEL_NAME-8080.$DOMAIN -> localhost:8080"
    echo "  - $TUNNEL_NAME-9050.$DOMAIN -> localhost:9050"
    echo "  - $TUNNEL_NAME-9051.$DOMAIN -> localhost:9051" 
    echo "  - $TUNNEL_NAME-9052.$DOMAIN -> localhost:9052"
    echo ""
    echo "Service management:"
    echo "  sudo systemctl status cloudflared-gpu"
    echo "  sudo systemctl restart cloudflared-gpu"
    echo "  sudo journalctl -u cloudflared-gpu -f"
}

# Run main function
main
