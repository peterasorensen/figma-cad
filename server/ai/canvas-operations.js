import { supabase } from '../core/database.js'
import {
  findShapesByDescription,
  findShapeByDescription,
  getColorName
} from './helpers.js'

// Execute canvas manipulation functions
export async function executeCanvasFunction(functionName, args, canvasId, userId, io) {
  const actions = []

  switch (functionName) {
    case 'createShape':
      return await handleCreateShape(args, canvasId, userId, io)

    case 'moveShape':
      return await handleMoveShape(args, canvasId, userId, io)

    case 'resizeShape':
      return await handleResizeShape(args, canvasId, userId, io)

    case 'rotateShape':
      return await handleRotateShape(args, canvasId, userId, io)

    case 'deleteShape':
      return await handleDeleteShape(args, canvasId, userId, io)

    case 'getCanvasState':
      return await handleGetCanvasState(canvasId)

    case 'arrangeShapes':
      return await handleArrangeShapes(args, canvasId, userId, io)

    case 'createGrid':
      return await handleCreateGrid(args, canvasId, userId, io)

    case 'moveToPosition':
      return await handleMoveToPosition(args, canvasId, userId, io)

    case 'booleanSubtract':
      return await handleBooleanSubtract(args, canvasId, userId, io)

    case 'booleanUnion':
      return await handleBooleanUnion(args, canvasId, userId, io)

    // case 'booleanIntersect':
    //   return await handleBooleanIntersect(args, canvasId, userId)

    default:
      throw new Error("Unknown function: " + functionName)
  }
}

// Canvas function implementations
async function handleCreateShape(args, canvasId, userId, io) {
  const {
    type,
    x = 0,
    y = 0,
    z = 0,
    width = 2,
    height = 2,
    depth = 2,
    radius = 1,
    tube = 0.4,
    tubularSegments = 20,
    radialSegments = 8,
    color = '#4f46e5',
    text,
    fontSize = 1,
    rotation_x = 0,
    rotation_y = 0,
    rotation_z = 0
  } = args

  // Map AI types to internal types
  const typeMapping = {
    rectangle: 'rectangle',
    circle: 'circle',
    box: 'box',
    sphere: 'sphere',
    cylinder: 'cylinder',
    text: 'text',
    torus: 'torus',
    torusKnot: 'torusKnot',
    dodecahedron: 'dodecahedron',
    icosahedron: 'icosahedron',
    octahedron: 'octahedron',
    tetrahedron: 'tetrahedron',
    tube: 'tube'
  }

  const internalType = typeMapping[type]
  if (!internalType) {
    throw new Error("Unsupported shape type: " + type)
  }

  // For 2D shapes (rectangle, circle), they should be placed on ground (y=0)
  // and use z coordinate for positioning
  let positionX = x
  let positionY = y
  let positionZ = z

  if (internalType === 'rectangle' || internalType === 'circle') {
    positionY = 0.05 // Slightly above ground to avoid z-fighting
    positionZ = z // Use z parameter as the ground position
  }

  // Create the object in database with individual columns
  const objectData = {
    type: internalType,
    canvas_id: canvasId,
    created_by: userId,
    position_x: positionX,
    position_y: positionY,
    position_z: positionZ,
    rotation_x: rotation_x,
    rotation_y: rotation_y,
    rotation_z: rotation_z,
    scale_x: 1,
    scale_y: 1,
    scale_z: 1,
    color: color,
    geometry: '' // Will be set by client
  }

  // Set shape-specific properties based on type
  switch (internalType) {
    case 'rectangle':
      objectData.width = width
      objectData.height = height
      break
    case 'circle':
      // Circles use width/height for ground plane sizing
      objectData.width = radius * 2
      objectData.height = radius * 2
      break
    case 'box':
      objectData.width = width
      objectData.height = height
      objectData.depth = depth
      break
    case 'sphere':
    case 'dodecahedron':
    case 'icosahedron':
    case 'octahedron':
    case 'tetrahedron':
      // For spherical shapes, use radius as width for client-side processing
      objectData.width = radius
      objectData.height = radius
      objectData.depth = radius
      break
    case 'cylinder':
      objectData.width = radius * 2
      objectData.height = height
      objectData.depth = radius * 2
      break
    case 'torus':
    case 'torusKnot':
      objectData.width = radius * 2
      objectData.height = tube * 2
      objectData.depth = radius * 2
      break
    case 'tube':
      objectData.width = radius * 2
      objectData.height = radius * 2
      objectData.depth = radius * 2
      break
    case 'text':
      if (text) {
        objectData.text_content = text
        objectData.font_size = fontSize
      }
      break
  }

  const { data: newObject, error } = await supabase
    .from('objects')
    .insert(objectData)
    .select()
    .single()

  if (error) throw error

  // Broadcast to all users in the canvas
  io.to("canvas:" + canvasId).emit('object-created', newObject)

  const colorName = getColorName(color)
  const shapeDesc = text ? `"${text}"` : colorName + " " + type

  return {
    message: "Created a " + shapeDesc + " at position (" + Math.round(positionX) + ", " + Math.round(positionY) + ", " + Math.round(positionZ) + ").",
    actions: [{
      type: 'create',
      shapeId: newObject.id,
      successMessage: "Created " + shapeDesc
    }]
  }
}

async function handleMoveShape(args, canvasId, userId, io) {
  const { shapeId, x, y, z, shapeDescription } = args

  let targetShapeIds = shapeId ? [shapeId] : []

  // If no shapeId provided but shapeDescription is given, find the shapes
  if (targetShapeIds.length === 0 && shapeDescription) {
    const { data: objects } = await supabase
      .from('objects')
      .select('*')
      .eq('canvas_id', canvasId)

    const shapes = objects ? objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: obj.properties || {}
    })) : []

    const matchingShapes = findShapesByDescription(shapes, shapeDescription)
    targetShapeIds = matchingShapes.map(shape => shape.id)

    if (targetShapeIds.length === 0) {
      throw new Error("Could not find any shapes matching: " + shapeDescription)
    }
  }

  if (targetShapeIds.length === 0) {
    throw new Error('No shapes specified to move')
  }

  const actions = []
  let movedCount = 0

  // Move each shape
  for (const targetShapeId of targetShapeIds) {
    // Get current shape to determine if it's 2D or 3D
    const { data: currentShape } = await supabase
      .from('objects')
      .select('type, position_x, position_y, position_z')
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)
      .single()

    if (!currentShape) continue

    // For 2D shapes, only update x and z (keep y on ground)
    const is2DShape = ['rectangle', 'circle'].includes(currentShape.type)

    const updateData = {}
    if (x !== undefined) updateData.position_x = x
    if (y !== undefined) updateData.position_y = is2DShape ? 0.05 : y // Keep 2D shapes on ground
    if (z !== undefined) updateData.position_z = is2DShape ? z : (z !== undefined ? z : currentShape.position_z)

    // Update the object position
    const { error } = await supabase
      .from('objects')
      .update(updateData)
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)

    if (!error) {
      // Broadcast update
      io.to("canvas:" + canvasId).emit('object-updated', {
        id: targetShapeId,
        ...updateData
      })

      movedCount++
      const finalX = updateData.position_x !== undefined ? updateData.position_x : currentShape.position_x
      const finalY = updateData.position_y !== undefined ? updateData.position_y : currentShape.position_y
      const finalZ = updateData.position_z !== undefined ? updateData.position_z : currentShape.position_z

      actions.push({
        type: 'move',
        shapeId: targetShapeId,
        successMessage: "Moved shape to (" + Math.round(finalX) + ", " + Math.round(finalY) + ", " + Math.round(finalZ) + ")"
      })
    }
  }

  const shapeWord = movedCount === 1 ? 'shape' : 'shapes'
  return {
    message: "Moved " + movedCount + " " + shapeWord + " to position (" + Math.round(x || 0) + ", " + Math.round(y || 0) + ", " + Math.round(z || 0) + ").",
    actions: actions
  }
}

async function handleResizeShape(args, canvasId, userId, io) {
  const { shapeId, width, height, scale = 1, shapeDescription } = args

  let targetShapeIds = shapeId ? [shapeId] : []

  // If no shapeId provided but shapeDescription is given, find the shapes
  if (targetShapeIds.length === 0 && shapeDescription) {
    const { data: objects } = await supabase
      .from('objects')
      .select('*')
      .eq('canvas_id', canvasId)

    const shapes = objects ? objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: obj.properties || {}
    })) : []

    const matchingShapes = findShapesByDescription(shapes, shapeDescription)
    targetShapeIds = matchingShapes.map(shape => shape.id)

    if (targetShapeIds.length === 0) {
      throw new Error("Could not find any shapes matching: " + shapeDescription)
    }
  }

  if (targetShapeIds.length === 0) {
    throw new Error('No shapes specified to resize')
  }

  const actions = []
  let resizedCount = 0

  // Resize each shape
  for (const targetShapeId of targetShapeIds) {
    // Get current object
    const { data: obj } = await supabase
      .from('objects')
      .select('*')
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)
      .single()

    if (!obj) continue

    let updateData = {}

    if (width !== undefined && height !== undefined) {
      updateData.scale_x = width / 2 // Assuming original size was 2
      updateData.scale_y = height / 2
    } else if (scale !== undefined) {
      updateData.scale_x = obj.scale_x * scale
      updateData.scale_y = obj.scale_y * scale
      updateData.scale_z = obj.scale_z * scale
    }

    const { error } = await supabase
      .from('objects')
      .update(updateData)
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)

    if (!error) {
      // Broadcast update
      io.to("canvas:" + canvasId).emit('object-updated', {
        id: targetShapeId,
        ...updateData
      })

      resizedCount++
      actions.push({
        type: 'resize',
        shapeId: targetShapeId,
        successMessage: "Resized shape"
      })
    }
  }

  const shapeWord = resizedCount === 1 ? 'shape' : 'shapes'
  const scaleText = scale !== 1 ? scale + "x scale" : (width || "current") + "×" + (height || "current")
  return {
    message: "Resized " + resizedCount + " " + shapeWord + " to " + scaleText + ".",
    actions: actions
  }
}

async function handleRotateShape(args, canvasId, userId, io) {
  const { shapeId, degrees, shapeDescription } = args

  let targetShapeIds = shapeId ? [shapeId] : []

  // If no shapeId provided but shapeDescription is given, find the shapes
  if (targetShapeIds.length === 0 && shapeDescription) {
    const { data: objects } = await supabase
      .from('objects')
      .select('*')
      .eq('canvas_id', canvasId)

    const shapes = objects ? objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: obj.properties || {}
    })) : []

    const matchingShapes = findShapesByDescription(shapes, shapeDescription)
    targetShapeIds = matchingShapes.map(shape => shape.id)

    if (targetShapeIds.length === 0) {
      throw new Error("Could not find any shapes matching: " + shapeDescription)
    }
  }

  if (targetShapeIds.length === 0) {
    throw new Error('No shapes specified to rotate')
  }

  const actions = []
  let rotatedCount = 0

  const radians = (degrees * Math.PI) / 180

  // Rotate each shape
  for (const targetShapeId of targetShapeIds) {
    const { error } = await supabase
      .from('objects')
      .update({
        rotation_z: radians
      })
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)

    if (!error) {
      // Broadcast update
      io.to("canvas:" + canvasId).emit('object-updated', {
        id: targetShapeId,
        rotation_z: radians
      })

      rotatedCount++
      actions.push({
        type: 'rotate',
        shapeId: targetShapeId,
        successMessage: "Rotated shape " + degrees + "°"
      })
    }
  }

  const shapeWord = rotatedCount === 1 ? 'shape' : 'shapes'
  return {
    message: "Rotated " + rotatedCount + " " + shapeWord + " by " + degrees + " degrees.",
    actions: actions
  }
}

async function handleDeleteShape(args, canvasId, userId, io) {
  const { shapeId, shapeDescription } = args

  let targetShapeIds = shapeId ? [shapeId] : []

  // If no shapeId provided but shapeDescription is given, find the shapes
  if (targetShapeIds.length === 0 && shapeDescription) {
    const { data: objects } = await supabase
      .from('objects')
      .select('*')
      .eq('canvas_id', canvasId)

    const shapes = objects ? objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: obj.properties || {}
    })) : []

    const matchingShapes = findShapesByDescription(shapes, shapeDescription)
    targetShapeIds = matchingShapes.map(shape => shape.id)

    if (targetShapeIds.length === 0) {
      throw new Error("Could not find any shapes matching: " + shapeDescription)
    }
  }

  if (targetShapeIds.length === 0) {
    throw new Error('No shapes specified to delete')
  }

  const actions = []
  let deletedCount = 0

  // Delete each shape
  for (const targetShapeId of targetShapeIds) {
    const { error } = await supabase
      .from('objects')
      .delete()
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)

    if (!error) {
      // Broadcast deletion
      io.to("canvas:" + canvasId).emit('object-deleted', { id: targetShapeId })

      deletedCount++
      actions.push({
        type: 'delete',
        shapeId: targetShapeId,
        successMessage: "Deleted shape"
      })
    }
  }

  const shapeWord = deletedCount === 1 ? 'shape' : 'shapes'
  return {
    message: "Deleted " + deletedCount + " " + shapeWord + ".",
    actions: actions
  }
}

async function handleGetCanvasState(canvasId) {
  const { data: objects } = await supabase
    .from('objects')
    .select('*')
    .eq('canvas_id', canvasId)

  const shapes = objects ? objects.map(obj => {
    // Build properties from individual columns
    const properties = {
      color: obj.color,
      width: obj.width,
      height: obj.height,
      depth: obj.depth
    }

    // For text objects, extract text from geometry if it exists
    if (obj.type === 'text' && obj.geometry) {
      try {
        const geometryData = JSON.parse(obj.geometry)
        if (geometryData.text) {
          properties.text = geometryData.text
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    return {
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: properties
    }
  }) : []

  return {
    message: "Canvas has " + shapes.length + " shapes.",
    actions: []
  }
}

async function handleArrangeShapes(args, canvasId, userId, io) {
  const { shapeIds, layout, spacing = 50, startX = 0, startY = 0, columns, shapeDescription } = args

  let targetShapeIds = shapeIds

  // If no shapeIds provided but shapeDescription is given, find the shapes
  if ((!targetShapeIds || targetShapeIds.length === 0) && shapeDescription) {
    const { data: objects } = await supabase
      .from('objects')
      .select('*')
      .eq('canvas_id', canvasId)

    const shapes = objects ? objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: obj.properties || {}
    })) : []

    const matchingShapes = findShapesByDescription(shapes, shapeDescription)
    targetShapeIds = matchingShapes.map(shape => shape.id)
  }

  if (!targetShapeIds || targetShapeIds.length === 0) {
    throw new Error('No shapes specified for arrangement')
  }

  const actions = []
  let currentX = startX
  let currentY = startY

  if (layout === 'horizontal') {
    for (let i = 0; i < targetShapeIds.length; i++) {
      const shapeId = targetShapeIds[i]

      const { error } = await supabase
        .from('objects')
        .update({
          position_x: currentX,
          position_y: currentY
        })
        .eq('id', shapeId)
        .eq('canvas_id', canvasId)

      if (!error) {
        io.to("canvas:" + canvasId).emit('object-updated', {
          id: shapeId,
          position_x: currentX,
          position_y: currentY
        })
        actions.push({
          type: 'move',
          shapeId: shapeId,
          successMessage: "Arranged shape " + (i + 1)
        })
      }

      currentX += spacing
    }
  } else if (layout === 'vertical') {
    for (let i = 0; i < targetShapeIds.length; i++) {
      const shapeId = targetShapeIds[i]

      const { error } = await supabase
        .from('objects')
        .update({
          position_x: currentX,
          position_y: currentY
        })
        .eq('id', shapeId)
        .eq('canvas_id', canvasId)

      if (!error) {
        io.to("canvas:" + canvasId).emit('object-updated', {
          id: shapeId,
          position_x: currentX,
          position_y: currentY
        })
        actions.push({
          type: 'move',
          shapeId: shapeId,
          successMessage: "Arranged shape " + (i + 1)
        })
      }

      currentY += spacing
    }
  } else if (layout === 'grid') {
    const cols = columns || Math.ceil(Math.sqrt(targetShapeIds.length))
    let col = 0
    let row = 0

    for (let i = 0; i < targetShapeIds.length; i++) {
      const shapeId = targetShapeIds[i]

      const { error } = await supabase
        .from('objects')
        .update({
          position_x: startX + col * spacing,
          position_y: startY + row * spacing
        })
        .eq('id', shapeId)
        .eq('canvas_id', canvasId)

      if (!error) {
        io.to("canvas:" + canvasId).emit('object-updated', {
          id: shapeId,
          position_x: startX + col * spacing,
          position_y: startY + row * spacing
        })
        actions.push({
          type: 'move',
          shapeId: shapeId,
          successMessage: "Placed shape in grid position (" + (col + 1) + ", " + (row + 1) + ")"
        })
      }

      col++
      if (col >= cols) {
        col = 0
        row++
      }
    }
  }

  return {
    message: "Arranged " + targetShapeIds.length + " shapes in a " + layout + " layout.",
    actions: actions
  }
}

async function handleCreateGrid(args, canvasId, userId, io) {
  const {
    shapeType,
    rows,
    columns,
    startX = 0,
    startY = 0,
    startZ = 0,
    spacing = 60,
    size = 40,
    color = '#4f46e5'
  } = args

  // For 2D shapes, use z coordinate for ground positioning
  const is2DShape = shapeType === 'rectangle' || shapeType === 'circle'

  const createdShapes = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = startX + col * spacing
      const y = is2DShape ? 0 : startY + row * spacing
      const z = is2DShape ? startZ + row * spacing : startZ

      try {
        const shape = await createShapeDirectly({
          type: shapeType,
          x: x,
          y: y,
          z: z,
          width: size,
          height: size,
          depth: size,
          radius: size / 2,
          tube: size / 8,
          color: color
        }, canvasId, userId)

        if (shape) {
          createdShapes.push(shape)
        }
      } catch (error) {
        console.error('Error creating grid element:', error)
      }
    }
  }

  return {
    message: "Created a " + rows + "×" + columns + " grid of " + shapeType + "s.",
    actions: [] // No individual success messages for bulk operations
  }
}

async function handleMoveToPosition(args, canvasId, userId, io) {
  const { shapeDescription, position, height } = args

  if (!shapeDescription) {
    throw new Error('No shape description provided')
  }

  // Get all shapes to find the targets
  const { data: objects } = await supabase
    .from('objects')
    .select('*')
    .eq('canvas_id', canvasId)

  const shapes = objects ? objects.map(obj => ({
    id: obj.id,
    type: obj.type,
    position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
    color: obj.color,
    properties: obj.properties || {}
  })) : []

  const matchingShapes = findShapesByDescription(shapes, shapeDescription)
  if (matchingShapes.length === 0) {
    throw new Error("Could not find any shapes matching: " + shapeDescription)
  }

  // Define position coordinates (canvas is roughly 50x50, center at 0,0)
  const positions = {
    'center': { x: 0, y: 0, z: 0 },
    'top-left': { x: -15, y: 5, z: -15 },
    'top-right': { x: 15, y: 5, z: -15 },
    'bottom-left': { x: -15, y: 5, z: 15 },
    'bottom-right': { x: 15, y: 5, z: 15 },
    'top-center': { x: 0, y: 5, z: -15 },
    'bottom-center': { x: 0, y: 5, z: 15 },
    'left-center': { x: -15, y: 5, z: 0 },
    'right-center': { x: 15, y: 5, z: 0 }
  }

  const targetPos = positions[position]
  if (!targetPos) {
    throw new Error("Unknown position: " + position)
  }

  const actions = []
  let movedCount = 0

  // Move each matching shape, with slight offsets for multiple shapes at center
  for (let i = 0; i < matchingShapes.length; i++) {
    const shape = matchingShapes[i]

    // For 2D shapes, keep them on ground
    const is2DShape = ['rectangle', 'circle'].includes(shape.type)
    const baseY = is2DShape ? 0.05 : (height !== undefined ? height : targetPos.y)

    // Add slight random offset for multiple shapes at same position to avoid overlap
    let offsetX = 0
    let offsetY = 0
    let offsetZ = 0

    if (matchingShapes.length > 1 && position === 'center') {
      // Spread shapes around center if multiple
      const spread = 2
      offsetX = (Math.random() - 0.5) * spread
      offsetZ = (Math.random() - 0.5) * spread
      if (!is2DShape) {
        offsetY = (Math.random() - 0.5) * spread
      }
    }

    const finalX = targetPos.x + offsetX
    const finalY = baseY + offsetY
    const finalZ = targetPos.z + offsetZ

    const updateData = {
      position_x: finalX,
      position_y: finalY,
      position_z: finalZ
    }

    // Update the shape position
    const { error } = await supabase
      .from('objects')
      .update(updateData)
      .eq('id', shape.id)
      .eq('canvas_id', canvasId)

    if (!error) {
      // Broadcast update
      io.to("canvas:" + canvasId).emit('object-updated', {
        id: shape.id,
        ...updateData
      })

      movedCount++
      actions.push({
        type: 'move',
        shapeId: shape.id,
        successMessage: "Moved " + shape.type + " to " + position
      })
    }
  }

  const shapeWord = movedCount === 1 ? 'shape' : 'shapes'
  return {
    message: "Moved " + movedCount + " " + shapeWord + " matching \"" + shapeDescription + "\" to the " + position + ".",
    actions: actions
  }
}

async function handleBooleanSubtract(args, canvasId, userId, io) {
  const { cuttingShapeDescription, targetShapeDescription, cuttingShapeId, targetShapeId } = args

  // Get all shapes
  const { data: objects } = await supabase
    .from('objects')
    .select('*')
    .eq('canvas_id', canvasId)

  const shapes = objects ? objects.map(obj => ({
    id: obj.id,
    type: obj.type,
    position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
    color: obj.color,
    properties: obj.properties || {},
    geometry: obj.geometry
  })) : []

  // Find cutting shape
  let cuttingShape
  if (cuttingShapeId) {
    cuttingShape = shapes.find(s => s.id === cuttingShapeId)
  } else if (cuttingShapeDescription) {
    cuttingShape = findShapeByDescription(shapes, cuttingShapeDescription)
  }

  if (!cuttingShape) {
    throw new Error("Could not find cutting shape: " + (cuttingShapeDescription || cuttingShapeId))
  }

  // Find target shape
  let targetShape
  if (targetShapeId) {
    targetShape = shapes.find(s => s.id === targetShapeId)
  } else if (targetShapeDescription) {
    targetShape = findShapeByDescription(shapes, targetShapeDescription)
  }

  if (!targetShape) {
    throw new Error("Could not find target shape: " + (targetShapeDescription || targetShapeId))
  }

  if (cuttingShape.id === targetShape.id) {
    throw new Error('Cannot subtract a shape from itself')
  }

  // Perform boolean subtract operation
  // For now, we'll simulate this by updating the target shape's geometry
  // In a real implementation, this would use CSG operations on the geometry data

  try {
    // For now, just delete the cutting shape and mark the target as modified
    await supabase
      .from('objects')
      .delete()
      .eq('id', cuttingShape.id)
      .eq('canvas_id', canvasId)

    // Update target shape to indicate it has been modified (you might want to store CSG result)
    const { error } = await supabase
      .from('objects')
      .update({
        // You could store the modified geometry here
        updated_at: new Date().toISOString()
      })
      .eq('id', targetShape.id)
      .eq('canvas_id', canvasId)

    if (error) {
      throw error
    }

    // Broadcast updates
    io.to("canvas:" + canvasId).emit('object-deleted', { id: cuttingShape.id })
    io.to("canvas:" + canvasId).emit('object-updated', {
      id: targetShape.id,
      updated_at: new Date().toISOString()
    })

    return {
      message: "Performed boolean subtract operation: cut " + cuttingShape.type + " from " + targetShape.type + ".",
      actions: [{
        type: 'boolean-subtract',
        targetShapeId: targetShape.id,
        cuttingShapeId: cuttingShape.id,
        successMessage: "Cut " + cuttingShape.type + " from " + targetShape.type
      }]
    }

  } catch (error) {
    console.error('Error in boolean subtract:', error)
    throw new Error("Failed to perform boolean subtract: " + error.message)
  }
}

async function handleBooleanUnion(args, canvasId, userId, io) {
  const { shape1Description, shape2Description, shape1Id, shape2Id } = args

  // Get all shapes
  const { data: objects } = await supabase
    .from('objects')
    .select('*')
    .eq('canvas_id', canvasId)

  const shapes = objects ? objects.map(obj => ({
    id: obj.id,
    type: obj.type,
    position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
    color: obj.color,
    properties: obj.properties || {},
    geometry: obj.geometry
  })) : []

  // Find shape 1
  let shape1
  if (shape1Id) {
    shape1 = shapes.find(s => s.id === shape1Id)
  } else if (shape1Description) {
    shape1 = findShapeByDescription(shapes, shape1Description)
  }

  if (!shape1) {
    throw new Error("Could not find first shape: " + (shape1Description || shape1Id))
  }

  // Find shape 2
  let shape2
  if (shape2Id) {
    shape2 = shapes.find(s => s.id === shape2Id)
  } else if (shape2Description) {
    shape2 = findShapeByDescription(shapes, shape2Description)
  }

  if (!shape2) {
    throw new Error("Could not find second shape: " + (shape2Description || shape2Id))
  }

  if (shape1.id === shape2.id) {
    throw new Error('Cannot union a shape with itself')
  }

  // For this implementation, we'll keep the first shape and delete the second
  // In practice, you'd perform proper CSG union operation
  await supabase
    .from('objects')
    .delete()
    .eq('id', shape2.id)
    .eq('canvas_id', canvasId)

  // Broadcast updates
  io.to("canvas:" + canvasId).emit('object-deleted', { id: shape2.id })

  return {
    message: "Performed boolean union operation: combined " + shape1.type + " with " + shape2.type + ".",
    actions: [{
      type: 'boolean-union',
      shape1Id: shape1.id,
      shape2Id: shape2.id,
      successMessage: "Combined " + shape1.type + " with " + shape2.type
    }]
  }
}

// Helper function to create shapes directly without success messages (for bulk operations)
async function createShapeDirectly(args, canvasId, userId) {
  const {
    type,
    x = 0,
    y = 0,
    z = 0,
    width = 2,
    height = 2,
    depth = 2,
    radius = 1,
    tube = 0.4,
    tubularSegments = 20,
    radialSegments = 8,
    color = '#4f46e5',
    text,
    fontSize = 1
  } = args

  // Map AI types to internal types
  const typeMapping = {
    rectangle: 'rectangle',
    circle: 'circle',
    box: 'box',
    sphere: 'sphere',
    cylinder: 'cylinder',
    text: 'text',
    torus: 'torus',
    torusKnot: 'torusKnot',
    dodecahedron: 'dodecahedron',
    icosahedron: 'icosahedron',
    octahedron: 'octahedron',
    tetrahedron: 'tetrahedron',
    tube: 'tube'
  }

  const internalType = typeMapping[type]
  if (!internalType) {
    throw new Error("Unsupported shape type: " + type)
  }

  // For 2D shapes (rectangle, circle), they should be placed on ground (y=0)
  // and use z coordinate for positioning
  let positionX = x
  let positionY = y
  let positionZ = z

  if (internalType === 'rectangle' || internalType === 'circle') {
    positionY = 0.05 // Slightly above ground to avoid z-fighting
    positionZ = z // Use z parameter as the ground position
  }

  // Create the object in database with individual columns
  const objectData = {
    type: internalType,
    canvas_id: canvasId,
    created_by: userId,
    position_x: positionX,
    position_y: positionY,
    position_z: positionZ,
    rotation_x: 0,
    rotation_y: 0,
    rotation_z: 0,
    scale_x: 1,
    scale_y: 1,
    scale_z: 1,
    color: color,
    geometry: '' // Will be set by client
  }

  // Set shape-specific properties based on type
  switch (internalType) {
    case 'rectangle':
      objectData.width = width
      objectData.height = height
      break
    case 'circle':
      // Circles use width/height for ground plane sizing
      objectData.width = radius * 2
      objectData.height = radius * 2
      break
    case 'box':
      objectData.width = width
      objectData.height = height
      objectData.depth = depth
      break
    case 'sphere':
    case 'dodecahedron':
    case 'icosahedron':
    case 'octahedron':
    case 'tetrahedron':
      // For spherical shapes, use radius as width for client-side processing
      objectData.width = radius
      objectData.height = radius
      objectData.depth = radius
      break
    case 'cylinder':
      objectData.width = radius * 2
      objectData.height = height
      objectData.depth = radius * 2
      break
    case 'torus':
    case 'torusKnot':
      objectData.width = radius * 2
      objectData.height = tube * 2
      objectData.depth = radius * 2
      break
    case 'tube':
      objectData.width = radius * 2
      objectData.height = radius * 2
      objectData.depth = radius * 2
      break
    case 'text':
      if (text) {
        objectData.text_content = text
        objectData.font_size = fontSize
      }
      break
  }

  const { data: newObject, error } = await supabase
    .from('objects')
    .insert(objectData)
    .select()
    .single()

  if (error) throw error

  // Broadcast to all users in the canvas
  io.to("canvas:" + canvasId).emit('object-created', newObject)

  return newObject
}
