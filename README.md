# CollabCanvas

Real-time collaborative 3D/2D design tool with AI capabilities.

## Features

- Real-time multiplayer editing
- 3D and 2D shape manipulation
- Pan/zoom/rotate canvas
- STL export for 3D printing
- AI-powered design assistance (planned)

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account

### Installation

1. Install dependencies:
```bash
npm install
cd server && npm install && cd ..
```

2. Set up environment variables:
```bash
cp .env.example .env
# Add your Supabase credentials
```

3. Run development servers:
```bash
npm run dev
```

This starts both the frontend (http://localhost:5173) and backend (http://localhost:3000).

## Project Structure

```
collabcanvas/
├── client/          # Frontend application
│   ├── src/
│   │   ├── core/    # Three.js setup and rendering
│   │   ├── shapes/  # Shape creation and management
│   │   ├── network/ # Socket.io client and sync
│   │   └── ui/      # UI components
│   └── index.html
├── server/          # Backend server
│   ├── index.js     # Express + Socket.io server
│   └── db.js        # Supabase integration
└── shared/          # Shared types and schemas
```

## Tech Stack

- **Frontend**: Three.js, Socket.io-client, Vite
- **Backend**: Express, Socket.io, Supabase
- **Hosting**: TBD
