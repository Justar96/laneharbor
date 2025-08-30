# LaneHarbor

app distribution platform with real-time updates and gRPC microservices architecture.

## Architecture

LaneHarbor is built as a microservices architecture with three main services:

```
┌─────────────┐    HTTP/WS     ┌─────────────┐    gRPC      ┌─────────────┐
│   Frontend  │ ◄────────────► │   Backend   │ ◄──────────► │   Storage   │
│   (Remix)   │                │ (Node.js)   │              │ (Node.js)   │
└─────────────┘                └─────────────┘              └─────────────┘
                                       │                              │
                                       │                              │
                                ┌─────────────┐              ┌─────────────┐
                                │  WebSocket  │              │     S3/     │
                                │   Service   │              │   MinIO     │
                                └─────────────┘              └─────────────┘
```

### Services

- **Frontend** (Port 3000): Remix-based web interface with real-time progress tracking
- **Backend** (Port 8787): REST API server with WebSocket support for live updates  
- **Storage** (Port 50051): gRPC microservice handling file operations with AWS S3/MinIO
- **MinIO** (Ports 9000/9001): S3-compatible storage for local development

## Quick Start

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Docker & Docker Compose](https://docker.com/)
- [Git](https://git-scm.com/)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/laneharbor.git
   cd laneharbor
   ```

2. **Run the setup script**

   **Linux/macOS:**
   ```bash
   chmod +x scripts/dev-setup.sh
   ./scripts/dev-setup.sh
   ```

   **Windows (PowerShell):**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   .\scripts\dev-setup.ps1
   ```

3. **Access the services**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8787
   - MinIO Console: http://localhost:9001 (minioadmin/minioadmin)

## Features

- 🚀 **Real-time Progress**: WebSocket-based live download progress
- 🔗 **gRPC Communication**: High-performance service-to-service communication
- 📦 **File Management**: Upload, download, and manage app releases
- 🌐 **Modern Web UI**: Responsive Remix-based frontend
- 🔄 **Hot Reload**: Full development experience with live reloading
- 🐳 **Containerized**: Docker support for easy deployment
- ☁️ **S3 Compatible**: Works with AWS S3, MinIO, or any S3-compatible storage

## API Endpoints

### Backend REST API (Port 8787)

- `GET /healthz` - Health check
- `GET /v1/apps` - List all applications
- `GET /v1/apps/:app/releases` - Get app releases
- `GET /v1/apps/:app/releases/latest` - Get latest release
- `GET /v1/apps/:app/releases/:version/download` - Download release
- `WS /ws` - WebSocket for real-time updates

### Storage gRPC API (Port 50051)

- `Upload(stream)` - Upload files with progress
- `Download(request)` - Download files with progress
- `GetMetadata(request)` - Get file metadata
- `ListFiles(request)` - List stored files
- `SubscribeToProgress(request)` - Stream progress updates

## Development Commands

```bash
# View logs
docker-compose logs -f [service]

# Restart a service
docker-compose restart [service]

# Stop all services
docker-compose down

# Shell access to service
docker-compose exec [service] sh

# Rebuild and start
docker-compose up --build
```

## Manual Development Setup

If you prefer to run services individually:

1. **Install dependencies**
   ```bash
   # Backend
   cd packages/backend && npm install && cd ../..
   
   # Frontend
   cd packages/frontend && npm install && cd ../..
   
   # Storage
   cd packages/storage && npm install && cd ../..
   ```

2. **Start MinIO (for storage service)**
   ```bash
   docker run -d -p 9000:9000 -p 9001:9001 \
     --name minio \
     -e "MINIO_ROOT_USER=minioadmin" \
     -e "MINIO_ROOT_PASSWORD=minioadmin" \
     minio/minio server /data --console-address ":9001"
   ```

3. **Start services**
   ```bash
   # Terminal 1 - Storage
   cd packages/storage && npm run dev
   
   # Terminal 2 - Backend  
   cd packages/backend && npm run dev
   
   # Terminal 3 - Frontend
   cd packages/frontend && npm run dev
   ```

## License

MIT License - see [LICENSE](LICENSE) file for details.
