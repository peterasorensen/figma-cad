import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') })

export function createApp() {
  const app = express()
  const server = createServer(app)
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
  })

  // Middleware
  app.use(cors())
  app.use(express.json())

  return { app, server, io }
}

export function startServer(server, port) {
  server.listen(port, () => {
    console.log("CollabCanvas server running on port " + port)
    console.log("Socket.io server ready for connections")
  })
}
