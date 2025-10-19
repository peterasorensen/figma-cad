import * as THREE from 'three'

export class CursorManager {
  constructor(sceneWrapper, camera) {
    this.sceneWrapper = sceneWrapper // The Scene class instance
    this.scene = sceneWrapper.getScene() // The Three.js scene
    this.camera = camera
    this.cursors = new Map() // userId -> cursor object
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()

    // Create cursor geometry and materials
    this.createCursorAssets()

    // Track mouse movement for local cursor projection
    this.setupMouseTracking()
  }

  createCursorAssets() {
    // Cursor geometry - a simple ring/donut shape
    this.cursorGeometry = new THREE.RingGeometry(0.1, 0.2, 16)
    this.cursorMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    })

    // Label geometry for user names
    this.labelGeometry = new THREE.PlaneGeometry(4.8, 1.8)

    // User colors for different users
    this.userColors = [
      0xff6b6b, // Red
      0x4ecdc4, // Teal
      0x45b7d1, // Blue
      0xf9ca24, // Yellow
      0xf0932b, // Orange
      0xeb4d4b, // Pink
      0x6c5ce7, // Purple
      0xa29bfe, // Light Purple
      0xfd79a8, // Light Pink
      0x00b894  // Green
    ]
  }

  setupMouseTracking() {
    const canvas = this.sceneWrapper.canvas
    console.log('🖱️ Setting up mouse tracking on canvas:', canvas)

    if (!canvas) {
      console.error('🖱️ Canvas not found for mouse tracking!')
      return
    }

    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect()
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    //   console.log('🖱️ Mouse moved - normalized coords:', this.mouse.x, this.mouse.y)
    })

    console.log('🖱️ Mouse tracking setup complete')
  }

  // Convert 2D mouse position to 3D world position on a plane
  get3DPositionFromMouse(distance = 10) {
    // console.log('🖱️ Converting mouse position:', this.mouse.x, this.mouse.y)

    this.raycaster.setFromCamera(this.mouse, this.camera)

    // Create a plane parallel to the camera's view plane at the specified distance
    const cameraDirection = new THREE.Vector3()
    this.camera.getWorldDirection(cameraDirection)
    const plane = new THREE.Plane(cameraDirection, -distance)
    const intersection = new THREE.Vector3()
    const hasIntersection = this.raycaster.ray.intersectPlane(plane, intersection)

    // console.log('🖱️ Camera direction:', cameraDirection.x, cameraDirection.y, cameraDirection.z)
    // console.log('🖱️ Plane normal:', plane.normal.x, plane.normal.y, plane.normal.z)
    // console.log('🖱️ Intersection result:', hasIntersection, intersection.x, intersection.y, intersection.z)

    if (!hasIntersection) {
      console.warn('🖱️ No intersection found, returning origin')
      return new THREE.Vector3(0, 0, 0)
    }

    return intersection
  }

  addUserCursor(userId, userName, colorIndex = 0) {
    // Create cursor mesh
    const cursorMesh = new THREE.Mesh(this.cursorGeometry, this.cursorMaterial.clone())
    cursorMesh.material.color.setHex(this.userColors[colorIndex % this.userColors.length])

    // Create label
    const labelCanvas = this.createLabelCanvas(userName)
    const labelTexture = new THREE.CanvasTexture(labelCanvas)
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      side: THREE.DoubleSide
    })
    const labelMesh = new THREE.Mesh(this.labelGeometry, labelMaterial)

    // Position label above cursor (adjusted for larger size)
    labelMesh.position.set(0, 0.8, 0)

    // Group cursor and label together
    const cursorGroup = new THREE.Group()
    cursorGroup.add(cursorMesh)
    cursorGroup.add(labelMesh)

    // Store cursor data
    const cursorData = {
      group: cursorGroup,
      mesh: cursorMesh,
      label: labelMesh,
      userId,
      userName,
      lastUpdate: Date.now()
    }

    this.cursors.set(userId, cursorData)
    this.scene.add(cursorGroup)

    return cursorData
  }

  removeUserCursor(userId) {
    const cursorData = this.cursors.get(userId)
    if (cursorData) {
      this.scene.remove(cursorData.group)
      this.cursors.delete(userId)
    }
  }

  updateCursorPosition(userId, position, timestamp) {
    const cursorData = this.cursors.get(userId)
    if (!cursorData) return

    // Update position
    cursorData.group.position.set(position.x, position.y, position.z)

    // Make cursor face the camera (billboard effect)
    cursorData.group.lookAt(this.camera.position)

    // Update timestamp for cleanup
    cursorData.lastUpdate = timestamp || Date.now()
  }

  createLabelCanvas(text) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = 1536  // 300% larger
    canvas.height = 384 // 300% larger

    // Clear canvas
    context.fillStyle = 'rgba(0, 0, 0, 0)'
    context.fillRect(0, 0, canvas.width, canvas.height)

    // Draw text
    context.font = 'Bold 144px Arial' // 300% larger
    context.fillStyle = 'white'
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    // Add slight shadow for readability
    context.shadowColor = 'rgba(0, 0, 0, 0.5)'
    context.shadowBlur = 12
    context.shadowOffsetX = 6
    context.shadowOffsetY = 6

    context.fillText(text, canvas.width / 2, canvas.height / 2)

    return canvas
  }

  update() {
    const now = Date.now()

    // Clean up old cursors (cursors that haven't been updated in 60 seconds)
    // This prevents memory leaks but gives users time to be inactive
    for (const [userId, cursorData] of this.cursors.entries()) {
      if (now - cursorData.lastUpdate > 60000) {
        this.removeUserCursor(userId)
      }
    }

    // Update cursor positions based on remote data
    // This would be called by the socket manager when cursor updates arrive
  }

  getAllCursors() {
    return Array.from(this.cursors.values())
  }

  getCursor(userId) {
    return this.cursors.get(userId)
  }

  clearAllCursors() {
    for (const userId of this.cursors.keys()) {
      this.removeUserCursor(userId)
    }
  }

  updateCursorLabel(cursor) {
    if (cursor && cursor.label) {
      // Update the canvas texture with the new username
      const labelCanvas = this.createLabelCanvas(cursor.userName)
      cursor.label.material.map = new THREE.CanvasTexture(labelCanvas)
      cursor.label.material.map.needsUpdate = true
    }
  }

  // Get color index for a user (for consistent coloring)
  getUserColorIndex(userId) {
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash)
    }
    return Math.abs(hash) % this.userColors.length
  }
}
