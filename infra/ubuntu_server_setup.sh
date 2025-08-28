#!/bin/bash

# Cloudflare Tunnel Setup Script
# Usage: ./setup-cloudflare-tunnel.sh <tunnel-name>

set -e  # Exit on any error

# Check if tunnel name is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <tunnel-name>"
    echo "Example: $0 dell"
    exit 1
fi

TUNNEL_NAME="$1"
DOMAIN="intercebd.com"

echo "=== Cloudflare Tunnel Setup Script ==="
echo "Tunnel name: $TUNNEL_NAME"
echo "Domain: $DOMAIN"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Install system dependencies
install_dependencies() {
    echo "=== Installing System Dependencies ==="
    
    # Update package list
    echo "Updating package list..."
    sudo apt update
    
    # Install nvim
    if command_exists nvim; then
        echo "✓ nvim is already installed"
    else
        echo "Installing nvim..."
        sudo apt install neovim -y
        echo "✓ nvim installed"
    fi
    
    # Install Docker
    if command_exists docker; then
        echo "✓ Docker is already installed"
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
        
        echo "✓ Docker installed"
        echo "⚠️  You'll need to log out and back in for Docker group membership to take effect"
    fi
    
    # Install Docker Compose (standalone)
    if command_exists docker-compose; then
        echo "✓ Docker Compose is already installed"
        docker-compose --version
    else
        echo "Installing Docker Compose..."
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        echo "✓ Docker Compose installed"
    fi
    
    echo "=== System Dependencies Complete ==="
    echo ""
}

# Function to check if cloudflared is installed
check_cloudflared() {
    if command_exists cloudflared; then
        echo "✓ cloudflared is already installed"
        cloudflared --version
        return 0
    else
        return 1
    fi
}

# Install cloudflared if not present
install_cloudflared() {
    echo "=== Installing Cloudflared ==="
    
    # Add Cloudflare's GPG key
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    
    # Add the repository
    echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
    
    # Update package list and install
    sudo apt update
    sudo apt install cloudflared -y
    
    echo "✓ cloudflared installed successfully"
    echo ""
}

# Check authentication
check_auth() {
    if cloudflared tunnel list &> /dev/null; then
        echo "✓ Already authenticated with Cloudflare"
        return 0
    else
        return 1
    fi
}

# Authenticate with Cloudflare
authenticate() {
    echo ""
    echo "🔐 Authentication required!"
    echo "Please complete the login process in your browser..."
    echo "Press Enter after you've completed the login in your browser"
    
    cloudflared tunnel login
    
    # Wait for user confirmation
    read -p "Press Enter once you've completed the browser login..."
    
    # Verify authentication worked
    if cloudflared tunnel list &> /dev/null; then
        echo "✓ Authentication successful"
    else
        echo "❌ Authentication failed. Please try again."
        exit 1
    fi
}

# Create tunnel
create_tunnel() {
    echo ""
    echo "Creating tunnel: $TUNNEL_NAME"
    
    # Check if tunnel already exists
    if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
        echo "⚠️  Tunnel '$TUNNEL_NAME' already exists"
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    else
        cloudflared tunnel create "$TUNNEL_NAME"
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
        echo "✓ Tunnel created with ID: $TUNNEL_ID"
    fi
}

# Create config file
create_config() {
    echo ""
    echo "Creating configuration file..."
    
    sudo mkdir -p /etc/cloudflared
    
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
  - hostname: $TUNNEL_NAME-9050.$DOMAIN
    service: http://localhost:9050
  - hostname: $TUNNEL_NAME-9051.$DOMAIN
    service: http://localhost:9051
  - hostname: $TUNNEL_NAME-9052.$DOMAIN
    service: http://localhost:9052
  - service: http_status:404
EOF
    
    echo "✓ Configuration file created at /etc/cloudflared/config.yml"
    
    # Update the global TUNNEL_ID variable for later use
    export TUNNEL_ID
}

# Copy credentials
copy_credentials() {
    echo ""
    echo "Copying credentials file..."
    
    # First check if the exact file exists
    if [ -f "$HOME/.cloudflared/$TUNNEL_ID.json" ]; then
        sudo cp "$HOME/.cloudflared/$TUNNEL_ID.json" /etc/cloudflared/
        echo "✓ Credentials file copied"
        return 0
    fi
    
    # If not, look for any .json files in the cloudflared directory
    echo "Looking for credentials files..."
    CRED_FILES=$(find "$HOME/.cloudflared/" -name "*.json" 2>/dev/null)
    
    if [ -z "$CRED_FILES" ]; then
        echo "No credentials files found. Recreating tunnel..."
        # Delete and recreate the tunnel
        cloudflared tunnel delete "$TUNNEL_NAME" 2>/dev/null || true
        cloudflared tunnel create "$TUNNEL_NAME"
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
        echo "✓ New tunnel created with ID: $TUNNEL_ID"
        
        # Now copy the new credentials
        if [ -f "$HOME/.cloudflared/$TUNNEL_ID.json" ]; then
            sudo cp "$HOME/.cloudflared/$TUNNEL_ID.json" /etc/cloudflared/
            echo "✓ New credentials file copied"
        else
            echo "❌ Still can't find credentials file. Please run 'cloudflared tunnel login' manually"
            exit 1
        fi
    else
        # Use the first .json file found
        CRED_FILE=$(echo "$CRED_FILES" | head -n1)
        echo "Found credentials file: $CRED_FILE"
        sudo cp "$CRED_FILE" "/etc/cloudflared/$TUNNEL_ID.json"
        echo "✓ Credentials file copied"
    fi
}

# Setup DNS records
setup_dns() {
    echo ""
    echo "Setting up DNS records..."
    
    hostnames=(
        "$TUNNEL_NAME-ssh.$DOMAIN"
        "$TUNNEL_NAME-8000.$DOMAIN"
        "$TUNNEL_NAME-8050.$DOMAIN" 
        "$TUNNEL_NAME-8051.$DOMAIN"
        "$TUNNEL_NAME-8052.$DOMAIN"
        "$TUNNEL_NAME-9050.$DOMAIN"
        "$TUNNEL_NAME-9051.$DOMAIN"
        "$TUNNEL_NAME-9052.$DOMAIN"
    )
    
    for hostname in "${hostnames[@]}"; do
        echo "Setting up DNS for: $hostname"
        cloudflared tunnel route dns "$TUNNEL_NAME" "$hostname"
    done
    
    echo "✓ DNS records configured"
}

# Create systemd service
create_service() {
    echo ""
    echo "Creating systemd service..."
    
    cat << EOF | sudo tee /etc/systemd/system/cloudflared.service > /dev/null
[Unit]
Description=cloudflared
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
    sudo systemctl enable cloudflared
    
    echo "✓ Systemd service created and enabled"
}

# Main execution
main() {
    # Install system dependencies first
    install_dependencies
    
    # Check/install cloudflared
    if ! check_cloudflared; then
        install_cloudflared
    fi
    
    # Check/perform authentication
    if ! check_auth; then
        authenticate
    fi
    
    # Create tunnel and get ID
    create_tunnel
    
    # Create config file
    create_config
    
    # Copy credentials
    copy_credentials
    
    # Setup DNS
    setup_dns
    
    # Create systemd service
    create_service
    
    echo ""
    echo "🎉 Setup complete!"
    echo ""
    echo "Your tunnel hostnames:"
    echo "  - $TUNNEL_NAME-ssh.$DOMAIN -> SSH (port 22)"
    echo "  - $TUNNEL_NAME-8000.$DOMAIN -> localhost:8000"
    echo "  - $TUNNEL_NAME-8050.$DOMAIN -> localhost:8050"
    echo "  - $TUNNEL_NAME-8051.$DOMAIN -> localhost:8051"
    echo "  - $TUNNEL_NAME-8052.$DOMAIN -> localhost:8052"
    echo "  - $TUNNEL_NAME-9050.$DOMAIN -> localhost:9050"
    echo "  - $TUNNEL_NAME-9051.$DOMAIN -> localhost:9051" 
    echo "  - $TUNNEL_NAME-9052.$DOMAIN -> localhost:9052"
    echo ""
    echo "SSH access example:"
    echo "  ssh delluser@$TUNNEL_NAME-ssh.$DOMAIN"
    echo ""
    echo "📝 Add this to your local ~/.ssh/config for easy access:"
    echo ""
    echo "Host $TUNNEL_NAME-server"
    echo "    HostName $TUNNEL_NAME-ssh.$DOMAIN"
    echo "    User delluser"
    echo "    ProxyCommand cloudflared access ssh --hostname $TUNNEL_NAME-ssh.$DOMAIN"
    echo ""
    echo "Then connect with: ssh $TUNNEL_NAME-server"
    echo ""
    echo "Starting cloudflared service..."
    sudo systemctl start cloudflared
    
    # Wait a moment and check status
    sleep 2
    if sudo systemctl is-active --quiet cloudflared; then
        echo "✓ Cloudflared service is running and active"
        echo "✓ Service will automatically start on boot"
    else
        echo "⚠️  Service may have issues starting. Check status with:"
        echo "  sudo systemctl status cloudflared"
    fi
    
    echo ""
    echo "Service management commands:"
    echo "  sudo systemctl status cloudflared   # Check status"
    echo "  sudo systemctl stop cloudflared     # Stop service"
    echo "  sudo systemctl restart cloudflared  # Restart service"
    echo "  sudo journalctl -u cloudflared -f   # View live logs"
    echo ""
    echo "To test manually (stop service first):"
    echo "  cloudflared tunnel run $TUNNEL_NAME"
}

# Run main function
main
