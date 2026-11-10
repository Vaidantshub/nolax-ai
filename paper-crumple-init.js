// Reusable Three.js PaperCrumple loader for vanilla and multi-page web app
(function initPaperCrumpleGlobal() {
  function loadThree(callback) {
    if (window.THREE) {
      callback(window.THREE);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
    script.onload = () => callback(window.THREE);
    document.head.appendChild(script);
  }

  function mountPaperCrumple(container, THREE) {
    const src = container.getAttribute('data-src') || 'assets/nolax-audit-report.svg';
    const paperWidth = parseInt(container.getAttribute('data-width')) || 320;
    const paperHeight = parseInt(container.getAttribute('data-height')) || 400;
    const aspect = paperHeight / paperWidth;

    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.userSelect = 'none';

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const hit = document.createElement('div');
    hit.style.position = 'absolute';
    hit.style.top = '0';
    hit.style.left = '0';
    hit.style.width = '100%';
    hit.style.height = '100%';
    hit.style.cursor = 'grab';
    hit.style.zIndex = '10';
    container.appendChild(hit);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch (e) {
      console.warn("WebGL not available for PaperCrumple", e);
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 5000);
    camera.position.z = 600;

    const ambient = new THREE.HemisphereLight(0xffffff, 0xa4a0b0, 1.4);
    scene.add(ambient);

    const light = new THREE.DirectionalLight(0xfffaf0, 1.8);
    light.position.set(-150, 250, 400);
    light.castShadow = true;
    scene.add(light);

    // Plane Geometry with resolution for crumpling folds
    const geometry = new THREE.PlaneGeometry(paperWidth, paperHeight, 24, 30);
    const posAttr = geometry.attributes.position;
    const originalPositions = posAttr.array.slice();

    const loader = new THREE.TextureLoader();
    loader.load(src, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      let isHeld = false;
      let crumpleAmount = 0;
      let targetCrumple = 0;
      let mouseX = 0, mouseY = 0;
      let targetRotX = 0, targetRotY = 0;

      function updateCrumple(dt) {
        crumpleAmount += (targetCrumple - crumpleAmount) * 0.15;
        const arr = posAttr.array;

        for (let i = 0; i < arr.length; i += 3) {
          const origX = originalPositions[i];
          const origY = originalPositions[i + 1];

          // Noise folds
          const foldNoise = Math.sin(origX * 0.05 + origY * 0.04) * Math.cos(origY * 0.08);
          const compress = 1 - crumpleAmount * 0.55;

          arr[i] = origX * compress + Math.sin(origY * 0.08) * crumpleAmount * 35;
          arr[i + 1] = origY * compress + Math.cos(origX * 0.08) * crumpleAmount * 35;
          arr[i + 2] = foldNoise * crumpleAmount * 85;
        }
        posAttr.needsUpdate = true;
        geometry.computeVertexNormals();

        mesh.rotation.x += (targetRotX - mesh.rotation.x) * 0.1;
        mesh.rotation.y += (targetRotY - mesh.rotation.y) * 0.1;
      }

      function resize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }
      window.addEventListener('resize', resize);
      resize();

      hit.addEventListener('pointerdown', (e) => {
        isHeld = true;
        targetCrumple = 0.85;
        hit.style.cursor = 'grabbing';
      });

      window.addEventListener('pointerup', () => {
        if (isHeld) {
          isHeld = false;
          targetCrumple = 0.08; // Leaves realistic subtle crease
          hit.style.cursor = 'grab';
          targetRotX = 0;
          targetRotY = 0;
        }
      });

      hit.addEventListener('pointermove', (e) => {
        if (isHeld) {
          const rect = container.getBoundingClientRect();
          const normX = (e.clientX - rect.left) / rect.width - 0.5;
          const normY = (e.clientY - rect.top) / rect.height - 0.5;
          targetRotY = normX * 0.8;
          targetRotX = -normY * 0.8;
        }
      });

      let isVisible = true;
      const obs = new IntersectionObserver((entries) => {
        isVisible = entries[0].isIntersecting;
      }, { threshold: 0.05 });
      obs.observe(container);

      let running = true;
      function animate() {
        if (!running) return;
        if (isVisible) {
          updateCrumple(0.016);
          renderer.render(scene, camera);
        }
        requestAnimationFrame(animate);
      }
      requestAnimationFrame(animate);
    });
  }

  function initAll() {
    loadThree((THREE) => {
      document.querySelectorAll('[data-paper-crumple]').forEach(el => {
        if (!el.getAttribute('data-paper-mounted')) {
          el.setAttribute('data-paper-mounted', 'true');
          mountPaperCrumple(el, THREE);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();

