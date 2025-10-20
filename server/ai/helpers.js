// Helper function to find shapes by description
export function findShapesByDescription(shapes, description) {
  if (!description) return []

  const desc = description.toLowerCase()

  // Handle "all shapes" or "all"
  if (desc.includes('all')) {
    return shapes
  }

  // Handle specific type requests like "all rectangles", "all circles"
  if (desc.startsWith('all ')) {
    const type = desc.replace('all ', '')
    return shapes.filter(shape => shape.type.toLowerCase().includes(type))
  }

  // Handle color requests like "red shapes", "blue circles"
  const colorNames = {
    'red': '#ff0000',
    'green': '#00ff00',
    'blue': '#0000ff',
    'yellow': '#ffff00',
    'magenta': '#ff00ff',
    'cyan': '#00ffff',
    'black': '#000000',
    'white': '#ffffff',
    'gray': '#808080'
  }

  let filteredShapes = shapes

  // Filter by color
  for (const [colorName, hexColor] of Object.entries(colorNames)) {
    if (desc.includes(colorName)) {
      filteredShapes = filteredShapes.filter(shape => shape.color === hexColor)
      break
    }
  }

  // Filter by type
  const shapeTypes = ['rectangle', 'circle', 'box', 'sphere', 'cylinder', 'text']
  for (const type of shapeTypes) {
    if (desc.includes(type)) {
      filteredShapes = filteredShapes.filter(shape => shape.type === type)
      break
    }
  }

  return filteredShapes
}

// Helper function to find a single shape by description
export function findShapeByDescription(shapes, description) {
  const matches = findShapesByDescription(shapes, description)
  return matches.length > 0 ? matches[0] : null
}

// Helper function to get color names
export function getColorName(hexColor) {
  const colors = {
    '#ff0000': 'red',
    '#00ff00': 'green',
    '#0000ff': 'blue',
    '#ffff00': 'yellow',
    '#ff00ff': 'magenta',
    '#00ffff': 'cyan',
    '#000000': 'black',
    '#ffffff': 'white',
    '#808080': 'gray',
    '#4f46e5': 'blue'
  }
  return colors[hexColor] || 'colored'
}
