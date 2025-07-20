# Docker Deployment Guide

This guide explains how to deploy the Matchering Web Application using Docker for easy installation and distribution.

## 🚀 Quick Start (Total Beginners)

**Just want to get it running? Here's the minimal steps:**

1. **Install Docker Desktop** from https://www.docker.com/products/docker-desktop
2. **Download this project** (the folder with all the files)
3. **Open terminal/command prompt** in the project folder
4. **Run:** `./deploy.sh` (Mac/Linux) or `deploy.sh` (Windows)
5. **Visit:** http://localhost:8000

That's it! If something breaks, see the troubleshooting section below.

## How to Docker (For Non-IT Folks)

Docker is like a "shipping container" for software. It packages everything the app needs to run into one container that works the same way on any computer.

### What is Docker?
- **Think of it like:** A complete, portable computer program that includes everything it needs
- **Why use it:** No need to install Python, libraries, or worry about "it works on my machine" problems
- **Result:** One command gets everything running

### Installing Docker

#### On Windows:
1. Download Docker Desktop from: https://www.docker.com/products/docker-desktop
2. Run the installer (requires restart)
3. Start Docker Desktop from your applications

#### On Mac:
1. Download Docker Desktop from: https://www.docker.com/products/docker-desktop  
2. Drag to Applications folder
3. Launch Docker Desktop

#### On Linux (Ubuntu/Debian):
```bash
# Copy and paste this into terminal:
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Log out and back in
```

### How to Know Docker is Working
Open a terminal/command prompt and type:
```bash
docker --version
```
You should see something like: `Docker version 20.10.21`

## Prerequisites

- Docker (20.10+)
- Docker Compose (1.29+)
- For GPU support: NVIDIA Docker runtime

## Quick Start

### 1. CPU-Only Deployment

```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd matchering_webapp

# Initialize submodules
git submodule update --init --recursive

# Build and run
docker-compose up --build
```

The application will be available at `http://localhost:8000`

### 2. GPU-Enabled Deployment (for stem separation)

```bash
# Enable GPU profile
docker-compose --profile gpu up --build matchering-webapp-gpu
```

## Running Multiple Instances (For Beta Testing)

If you want to run several instances for different users/testers, here's how:

### Method 1: Different Ports (Simplest)

```bash
# Instance 1 (default)
./deploy.sh
# Choose port 8000

# Instance 2 
./deploy.sh  
# Choose port 8001

# Instance 3
./deploy.sh
# Choose port 8002
```

Then your users access:
- User 1: `http://yourserver.com:8000`
- User 2: `http://yourserver.com:8001` 
- User 3: `http://yourserver.com:8002`

### Method 2: Subdomains (More Professional)

1. **Run instances on different ports** (as above)

2. **Set up nginx or similar** to route subdomains:
   ```nginx
   # Example nginx config
   server {
       listen 80;
       server_name user1.yourproject.com;
       location / {
           proxy_pass http://localhost:8000;
       }
   }
   
   server {
       listen 80; 
       server_name user2.yourproject.com;
       location / {
           proxy_pass http://localhost:8001;
       }
   }
   ```

3. **Point DNS subdomains** to your server

Result: Clean URLs like `user1.yourproject.com`, `user2.yourproject.com`

### Managing Multiple Instances

```bash
# See all running containers
docker ps

# Stop specific instance
docker-compose -f docker-compose.yml down

# View logs for troubleshooting
docker-compose logs -f

# Restart all instances
docker restart $(docker ps -q)
```

## Configuration Options

### Port Configuration

To run on a different port, modify `docker-compose.yml`:

```yaml
ports:
  - "8080:8000"  # Run on port 8080 instead
```

### Persistent Storage

The setup automatically creates persistent volumes for:
- `./docker-volumes/presets/` - User-created presets
- `./docker-volumes/outputs/` - Processed audio files

### Audio Files

Mount your audio files directory:

```yaml
volumes:
  - /path/to/your/audio:/app/audio:ro
```

## Production Deployment

### 1. Build Production Image

```bash
# Build optimized image
docker build -t matchering-webapp:latest .
```

### 2. Environment Variables

Create a `.env` file:

```env
# App configuration
PYTHONUNBUFFERED=1
HOST=0.0.0.0
PORT=8000

# Optional: Logging level
LOG_LEVEL=INFO
```

### 3. Production Docker Compose

```yaml
version: '3.8'
services:
  matchering:
    image: matchering-webapp:latest
    ports:
      - "80:8000"
    volumes:
      - /data/presets:/app/presets
      - /data/outputs:/app/outputs
    environment:
      - PYTHONUNBUFFERED=1
    restart: always
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G
```

## GPU Setup (NVIDIA)

### Install NVIDIA Docker Runtime

```bash
# Ubuntu/Debian
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### Verify GPU Access

```bash
docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi
```

## Troubleshooting

### "Help! Something's Not Working" Guide

#### 🚨 Nothing happens when I run `./deploy.sh`
**Check:**
```bash
# Is Docker running?
docker --version
# Should show version, not "command not found"
```
**Fix:** Start Docker Desktop application

#### 🚨 "Port already in use" error
**Meaning:** Something else is using that port
**Fix:** 
```bash
# Try a different port
./deploy.sh
# When asked, enter 8001 instead of 8000
```

#### 🚨 Website shows "Can't connect" or "This site can't be reached"
**Check:**
```bash
# Is the container running?
docker ps
# Should show a running container with port 8000->8000
```
**Fix:**
```bash
# Restart everything
docker-compose down
./deploy.sh
```

#### 🚨 App is super slow or crashes
**Likely cause:** Not enough memory/CPU
**Check system resources:**
- Close other heavy applications
- Try CPU-only mode instead of GPU mode

#### 🚨 "Can't upload files" or upload fails
**Check:** File size - large files (>100MB) may timeout
**Try:** Smaller audio files first

### Common Issues

1. **Port already in use**
   ```bash
   # Check what's using port 8000
   sudo lsof -i :8000
   # Change port in docker-compose.yml
   ```

2. **Permission issues with volumes**
   ```bash
   # Fix permissions
   sudo chown -R 1000:1000 docker-volumes/
   ```

3. **GPU not detected**
   ```bash
   # Verify NVIDIA runtime
   docker info | grep nvidia
   ```

4. **Build failures**
   ```bash
   # Clean build
   docker-compose down
   docker system prune -f
   docker-compose up --build --force-recreate
   ```

### Logs

```bash
# View application logs
docker-compose logs -f matchering-webapp

# View specific service logs
docker-compose logs -f matchering-webapp-gpu
```

## Development

### Development with Docker

```bash
# Mount source code for live editing
docker-compose -f docker-compose.dev.yml up
```

Create `docker-compose.dev.yml`:

```yaml
version: '3.8'
services:
  matchering-dev:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - .:/app
      - /app/venv  # Exclude venv
    environment:
      - PYTHONUNBUFFERED=1
      - RELOAD=true
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Security Considerations

For production deployments:

1. **Use reverse proxy** (nginx, traefik)
2. **Enable HTTPS** with SSL certificates
3. **Limit file upload sizes**
4. **Configure firewall rules**
5. **Regular security updates**

## Resource Requirements

### Minimum Requirements
- CPU: 2 cores
- RAM: 4GB
- Storage: 10GB

### Recommended for Production
- CPU: 4+ cores
- RAM: 8GB+
- Storage: 50GB+ SSD
- GPU: NVIDIA with 4GB+ VRAM (for stem separation)

## Backup

```bash
# Backup persistent data
tar -czf matchering-backup-$(date +%Y%m%d).tar.gz docker-volumes/

# Restore
tar -xzf matchering-backup-YYYYMMDD.tar.gz
```