# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LaneHarbor is a modern app distribution platform built with a microservices architecture using Node.js, featuring:
- **Frontend**: Remix-based web UI (port 3000)
- **Backend**: REST API with WebSocket support using Hono framework (port 8787)
- **Storage**: gRPC microservice for file operations with Google Cloud Storage (port 50051)

## Essential Commands

### Development
```bash
# Install all dependencies (uses npm workspaces)
npm install

# Run all services in development mode
npm run dev

# Run individual services
npm --workspace @laneharbor/backend run dev
npm --workspace @laneharbor/frontend run dev
npm --workspace @laneharbor/storage run dev

# Type checking (run before committing)
npm run typecheck

# Build all services
npm run build

# Clean workspace (preserves .env files)
npm run clean
```

### Docker Development
```bash
# Start all services with Docker Compose
docker-compose up

# Rebuild and start
docker-compose up --build

# View logs
docker-compose logs -f [service]

# Access service shell
docker-compose exec [service] sh
```

## Architecture & Key Patterns

### Service Communication
- **Frontend → Backend**: HTTP/WebSocket via Hono framework
- **Backend → Storage**: gRPC using proto files in `packages/backend/proto/` and `packages/storage/proto/`
- **Storage → GCS**: Google Cloud Storage client for file operations

### Code Organization
```
packages/
├── backend/          # REST API & WebSocket server
│   ├── src/
│   │   ├── clients/  # gRPC client for storage service
│   │   ├── routes.ts # API route definitions
│   │   ├── websocket.ts # WebSocket service
│   │   └── index.ts  # Main server entry
│   └── proto/        # gRPC protocol definitions
├── frontend/         # Remix application
│   └── app/
│       ├── components/ui/ # Reusable UI components
│       └── routes/   # Remix routes
└── storage/          # gRPC storage microservice
    ├── src/
    │   ├── providers/ # Storage implementations (GCS)
    │   └── services/  # gRPC service implementations
    └── proto/         # Storage service protobuf definitions
```

### Key Technologies
- **Backend**: Hono (web framework), @grpc/grpc-js, ws (WebSocket), Node.js HTTP server
- **Frontend**: Remix, React 18, Tailwind CSS, Framer Motion, Radix UI
- **Storage**: gRPC, Google Cloud Storage, protobufjs
- **Shared**: TypeScript, ESM modules, npm workspaces

### Environment Variables
Services use different environment variables based on deployment:
- **Local Development**: Uses docker-compose.yml configuration
- **Production (Railway)**: Detects Railway environment and adapts endpoints automatically
- Storage service requires Google Cloud credentials (see packages/storage/.env.example)

### Important Implementation Details

1. **Module System**: All packages use ESM (`"type": "module"`) - use `.js` extensions in imports even for TypeScript files
2. **TypeScript Config**: Shared base config in `tsconfig.base.json`, each package extends it
3. **Node.js Version**: Requires Node.js 20+ (specified in all package.json files)
4. **WebSocket**: Backend implements real-time progress tracking for file operations
5. **gRPC Streaming**: Storage service supports streaming for large file uploads/downloads
6. **Railway Deployment**: Code includes Railway-specific adaptations for proxy headers and service discovery
7. **Health Checks**: Each service has health endpoints (`/health` for HTTP services, port 8080 for storage)

### Testing Approach
Check individual package.json files for test scripts. Currently, the project focuses on TypeScript type checking (`npm run typecheck`) for validation.

### Common Development Tasks

When modifying gRPC services:
1. Update `.proto` files in the respective service's proto directory
2. Regenerate TypeScript definitions if using protobufjs-cli
3. Update both client and server implementations

When adding new API endpoints:
1. Add route in `packages/backend/src/routes.ts`
2. Implement handler following existing patterns
3. Update StorageClient if storage interaction needed

When modifying frontend:
1. Follow Remix conventions for routes and loaders
2. Use existing UI components from `app/components/ui/`
3. Maintain TypeScript types for all props

### Google Cloud Storage Setup

For storage service to work, you need GCS credentials:

**Local Development**:
- Set `GOOGLE_APPLICATION_CREDENTIALS` to path of service account JSON file
- Or set `GCS_SERVICE_ACCOUNT_KEY` to the JSON content as a string

**Railway Deployment**:
- Set `GOOGLE_CLOUD_PROJECT_ID` to your GCP project ID
- Set `GCS_SERVICE_ACCOUNT_KEY_BASE64` to base64-encoded service account JSON
- Set `GCS_BUCKET_NAME` to your bucket name (defaults to "laneharbor")

To encode service account key for Railway:
```bash
cat path/to/service-account-key.json | base64 -w 0
```

### Railway-Specific Configuration

Each service has a `railway.json` file with deployment settings:
- Backend expects storage service at `laneharbor-storage.railway.internal:50051`
- Frontend expects backend at configured `LH_BACKEND_URL`
- Storage service uses `PORT` for health checks, `STORAGE_GRPC_PORT` for gRPC

### TypeScript Types Playbook

You are writing TypeScript for a real project. Prefer **type-level utilities** over ad-hoc manual typings. Follow these rules and patterns exactly, and show concise examples with `// ->` comments when helpful.

**Base model for examples**

```ts
type User = { id: number; name: string; age?: number };
```

#### 1) Optionality / requiredness / immutability

* Make all props optional: `Partial<T>`
* Make all props required: `Required<T>`
* Make all props readonly: `Readonly<T>`

```ts
type PartialUser  = Partial<User>;   // -> { id?: number; name?: string; age?: number }
type RequiredUser = Required<User>;  // -> { id: number; name: string; age: number }
type FrozenUser   = Readonly<User>;  // -> { readonly id: number; readonly name: string; readonly age?: number }
```

#### 2) Selecting or dropping keys on object types

* Pick a subset of keys: `Pick<T, K>`
* Omit a subset of keys: `Omit<T, K>`

```ts
type UserNameOnly = Pick<User, "name">;  // -> { name: string }
type WithoutAge   = Omit<User, "age">;   // -> { id: number; name: string }
```

#### 3) Dynamic key maps

* Create dictionary types with controlled keys/values: `Record<K, V>`

```ts
type Roles   = "admin" | "user";
type RoleMap = Record<Roles, boolean>; // -> { admin: boolean; user: boolean }
```

#### 4) Union surgery

* Remove members from a union: `Exclude<T, U>`
* Keep only overlapping members: `Extract<T, U>`

```ts
type T1 = Exclude<"a" | "b" | "c", "b">;     // -> "a" | "c"
type T2 = Extract<"a" | "b" | "c", "a" | "d">; // -> "a"
```

#### 5) Nullability control

* Remove `null` and `undefined`: `NonNullable<T>`

```ts
type T3 = NonNullable<string | null | undefined>; // -> string
```

#### 6) Function type helpers

* Return type of a function: `ReturnType<typeof fn>`
* Parameter tuple of a function: `Parameters<typeof fn>`

```ts
const fn = (x: number, y: string) => 42;
type Result = ReturnType<typeof fn>;   // -> number
type Params = Parameters<typeof fn>;   // -> [x: number, y: string]
```

#### 7) Class/constructor helpers

* Constructor parameters tuple: `ConstructorParameters<typeof C>`
* Instance type: `InstanceType<typeof C>`

```ts
class Example { constructor(public a: string, public b: number) {} }
type CParams  = ConstructorParameters<typeof Example>; // -> [a: string, b: number]
type Instance = InstanceType<typeof Example>;          // -> Example
```

#### 8) Promise/thenable resolution

* Unwrap the awaited value: `Awaited<T>`

```ts
type AsyncResult = Awaited<Promise<string>>; // -> string
```

#### 9) String-literal transforms (compile-time only)

* `Uppercase<S>`, `Lowercase<S>`, `Capitalize<S>`, `Uncapitalize<S>`

```ts
type U = Uppercase<"hello">;      // -> "HELLO"
type L = Lowercase<"HELLO">;      // -> "hello"
type C = Capitalize<"hello">;     // -> "Hello"
type UC = Uncapitalize<"Hello">;  // -> "hello"
```

#### 10) Value-of / key-of patterns

* Keys of an object: `keyof T`
* Union of value types: `T[keyof T]`

```ts
type UserValues = User[keyof User]; // -> number | string | undefined
```

---

### Output expectations (always follow)

* Prefer these utilities over manual remapping when they express intent clearly.
* Add brief `// ->` comments showing resulting types for clarity.
* Avoid runtime code for type tasks; keep examples minimal and compile-time.
* Preserve inference; don’t over-annotate generics unless necessary.
* When creating new maps, prefer `Record<LiteralUnion, V>` or indexed types over `{ [k: string]: V }` when keys are known.
* Use `Exclude`/`Extract`/`NonNullable` instead of conditional descriptions in prose.
* For functions and classes, derive types from implementations via `typeof` + the helpers above (don’t duplicate types).

---

### Quick templates (paste as needed)

```ts
// Template: make some props optional/required
type SomeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type SomeRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

// Template: deep readonly (shallow shown above)
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

// Template: value-of a const map
const STATUS = { OPEN: "open", CLOSED: "closed" } as const;
type Status = typeof STATUS[keyof typeof STATUS]; // "open" | "closed"
```

Use these patterns in all TypeScript you generate unless the user explicitly asks for a different style.
