# AI Photo Restoration Service

A semi-automated photo restoration service that processes Facebook photo restoration requests using AI while maintaining complete human oversight. The system runs entirely on local infrastructure with optional cloud AI services for complex restorations.

## 🏗️ Architecture

- **Local-first**: Optimized for Mac M2 with PyTorch MPS/MLX acceleration
- **Human-in-the-loop**: Mandatory review dashboard for all restorations
- **Foolproof traceability**: SHA-256 + perceptual hashing with EXIF embedding
- **Production security**: WebAuthn, encryption at rest, supply chain hardening
- **Legal compliance**: C2PA provenance, WACZ archives, audit trails

## 🚀 Quick Start

### Prerequisites

- Node.js 18.18.0+
- Docker Desktop
- MongoDB 7.0+
- Redis 7.2+

### Installation

1. **Clone and install dependencies**:

   ```bash
   git clone <repository-url>
   cd ai-photo-restoration
   npm install
   ```

2. **Set up environment**:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start infrastructure**:

   ```bash
   docker compose up -d
   ```

4. **Run the application**:
   ```bash
   npm run dev
   ```

## 📊 Services

- **Application**: `http://localhost:4000`
- **MongoDB**: `localhost:27017`
- **Redis**: `localhost:6379`
- **Prometheus**: `http://localhost:9090`
- **Grafana**: `http://localhost:3001`

## 🔧 Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm test` - Run tests (when implemented)

### Database

The system uses MongoDB with Client-Side Field Level Encryption (CSFLE) for sensitive data protection. Generate a master key:

```bash
openssl rand -base64 96
```

Set the key in your `.env` file as `MONGO_LOCAL_MASTER_KEY_BASE64`.

## 🛡️ Security Features

- **WebAuthn passkey authentication**
- **AES-256-GCM encryption at rest**
- **Tamper-evident audit logs**
- **Content safety screening**
- **Supply chain security (Cosign/Trivy)**

## 📋 Implementation Status

This project follows a comprehensive spec-driven development approach:

- ✅ **Foundation**: TypeScript, Docker, MongoDB, Redis, monitoring
- ✅ **Data Models**: Request tracking, audit logs, consent management
- 🚧 **API Layer**: Express server with security middleware
- 🚧 **AI Processing**: Local and cloud restoration pipelines
- 🚧 **Review Dashboard**: Human oversight interface
- 🚧 **Safety Systems**: Validation and proof capture

See [tasks.md](.kiro/specs/ai-photo-restoration/tasks.md) for detailed implementation plan.

## 📖 Documentation

- [Requirements](.kiro/specs/ai-photo-restoration/requirements.md)
- [Design](.kiro/specs/ai-photo-restoration/design.md)
- [Implementation Tasks](.kiro/specs/ai-photo-restoration/tasks.md)

## 🤝 Contributing

1. Create a feature branch from `main`
2. Make your changes following the existing patterns
3. Run linting and formatting: `npm run lint:fix && npm run format:write`
4. Create a pull request with detailed description

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## ⚠️ Compliance Note

This system respects Facebook's current API limitations (Groups API deprecated as of 2024). All Facebook interactions require manual operator confirmation to comply with platform terms of service.
