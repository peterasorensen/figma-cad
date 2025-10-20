import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');
const canvasId = '3b2eafe8-c436-42d7-98da-71ad4f04e091';
const userId = 'test-user-' + Date.now();

console.log('Testing shape persistence...');

socket.on('connect', () => {
  console.log('Connected to server');

  // Join canvas
  socket.emit('join-canvas', { canvasId, userId });

  socket.on('canvas-state', (data) => {
    console.log(`📊 Received canvas state: ${data.objects?.length || 0} objects, ${data.sessions?.length || 0} sessions`);

    if (data.objects && data.objects.length > 0) {
      console.log('✅ SUCCESS: Objects loaded from database!');
      console.log('Sample object:', JSON.stringify(data.objects[0], null, 2));
    } else {
      console.log('❌ No objects found in database');

      // Create a test object
      console.log('Creating test object...');
      const testObject = {
        id: 'test-shape-' + Date.now(),
        type: 'box',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        rotation_x: 0,
        rotation_y: 0,
        rotation_z: 0,
        scale_x: 1,
        scale_y: 1,
        scale_z: 1,
        width: 100,
        height: 100,
        depth: 100,
        color: '#ff0000',
        geometry: {
          type: 'BoxGeometry',
          parameters: { width: 100, height: 100, depth: 100 },
          attributes: {
            position: {
              array: [
                -50, -50, 50, 50, -50, 50, 50, 50, 50, -50, 50, 50,
                -50, -50, -50, -50, 50, -50, 50, 50, -50, 50, -50, -50,
                -50, 50, 50, -50, 50, -50, -50, -50, -50, -50, -50, 50,
                50, 50, 50, 50, -50, -50, 50, -50, 50, 50, -50, -50,
                50, 50, -50, 50, -50, 50, -50, 50, -50, -50, 50, -50,
                -50, -50, -50, 50, -50, -50, 50, -50, 50, -50, 50, -50
              ],
              itemSize: 3,
              normalized: false
            }
          }
        }
      };

      socket.emit('create-object', testObject);
      console.log('Test object created, waiting...');

      // Wait a bit then disconnect and reconnect to test persistence
      setTimeout(() => {
        console.log('Disconnecting and reconnecting to test persistence...');
        socket.disconnect();

        setTimeout(() => {
          const newSocket = io('http://localhost:3001');
          newSocket.on('connect', () => {
            console.log('Reconnected, joining canvas again...');
            newSocket.emit('join-canvas', { canvasId, userId: userId + '-reconnect' });
          });

          newSocket.on('canvas-state', (data) => {
            console.log(`📊 After reconnect: ${data.objects?.length || 0} objects`);
            if (data.objects && data.objects.length > 0) {
              console.log('✅ SUCCESS: Object persisted after refresh!');
            } else {
              console.log('❌ FAILURE: Object did not persist');
            }
            newSocket.disconnect();
            process.exit(data.objects?.length > 0 ? 0 : 1);
          });
        }, 1000);
      }, 2000);
    }
  });
});

socket.on('object-created', (data) => {
  console.log('Object created successfully:', data.id);
});
