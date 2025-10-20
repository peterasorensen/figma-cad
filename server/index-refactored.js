import { createApp, startServer } from './core/server.js'
import { setupSocketHandlers } from './socket/socket-handler.js'
import { setupApiRoutes } from './routes/api.js'
import { setupAIChatEndpoint } from './ai/functions.js'

// Create the Express app and Socket.io server
const { app, server, io } = createApp()

// Set up all the routes and handlers
setupApiRoutes(app)
setupAIChatEndpoint(app)
setupSocketHandlers(io)

// Start the server
const PORT = process.env.PORT || 3001
startServer(server, PORT)
