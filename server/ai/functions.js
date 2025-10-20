import OpenAI from 'openai'
import path from 'path'
import dotenv from 'dotenv'
import { supabase } from '../core/database.js'
import { executeCanvasFunction } from './canvas-operations.js'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') })

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// AI Canvas Agent Functions
export const aiFunctions = {
  createShape: {
    name: 'createShape',
    description: 'Create a new shape on the canvas. 2D shapes (rectangle, circle) are placed on the ground plane. 3D shapes are positioned in 3D space.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['rectangle', 'circle', 'box', 'sphere', 'cylinder', 'text', 'torus', 'torusKnot', 'dodecahedron', 'icosahedron', 'octahedron', 'tetrahedron', 'tube'],
          description: 'The type of shape to create'
        },
        x: {
          type: 'number',
          description: 'X coordinate (horizontal position, 0 is center of canvas)'
        },
        y: {
          type: 'number',
          description: 'Y coordinate (height above ground for 3D shapes, ignored for 2D shapes)'
        },
        z: {
          type: 'number',
          description: 'Z coordinate (depth position for 3D shapes, or ground position for 2D shapes)'
        },
        width: {
          type: 'number',
          description: 'Width of the shape (for rectangles, boxes)'
        },
        height: {
          type: 'number',
          description: 'Height of the shape (for rectangles, boxes)'
        },
        depth: {
          type: 'number',
          description: 'Depth of the shape (for boxes)'
        },
        radius: {
          type: 'number',
          description: 'Radius of the shape (for circles, spheres, cylinders, platonic solids)'
        },
        tube: {
          type: 'number',
          description: 'Tube radius (for torus, torusKnot shapes)'
        },
        tubularSegments: {
          type: 'number',
          description: 'Number of segments along the tube path (for tube shapes)'
        },
        radialSegments: {
          type: 'number',
          description: 'Number of radial segments (for tube shapes)'
        },
        color: {
          type: 'string',
          description: 'Color of the shape (hex code like #ff0000 or #4f46e5)'
        },
        text: {
          type: 'string',
          description: 'Text content (for text shapes only)'
        },
        fontSize: {
          type: 'number',
          description: 'Font size for text (default 12)'
        },
        rotation_x: {
          type: 'number',
          description: 'X rotation in radians (text by default is standing straight up along x-axis, use 3*Math.PI/2 to lie flat)'
        },
        rotation_y: {
          type: 'number',
          description: 'Y rotation in radians'
        },
        rotation_z: {
          type: 'number',
          description: 'Z rotation in radians'
        }
      },
      required: ['type']
    }
  },

  moveShape: {
    name: 'moveShape',
    description: 'Move an existing shape to a new position. For 2D shapes, only x,z coordinates matter. For 3D shapes, use x,y,z coordinates.',
    parameters: {
      type: 'object',
      properties: {
        shapeId: {
          type: 'string',
          description: 'ID of the shape to move'
        },
        x: {
          type: 'number',
          description: 'New X coordinate (horizontal position, 0 is center)'
        },
        y: {
          type: 'number',
          description: 'New Y coordinate (height above ground, 0 = ground level)'
        },
        z: {
          type: 'number',
          description: 'New Z coordinate (depth position, 0 is center)'
        },
        shapeDescription: {
          type: 'string',
          description: 'Description of the shape to move (e.g., "red rectangle", "blue circle") - alternative to shapeId'
        }
      },
      required: []
    }
  },

  resizeShape: {
    name: 'resizeShape',
    description: 'Resize an existing shape. You can specify absolute sizes (width/height/depth) OR scaling factors (scale/scaleX/scaleY/scaleZ). Scaling factors multiply current dimensions.',
    parameters: {
      type: 'object',
      properties: {
        shapeId: {
          type: 'string',
          description: 'ID of the shape to resize'
        },
        width: {
          type: 'number',
          description: 'New absolute width'
        },
        height: {
          type: 'number',
          description: 'New absolute height'
        },
        depth: {
          type: 'number',
          description: 'New absolute depth (for 3D shapes like boxes, cylinders, text)'
        },
        scale: {
          type: 'number',
          description: 'Scale factor to resize all dimensions proportionally'
        },
        scaleX: {
          type: 'number',
          description: 'Scale factor for width only (multiplies current width)'
        },
        scaleY: {
          type: 'number',
          description: 'Scale factor for height only (multiplies current height)'
        },
        scaleZ: {
          type: 'number',
          description: 'Scale factor for depth only (multiplies current depth)'
        },
        shapeDescription: {
          type: 'string',
          description: 'Description of the shape to resize (e.g., "red rectangle", "blue circle") - alternative to shapeId'
        }
      },
      required: []
    }
  },

  rotateShape: {
    name: 'rotateShape',
    description: 'Rotate an existing shape',
    parameters: {
      type: 'object',
      properties: {
        shapeId: {
          type: 'string',
          description: 'ID of the shape to rotate'
        },
        degrees: {
          type: 'number',
          description: 'Rotation angle in degrees'
        },
        shapeDescription: {
          type: 'string',
          description: 'Description of the shape to rotate (e.g., "red rectangle", "blue circle") - alternative to shapeId'
        }
      },
      required: ['degrees']
    }
  },

  deleteShape: {
    name: 'deleteShape',
    description: 'Delete an existing shape',
    parameters: {
      type: 'object',
      properties: {
        shapeId: {
          type: 'string',
          description: 'ID of the shape to delete'
        },
        shapeDescription: {
          type: 'string',
          description: 'Description of the shape to delete (e.g., "red rectangle", "blue circle") - alternative to shapeId'
        }
      },
      required: []
    }
  },

  getCanvasState: {
    name: 'getCanvasState',
    description: 'Get current state of the canvas including all shapes',
    parameters: {
      type: 'object',
      properties: {}
    }
  },

  arrangeShapes: {
    name: 'arrangeShapes',
    description: 'Arrange multiple shapes in a layout pattern',
    parameters: {
      type: 'object',
      properties: {
        shapeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of shape IDs to arrange'
        },
        layout: {
          type: 'string',
          enum: ['horizontal', 'vertical', 'grid'],
          description: 'Layout arrangement type'
        },
        spacing: {
          type: 'number',
          description: 'Spacing between shapes',
          default: 50
        },
        startX: {
          type: 'number',
          description: 'Starting X position for arrangement'
        },
        startY: {
          type: 'number',
          description: 'Starting Y position for arrangement'
        },
        columns: {
          type: 'number',
          description: 'Number of columns for grid layout'
        },
        shapeDescription: {
          type: 'string',
          description: 'Description of shapes to arrange (e.g., "all rectangles", "red shapes") - alternative to shapeIds'
        }
      },
      required: ['layout']
    }
  },

  createGrid: {
    name: 'createGrid',
    description: 'Create a grid of shapes',
    parameters: {
      type: 'object',
      properties: {
        shapeType: {
          type: 'string',
          enum: ['rectangle', 'circle', 'box', 'sphere'],
          description: 'Type of shapes to create in the grid'
        },
        rows: {
          type: 'number',
          description: 'Number of rows'
        },
        columns: {
          type: 'number',
          description: 'Number of columns'
        },
        startX: {
          type: 'number',
          description: 'Starting X position'
        },
        startY: {
          type: 'number',
          description: 'Starting Y position'
        },
        startZ: {
          type: 'number',
          description: 'Starting Z position'
        },
        spacing: {
          type: 'number',
          description: 'Spacing between shapes'
        },
        size: {
          type: 'number',
          description: 'Size of each shape'
        },
        color: {
          type: 'string',
          description: 'Color of the shapes'
        }
      },
      required: ['shapeType', 'rows', 'columns']
    }
  },

  moveToPosition: {
    name: 'moveToPosition',
    description: 'Move one or more shapes to a named position like center, top-left, bottom-right, etc. Use descriptions like "all red spheres" to move multiple shapes.',
    parameters: {
      type: 'object',
      properties: {
        shapeDescription: {
          type: 'string',
          description: 'Description of the shape(s) to move (can include "all" for multiple shapes)'
        },
        position: {
          type: 'string',
          enum: ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center', 'left-center', 'right-center'],
          description: 'Named position to move the shape(s) to'
        },
        height: {
          type: 'number',
          description: 'Height above ground (for 3D shapes, default 0 for center, 5 for others)'
        }
      },
      required: ['position']
    }
  },

  booleanSubtract: {
    name: 'booleanSubtract',
    description: 'Perform a boolean subtract operation: cut one shape (cutting object) from another shape (target). The cutting object is removed after the operation. Use this to create holes, engrave text, or cut shapes.',
    parameters: {
      type: 'object',
      properties: {
        cuttingShapeDescription: {
          type: 'string',
          description: 'Description of the shape to use as the cutting tool (will be removed after operation)'
        },
        targetShapeDescription: {
          type: 'string',
          description: 'Description of the shape to cut into (the base shape that will have the hole/engraving)'
        },
        cuttingShapeId: {
          type: 'string',
          description: 'ID of the cutting shape (alternative to cuttingShapeDescription)'
        },
        targetShapeId: {
          type: 'string',
          description: 'ID of the target shape (alternative to targetShapeDescription)'
        }
      },
      required: []
    }
  },

  // booleanUnion: {
  //   name: 'booleanUnion',
  //   description: 'Combine two shapes into one using boolean union. Both shapes become one merged shape.',
  //   parameters: {
  //     type: 'object',
  //     properties: {
  //       shape1Description: {
  //         type: 'string',
  //         description: 'Description of the first shape to combine'
  //       },
  //       shape2Description: {
  //         type: 'string',
  //         description: 'Description of the second shape to combine'
  //       },
  //       shape1Id: {
  //         type: 'string',
  //         description: 'ID of the first shape (alternative to shape1Description)'
  //       },
  //       shape2Id: {
  //         type: 'string',
  //         description: 'ID of the second shape (alternative to shape2Description)'
  //       }
  //     },
  //     required: []
  //   }
  // },

  // booleanIntersect: {
  //   name: 'booleanIntersect',
  //   description: 'Create a new shape from the intersection of two shapes (the overlapping volume).',
  //   parameters: {
  //     type: 'object',
  //     properties: {
  //       shape1Description: {
  //         type: 'string',
  //         description: 'Description of the first shape'
  //       },
  //       shape2Description: {
  //         type: 'string',
  //         description: 'Description of the second shape'
  //       },
  //       shape1Id: {
  //         type: 'string',
  //         description: 'ID of the first shape (alternative to shape1Description)'
  //       },
  //       shape2Id: {
  //         type: 'string',
  //         description: 'ID of the second shape (alternative to shape2Description)'
  //       }
  //     },
  //     required: []
  //   }
  // }
}

// AI Canvas Agent API endpoint
export function setupAIChatEndpoint(app, io) {
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { message, conversationHistory, canvasId, userId } = req.body

      if (!message || !canvasId || !userId) {
        return res.status(400).json({ error: 'Missing required fields: message, canvasId, userId' })
      }

      // Get canvas state for context
      const { data: objects } = await supabase
        .from('objects')
        .select('*')
        .eq('canvas_id', canvasId)

      // Extract text for inscription requests
      let requestedText = "HELLO" // default
      const inscriptionKeywords = ["inscribe", "engrave", "carve", "cut into"]
      const hasInscription = inscriptionKeywords.some(keyword => message.toLowerCase().includes(keyword))

      if (hasInscription) {
        // Extract text for inscription - look for quoted text in inscription commands
        const quotedMatch = message.match(/(?:inscribe|engrave|carve).*?["']([^"']+)["']/i)
        if (quotedMatch) {
          requestedText = quotedMatch[1]
        } else {
          // Fallback: any quoted text in the message
          const anyQuoted = message.match(/["']([^"']+)["']/)
          if (anyQuoted) {
            requestedText = anyQuoted[1]
          }
        }
      }

      const canvasContext = objects ? objects.map(obj => {
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

      // Create system prompt with canvas context
      const systemPrompt = `You are an AI Canvas Agent that builds complex 2D layouts and 3D objects using shape creation and boolean operations. You have access to comprehensive canvas manipulation functions.

For inscription requests, the requested text is: "${requestedText}"

CANVAS SYSTEM:
- 50x50 unit canvas (-25 to +25 in X/Z)
- For 2D layouts: use XY plane (y=0.05 for shapes, y=1 for text)
- Text rotation: no rotation means text is straight up and down along x axis
- Font sizes: 1 font size per unit for readability in 50x50 space

AVAILABLE FUNCTIONS:
SHAPE CREATION: createShape (box, sphere, cylinder, torus, text, etc.)
MOVEMENT: moveShape, moveToPosition (center, corners, etc.)
MODIFICATION: resizeShape (supports scaleX/scaleY/scaleZ for individual axis scaling), rotateShape, deleteShape
BOOLEAN OPERATIONS: booleanSubtract (cut holes)
LAYOUT: arrangeShapes (horizontal/vertical/grid), createGrid
INFO: getCanvasState (current shapes)

TEXT INSCRIPTION WORKFLOW:
IMPORTANT: When ANY request mentions "inscribe", "engrave", "carve", "cut into", or similar words:
1. ALWAYS createShape for the base object first
2. ALWAYS createShape for the text
3. ALWAYS resizeShape the text to be smaller (scale=0.5) and deeper (depth=0.3)
4. ALWAYS moveShape the text to intersect with the base object
5. ALWAYS booleanSubtract the text from the base object

RESIZE EXAMPLES:
- resizeShape(shapeDescription="text", scaleX=2)  // Double width only
- resizeShape(shapeDescription="box", scaleY=0.5)  // Half height only
- resizeShape(shapeDescription="cylinder", scaleZ=10)  // 10x depth scaling
- resizeShape(shapeDescription="sphere", scale=1.5)  // Scale all dimensions 1.5x proportionally

NOTE: scaleX/scaleY/scaleZ multiply the current dimension. Use scaleZ=10 to make depth 10 times larger!

Example: "inscribe 'HELLO' in a cube" MUST call all 5 functions above in sequence.

CREATING OBJECTS WITH HOLES/CUTS:
For objects with holes or cutouts, opt for overlapping obejects and boolean subtract

WORKFLOW FOR COMPLEX OBJECTS:
1. Break down the request into primitive shapes
2. Create all needed shapes with proper positioning
3. Use boolean operations to combine/cut as needed
4. Clean up by deleting temporary cutting shapes

INTELLIGENT 2D LAYOUTS:
FORMS: Group input fields vertically, labels left of inputs, buttons at bottom
- Background: large rectangle container
- Inputs: smaller rectangles with light colors
- Labels: text positioned near inputs
- Buttons: colored rectangles with centered text
- Space elements 2-3 units apart logically
- Text: DEFAULT Y/Z rotation with x rotation by 3*Math.PI/2 to lie flat
- AVOID stacking text directly on top of each other on the xy plane when generating more 2d-like requests

POSTERS/LAYOUTS: Use visual hierarchy - titles at top, content below, balanced spacing

COLOR PATTERNS:
- Backgrounds: white/gray (#ffffff, #f8f9fa)
- Input fields: light gray (#f0f0f0, #e9ecef)
- Buttons: blue/purple (#4f46e5, #007bff)
- Text: black/dark gray (#000000, #333333)

POSITIONING RULES:
- Position coordinates (x, y, z) refer to the CENTER/MIDPOINT of each shape
- Center layouts around x=0, use z-depth for layering
- Text always at y=1, rotated flat for 2D layouts
- Group related elements, maintain visual balance
- When creating forms/layouts, calculate positions so the center of each element aligns with the intended layout position
- Width/depth of shapes are in units of 1 (50x50 canvas), same for position coordinates

Current canvas (${canvasContext.length} shapes):
${canvasContext.map(shape =>
  `- ${shape.type} at (${Math.round(shape.position.x)}, ${Math.round(shape.position.y)}, ${Math.round(shape.position.z)}) - ID: ${shape.id}${shape.color ? ` - Color: ${shape.color}` : ""}${shape.properties?.text ? ` - Text: "${shape.properties.text}"` : ""}`
).join("\n")}

For complex requests, analyze the pattern and use MULTIPLE function calls in sequence. Apply logical spacing, appropriate colors, and flat text rotation for 2D layouts. Use boolean operations for complex 3D objects.

CRITICAL: For inscription requests, you MUST make multiple function calls in sequence:

1. First create the base shape (cube/box) at position (0,0,0)
2. Then create the text shape at position (0,0,0) - text will be positioned at y=0 for proper 3D intersection
3. Then resize the text to be smaller (scale=0.5) and add depth (depth=0.3) for engraving
4. Then move the text to (0,0,0) to ensure it intersects with the base shape
5. Finally use booleanSubtract to cut the text shape from the base shape

EXAMPLE FUNCTION CALLS for "inscribe HELLO in a box":
- createShape(type="box", x=0, y=0, z=0, width=4, height=4, depth=4)
- createShape(type="text", text="HELLO", x=0, y=0, z=0, fontSize=1)
- resizeShape(shapeDescription="HELLO", scale=0.5, depth=0.3)
- moveShape(shapeDescription="HELLO", x=0, y=0, z=0)
- booleanSubtract(cuttingShapeDescription="HELLO", targetShapeDescription="box")

IMPORTANT: Always use the EXACT text from the user's request as the shapeDescription for the text-related functions.`

      // Build messages array with conversation history
      const messages = [
        { role: 'system', content: systemPrompt }
      ];

      // Add conversation history if available (includes the current user message)
      if (conversationHistory && Array.isArray(conversationHistory)) {
        messages.push(...conversationHistory);
      } else {
        // Fallback: if no conversation history, add current message
        messages.push({ role: 'user', content: message });
      }

      // Call OpenAI with tools API (enables multiple parallel tool calls)
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
        tools: Object.values(aiFunctions).map(func => ({
          type: 'function',
          function: func
        })),
        tool_choice: 'auto', // Allow multiple tool calls
        max_completion_tokens: 64000,
        temperature: 1
      })

      const response = completion.choices[0].message


      // Process tool calls (modern API supports multiple parallel calls)
      const actions = []
      let responseMessage = response.content || 'I\'ve processed your request.'

      // Handle tool calls (modern API) or fallback to function calls (legacy API)
      const calls = response.tool_calls || []

      // Fallback for legacy function_call API
      if (!calls.length && response.function_call) {
        calls.push({ function: response.function_call })
      }

      for (const call of calls) {
        const functionName = call.function.name
        const functionArgs = JSON.parse(call.function.arguments || '{}')

        console.log("AI Tool Call:", functionName, functionArgs)

        try {
        // Execute the canvas function
        const result = await executeCanvasFunction(functionName, functionArgs, canvasId, userId, io)

          // Add successful actions to the response
          if (result.actions) {
            actions.push(...result.actions)
          }

          // Update response message if provided
          if (result.message) {
            responseMessage = result.message
          }

        } catch (error) {
          console.error('Error executing canvas function:', error)
          responseMessage = "I encountered an error while executing your request: " + error.message
        }
      }

      res.json({
        message: responseMessage,
        actions: actions
      })

    } catch (error) {
      console.error('AI Chat API Error:', error)
      res.status(500).json({
        error: 'Internal server error',
        message: 'Sorry, I encountered an error processing your request.'
      })
    }
  })
}
