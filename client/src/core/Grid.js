import * as THREE from 'three';

/**
 * Grid and coordinate system visualization
 * Provides visual reference for the 3D space
 */
export class Grid {
  constructor(scene) {
    this.scene = scene;
    this.gridHelper = null;
    this.axesHelper = null;

    this.init();
  }

  init() {
    // Create grid helper (size, divisions)
    this.gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
    this.gridHelper.position.y = 0;
    this.scene.add(this.gridHelper);

    // Create axes helper (size)
    this.axesHelper = new THREE.AxesHelper(5);
    this.scene.add(this.axesHelper);

    // Add a ground plane for shadows (invisible but receives shadows)
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.ShadowMaterial({
      opacity: 0.3
    });
    this.groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.receiveShadow = true;
    this.scene.add(this.groundPlane);

    // Add subtle fog for depth perception
    this.scene.fog = new THREE.Fog(0x1a1a1a, 30, 80);
  }

  toggleGrid() {
    if (this.gridHelper) {
      this.gridHelper.visible = !this.gridHelper.visible;
    }
  }

  toggleAxes() {
    if (this.axesHelper) {
      this.axesHelper.visible = !this.axesHelper.visible;
    }
  }

  setGridVisibility(visible) {
    if (this.gridHelper) {
      this.gridHelper.visible = visible;
    }
  }

  setAxesVisibility(visible) {
    if (this.axesHelper) {
      this.axesHelper.visible = visible;
    }
  }

  dispose() {
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.geometry.dispose();
      this.gridHelper.material.dispose();
    }
    if (this.axesHelper) {
      this.scene.remove(this.axesHelper);
      this.axesHelper.geometry.dispose();
      this.axesHelper.material.dispose();
    }
    if (this.groundPlane) {
      this.scene.remove(this.groundPlane);
      this.groundPlane.geometry.dispose();
      this.groundPlane.material.dispose();
    }
  }
}
