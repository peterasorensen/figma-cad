import * as THREE from 'three';

/**
 * Utility functions for STL file import/export
 */

/**
 * Export shapes to STL format
 * @param {Array} shapes - Array of Shape objects to export
 * @param {string} filename - Output filename (without extension)
 * @param {boolean} centerGeometry - Whether to center the geometry at origin (default: true)
 */
export function exportToSTL(shapes, filename = 'canvas-export', centerGeometry = true) {
  if (!shapes || shapes.length === 0) {
    throw new Error('No shapes to export');
  }

  // Collect all triangles from all shapes
  const triangles = [];

  shapes.forEach(shape => {
    const meshTriangles = extractTrianglesFromMesh(shape.mesh);
    triangles.push(...meshTriangles);
  });

  if (triangles.length === 0) {
    throw new Error('No triangles found in shapes');
  }

  // Center the geometry if requested
  let finalTriangles = triangles;
  if (centerGeometry) {
    finalTriangles = centerTriangles(triangles);
  }

  // Convert to STL binary format
  const stlData = createSTLBinary(finalTriangles);

  // Create and download the file
  const blob = new Blob([stlData], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.stl`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  console.log(`Exported ${shapes.length} shapes (${triangles.length} triangles) to ${filename}.stl${centerGeometry ? ' (centered)' : ''}`);
}

/**
 * Center triangles by translating them so their center becomes the origin
 * @param {Array} triangles - Array of triangle objects
 * @returns {Array} Centered triangles
 */
function centerTriangles(triangles) {
  if (triangles.length === 0) return triangles;

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  triangles.forEach(triangle => {
    triangle.vertices.forEach(vertex => {
      minX = Math.min(minX, vertex[0]);
      minY = Math.min(minY, vertex[1]);
      minZ = Math.min(minZ, vertex[2]);
      maxX = Math.max(maxX, vertex[0]);
      maxY = Math.max(maxY, vertex[1]);
      maxZ = Math.max(maxZ, vertex[2]);
    });
  });

  // Calculate center
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  // Translate all vertices to center at origin
  const centeredTriangles = triangles.map(triangle => ({
    vertices: triangle.vertices.map(vertex => [
      vertex[0] - centerX,
      vertex[1] - centerY,
      vertex[2] - centerZ
    ]),
    normal: triangle.normal // normals don't need translation
  }));

  return centeredTriangles;
}

/**
 * Extract triangles from a Three.js mesh
 * @param {THREE.Mesh} mesh - The mesh to extract triangles from
 * @returns {Array} Array of triangle objects {vertices: [v1, v2, v3], normal: [nx, ny, nz]}
 */
function extractTrianglesFromMesh(mesh) {
  const triangles = [];
  const geometry = mesh.geometry;

  if (!geometry) return triangles;

  // Ensure we have the geometry in the right format
  geometry.computeVertexNormals();

  // Get position and normal attributes
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const indices = geometry.index;

  if (!positions) return triangles;

  // Apply mesh transformations to get world coordinates
  const matrix = mesh.matrixWorld;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);

  // Function to transform a vector by the mesh's world matrix
  const transformVector = (vector) => {
    const v = vector.clone();
    v.applyMatrix4(matrix);
    return [v.x, v.y, v.z];
  };

  // Function to transform a normal by the mesh's normal matrix
  const transformNormal = (normal) => {
    const n = normal.clone();
    n.applyMatrix3(normalMatrix);
    n.normalize();
    return [n.x, n.y, n.z];
  };

  if (indices) {
    // Indexed geometry
    for (let i = 0; i < indices.count; i += 3) {
      const a = indices.getX(i);
      const b = indices.getX(i + 1);
      const c = indices.getX(i + 2);

      const v1 = new THREE.Vector3().fromBufferAttribute(positions, a);
      const v2 = new THREE.Vector3().fromBufferAttribute(positions, b);
      const v3 = new THREE.Vector3().fromBufferAttribute(positions, c);

      // Use face normal (average of vertex normals for simplicity)
      let normal = [0, 0, 1]; // Default normal
      if (normals) {
        const n1 = new THREE.Vector3().fromBufferAttribute(normals, a);
        const n2 = new THREE.Vector3().fromBufferAttribute(normals, b);
        const n3 = new THREE.Vector3().fromBufferAttribute(normals, c);
        normal = transformNormal(n1.clone().add(n2).add(n3).divideScalar(3));
      }

      triangles.push({
        vertices: [
          transformVector(v1),
          transformVector(v2),
          transformVector(v3)
        ],
        normal: normal
      });
    }
  } else {
    // Non-indexed geometry
    for (let i = 0; i < positions.count; i += 3) {
      const v1 = new THREE.Vector3().fromBufferAttribute(positions, i);
      const v2 = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
      const v3 = new THREE.Vector3().fromBufferAttribute(positions, i + 2);

      // Use face normal (average of vertex normals for simplicity)
      let normal = [0, 0, 1]; // Default normal
      if (normals) {
        const n1 = new THREE.Vector3().fromBufferAttribute(normals, i);
        const n2 = new THREE.Vector3().fromBufferAttribute(normals, i + 1);
        const n3 = new THREE.Vector3().fromBufferAttribute(normals, i + 2);
        normal = transformNormal(n1.clone().add(n2).add(n3).divideScalar(3));
      }

      triangles.push({
        vertices: [
          transformVector(v1),
          transformVector(v2),
          transformVector(v3)
        ],
        normal: normal
      });
    }
  }

  return triangles;
}

/**
 * Create STL binary format data from triangles
 * @param {Array} triangles - Array of triangle objects
 * @returns {ArrayBuffer} Binary STL data
 */
function createSTLBinary(triangles) {
  // STL binary format header (80 bytes)
  const header = new ArrayBuffer(80);
  const headerView = new DataView(header);
  const headerString = 'CollabCanvas STL Export';
  for (let i = 0; i < headerString.length && i < 80; i++) {
    headerView.setUint8(i, headerString.charCodeAt(i));
  }

  // Triangle count (4 bytes, little endian)
  const triangleCount = triangles.length;
  const countBuffer = new ArrayBuffer(4);
  const countView = new DataView(countBuffer);
  countView.setUint32(0, triangleCount, true); // true for little endian

  // Calculate total buffer size: header (80) + count (4) + triangles (50 bytes each)
  const totalSize = 80 + 4 + (triangleCount * 50);
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Copy header
  const headerArray = new Uint8Array(header);
  const bufferArray = new Uint8Array(buffer);
  bufferArray.set(headerArray, 0);

  // Copy triangle count
  const countArray = new Uint8Array(countBuffer);
  bufferArray.set(countArray, 80);

  // Write triangles
  let offset = 84; // header (80) + count (4)

  triangles.forEach(triangle => {
    const { vertices, normal } = triangle;

    // Normal vector (3 floats, 12 bytes)
    view.setFloat32(offset, normal[0], true);
    view.setFloat32(offset + 4, normal[1], true);
    view.setFloat32(offset + 8, normal[2], true);
    offset += 12;

    // Three vertices (9 floats, 36 bytes)
    for (let i = 0; i < 3; i++) {
      const vertex = vertices[i];
      view.setFloat32(offset, vertex[0], true);
      view.setFloat32(offset + 4, vertex[1], true);
      view.setFloat32(offset + 8, vertex[2], true);
      offset += 12;
    }

    // Attribute byte count (2 bytes, always 0)
    view.setUint16(offset, 0, true);
    offset += 2;
  });

  return buffer;
}

/**
 * Import STL file and create shapes
 * @param {File} file - STL file to import
 * @param {ShapeManager} shapeManager - Shape manager to add shapes to
 * @param {Object} position - Position to place the imported model {x, y, z}
 * @returns {Promise<Array>} Promise resolving to array of created shapes
 */
export function importFromSTL(file, shapeManager, position = { x: 0, y: 0, z: 0 }) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const buffer = event.target.result;
        const triangles = parseSTL(buffer);

        if (triangles.length === 0) {
          reject(new Error('No triangles found in STL file'));
          return;
        }

        // Create geometry from triangles
        const geometry = createGeometryFromTriangles(triangles);

        // Create shape from geometry
        const shape = shapeManager.createShape(
          'imported',
          position,
          {
            color: '#cccccc',
            width: 2,
            height: 2,
            depth: 2
          },
          null, // auto-generate ID
          null, // no transform
          geometry
        );

        console.log(`Imported STL with ${triangles.length} triangles`);
        resolve([shape]);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read STL file'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse STL file (binary or ASCII)
 * @param {ArrayBuffer} buffer - STL file data
 * @returns {Array} Array of triangle objects
 */
function parseSTL(buffer) {
  const dataView = new DataView(buffer);

  // Check if binary STL (header + triangle count)
  if (buffer.byteLength >= 84) {
    // Read header (80 bytes)
    let isBinary = false;
    for (let i = 0; i < 80 && i < buffer.byteLength; i++) {
      const char = dataView.getUint8(i);
      if (char < 32 || char > 126) { // Non-printable ASCII
        isBinary = true;
        break;
      }
    }

    if (isBinary) {
      return parseSTLBinary(buffer);
    }
  }

  // Try ASCII format
  const text = new TextDecoder('utf-8').decode(buffer);
  return parseSTLASCII(text);
}

/**
 * Parse binary STL format
 * @param {ArrayBuffer} buffer - Binary STL data
 * @returns {Array} Array of triangle objects
 */
function parseSTLBinary(buffer) {
  const dataView = new DataView(buffer);
  const triangles = [];

  // Skip header (80 bytes) and read triangle count (4 bytes)
  const triangleCount = dataView.getUint32(80, true); // little endian

  let offset = 84; // Start after header + count

  for (let i = 0; i < triangleCount; i++) {
    // Read normal (3 floats)
    const normal = [
      dataView.getFloat32(offset, true),
      dataView.getFloat32(offset + 4, true),
      dataView.getFloat32(offset + 8, true)
    ];
    offset += 12;

    // Read three vertices (9 floats)
    const vertices = [];
    for (let j = 0; j < 3; j++) {
      const vertex = [
        dataView.getFloat32(offset, true),
        dataView.getFloat32(offset + 4, true),
        dataView.getFloat32(offset + 8, true)
      ];
      vertices.push(vertex);
      offset += 12;
    }

    // Skip attribute byte count (2 bytes)
    offset += 2;

    triangles.push({ vertices, normal });
  }

  return triangles;
}

/**
 * Parse ASCII STL format
 * @param {string} text - ASCII STL text
 * @returns {Array} Array of triangle objects
 */
function parseSTLASCII(text) {
  const triangles = [];
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('facet normal')) {
      // Parse normal
      const normalMatch = line.match(/facet normal\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
      if (!normalMatch) {
        i++;
        continue;
      }

      const normal = [
        parseFloat(normalMatch[1]),
        parseFloat(normalMatch[2]),
        parseFloat(normalMatch[3])
      ];

      // Skip to outer loop
      while (i < lines.length && !lines[i].trim().startsWith('outer loop')) {
        i++;
      }
      i++; // Skip outer loop line

      // Parse three vertices
      const vertices = [];
      for (let j = 0; j < 3; j++) {
        while (i < lines.length && !lines[i].trim().startsWith('vertex')) {
          i++;
        }

        if (i >= lines.length) break;

        const vertexMatch = lines[i].trim().match(/vertex\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
        if (vertexMatch) {
          vertices.push([
            parseFloat(vertexMatch[1]),
            parseFloat(vertexMatch[2]),
            parseFloat(vertexMatch[3])
          ]);
        }
        i++;
      }

      // Skip to end of facet
      while (i < lines.length && !lines[i].trim().startsWith('endfacet')) {
        i++;
      }
      i++; // Skip endfacet line

      if (vertices.length === 3) {
        triangles.push({ vertices, normal });
      }
    } else {
      i++;
    }
  }

  return triangles;
}

/**
 * Create Three.js geometry from triangles
 * @param {Array} triangles - Array of triangle objects
 * @returns {THREE.BufferGeometry} Three.js geometry
 */
function createGeometryFromTriangles(triangles) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];

  triangles.forEach(triangle => {
    const { vertices, normal } = triangle;

    // Add three vertices
    vertices.forEach(vertex => {
      positions.push(vertex[0], vertex[1], vertex[2]);
      normals.push(normal[0], normal[1], normal[2]);
    });
  });

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}
