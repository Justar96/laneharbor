# Protocol Buffer Definitions

This directory contains protocol buffer definitions copied from the storage service.

## storage.proto

This file is a copy of `../storage/proto/storage.proto` and defines the gRPC interface for communicating with the storage service.

⚠️ **Important**: This file should be kept in sync with the storage service's proto definition. When the storage service's proto file is updated, this copy should be updated as well.

## Why is this here?

The backend service needs to communicate with the storage service via gRPC, which requires access to the protocol buffer definitions. In the Docker container, the backend doesn't have access to the storage service's source code, so we maintain a local copy of the proto file.

## Keeping it in sync

When updating the storage service's proto definitions:
1. Update `../storage/proto/storage.proto`
2. Copy the changes to this file: `proto/storage.proto`
3. Rebuild both services
