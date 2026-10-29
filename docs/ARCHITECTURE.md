# Architecture

Intelli-Wha is intentionally split into a generic chat runtime and use-case agents.

## Runtime Flow

```text
Baileys / Telegram
  -> normalize incoming message
  -> conversation runtime loads state
  -> active agent handles message
  -> runtime sends replies and queues long-running jobs
  -> worker creates previews/final assets
```

## Generic Pieces

- `ChatAdapter`: receives and sends messages for WhatsApp, Telegram, and future channels.
- `ConversationRuntime`: loads state, calls an agent, sends replies, queues jobs.
- `AgentModule`: a pluggable use case such as seller studio, booking, support, or collections.
- `ModelRouter`: maps tasks like chat, vision, background removal, image edit, and video to providers.
- `Worker`: handles long-running AI/media jobs outside the chat response path.

## First Use Case: Seller Studio

The seller studio agent follows a token-saving policy:

1. Wait for a product image.
2. Ask for missing price, style, and target platform.
3. Generate a cheap preview.
4. Ask for approval.
5. Generate the final content pack.

Text overlays such as price, phone number, and delivery terms should be done by code, not image models.