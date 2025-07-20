#!/bin/bash
# Matchering Web App - Easy Deploy Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🎵 Matchering Web Application Docker Deployment${NC}"
echo "================================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not available. Please install Docker Compose.${NC}"
    exit 1
fi

# Initialize submodules if they don't exist
if [ ! -f "matchering-fork/setup.py" ] || [ ! -f "python-audio-separator/pyproject.toml" ]; then
    echo -e "${YELLOW}🔧 Initializing git submodules...${NC}"
    git submodule update --init --recursive
fi

# Create docker volumes directory
mkdir -p docker-volumes/{presets,outputs}

# Function to check GPU availability
check_gpu() {
    if command -v nvidia-smi &> /dev/null; then
        if nvidia-smi &> /dev/null; then
            return 0
        fi
    fi
    return 1
}

# Ask user about GPU usage
echo
echo -e "${YELLOW}GPU Detection:${NC}"
if check_gpu; then
    echo -e "${GREEN}✅ NVIDIA GPU detected${NC}"
    echo
    echo "Choose deployment mode:"
    echo "1) CPU-only (works everywhere)"
    echo "2) GPU-enabled (faster stem separation)"
    echo
    read -p "Enter choice (1-2) [1]: " gpu_choice
    gpu_choice=${gpu_choice:-1}
else
    echo -e "${YELLOW}⚠️  No NVIDIA GPU detected or nvidia-smi not available${NC}"
    echo -e "${BLUE}ℹ️  Using CPU-only mode${NC}"
    gpu_choice=1
fi

# Ask about port
echo
read -p "Port to run on [8000]: " port
port=${port:-8000}

# Create or modify docker-compose override
cat > docker-compose.override.yml << EOF
services:
  matchering-webapp:
    ports:
      - "${port}:8000"
EOF

if [ "$gpu_choice" = "2" ]; then
    cat >> docker-compose.override.yml << EOF
  matchering-webapp-gpu:
    ports:
      - "${port}:8000"
EOF
fi

echo
echo -e "${BLUE}🚀 Starting Matchering Web Application...${NC}"

if [ "$gpu_choice" = "2" ]; then
    echo -e "${GREEN}Using GPU-enabled mode${NC}"
    if command -v docker-compose &> /dev/null; then
        docker-compose --profile gpu up --build -d matchering-webapp-gpu
    else
        docker compose --profile gpu up --build -d matchering-webapp-gpu
    fi
else
    echo -e "${GREEN}Using CPU-only mode${NC}"
    if command -v docker-compose &> /dev/null; then
        docker-compose up --build -d matchering-webapp
    else
        docker compose up --build -d matchering-webapp
    fi
fi

echo
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo
echo -e "${BLUE}📍 Application URL:${NC} http://localhost:${port}"
echo -e "${BLUE}📁 Persistent data:${NC} ./docker-volumes/"
echo
echo -e "${YELLOW}Useful commands:${NC}"
echo "  View logs:    docker-compose logs -f"
echo "  Stop app:     docker-compose down"
echo "  Restart:      docker-compose restart"
echo "  Update:       docker-compose pull && docker-compose up -d"
echo
echo -e "${GREEN}🎵 Happy mastering!${NC}"