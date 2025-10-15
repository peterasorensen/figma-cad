// Quick FPS test
let frames = 0;
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  frames++;
  
  const currentTime = performance.now();
  const deltaTime = currentTime - lastTime;
  
  if (deltaTime >= 1000) {
    console.log('Raw FPS:', frames);
    frames = 0;
    lastTime = currentTime;
  }
}

animate();
