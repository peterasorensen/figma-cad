// Test script to verify the io parameter fix
import { executeCanvasFunction } from './server/ai/canvas-operations.js'

// Mock io object
const mockIo = {
  to: (room) => ({
    emit: (event, data) => {
      console.log(`Mock io: Emitted ${event} to room ${room}`, data)
    }
  })
}

// Test the createShape function
async function testCreateShape() {
  try {
    console.log('Testing createShape function with mock io...')

    const args = {
      type: 'circle',
      x: 0,
      y: 0,
      z: 0,
      radius: 5,
      color: '#ff0000'
    }

    const result = await executeCanvasFunction('createShape', args, 'test-canvas', 'test-user', mockIo)

    console.log('Success! Result:', result)
    return true
  } catch (error) {
    console.error('Error:', error.message)
    return false
  }
}

// Run the test
testCreateShape().then(success => {
  if (success) {
    console.log('✅ Test passed: io parameter fix is working')
  } else {
    console.log('❌ Test failed: io parameter fix did not work')
  }
  process.exit(success ? 0 : 1)
})
