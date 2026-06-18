// ==========================================================================
// LIGHT RAYS - WebGL Background para la sección #inicio
// Adaptado de LightRays.jsx a Vanilla JS puro (sin React, sin OGL)
// ==========================================================================

(function () {

  // --- Utilidades ---
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m
      ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
      : [1, 1, 1];
  }

  function getAnchorAndDir(origin, w, h) {
    const outside = 0.2;
    switch (origin) {
      case 'top-left':    return { anchor: [0, -outside * h],           dir: [0,  1] };
      case 'top-right':   return { anchor: [w, -outside * h],           dir: [0,  1] };
      case 'left':        return { anchor: [-outside * w, 0.5 * h],     dir: [1,  0] };
      case 'right':       return { anchor: [(1 + outside) * w, 0.5 * h],dir: [-1, 0] };
      case 'bottom-left': return { anchor: [0, (1 + outside) * h],      dir: [0, -1] };
      case 'bottom-center':return{anchor: [0.5 * w, (1 + outside) * h], dir: [0, -1] };
      case 'bottom-right':return { anchor: [w, (1 + outside) * h],      dir: [0, -1] };
      default:            return { anchor: [0.5 * w, -outside * h],     dir: [0,  1] }; // top-center
    }
  }

  // --- Shaders ---
  const VERT_SRC = `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const FRAG_SRC = `
    precision highp float;

    uniform float iTime;
    uniform vec2  iResolution;
    uniform vec2  rayPos;
    uniform vec2  rayDir;
    uniform vec3  raysColor;
    uniform float raysSpeed;
    uniform float lightSpread;
    uniform float rayLength;
    uniform float pulsating;
    uniform float fadeDistance;
    uniform float saturation;
    uniform vec2  mousePos;
    uniform float mouseInfluence;
    uniform float noiseAmount;
    uniform float distortion;

    float noise(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,
                      float seedA, float seedB, float speed) {
      vec2  sourceToCoord = coord - raySource;
      vec2  dirNorm       = normalize(sourceToCoord);
      float cosAngle      = dot(dirNorm, rayRefDirection);

      float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;
      float spreadFactor   = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));

      float distance     = length(sourceToCoord);
      float maxDistance  = iResolution.x * rayLength;
      float lengthFalloff= clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);
      float fadeFalloff  = clamp((iResolution.x * fadeDistance - distance) / (iResolution.x * fadeDistance), 0.5, 1.0);
      float pulse        = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;

      float baseStrength = clamp(
        (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
        (0.3  + 0.2  * cos(-distortedAngle * seedB + iTime * speed)),
        0.0, 1.0
      );

      return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
    }

    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);

      vec2 finalRayDir = rayDir;
      if (mouseInfluence > 0.0) {
        vec2 mouseScreenPos = mousePos * iResolution.xy;
        vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
        finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
      }

      vec4 rays1 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
      vec4 rays2 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234,  1.1 * raysSpeed);

      fragColor = rays1 * 0.85 + rays2 * 0.75;

      if (noiseAmount > 0.0) {
        float n = noise(coord * 0.01 + iTime * 0.1);
        fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);
      }

      float brightness = 1.0 - (coord.y / iResolution.y) * 0.5;
      fragColor.x *= 0.5 + brightness * 1.2;
      fragColor.y *= 0.6 + brightness * 1.0;
      fragColor.z *= 0.1 + brightness * 0.2;

      if (saturation != 1.0) {
        float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
        fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
      }

      fragColor.rgb *= raysColor;
    }

    void main() {
      vec4 color;
      mainImage(color, gl_FragCoord.xy);
      gl_FragColor = color;
    }
  `;

  // --- Crear y compilar shader ---
  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vertSrc, fragSrc) {
    const vert = createShader(gl, gl.VERTEX_SHADER, vertSrc);
    const frag = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  // --- Inicialización principal ---
  function initLightRays(container, options) {
    options = Object.assign({
      raysOrigin:     'top-center',
      raysColor:      '#EAB308',  // dorado amarillo, igual que tu CSS
      raysSpeed:      1.0,
      lightSpread:    1.2,
      rayLength:      2.0,
      pulsating:      true,
      fadeDistance:   1.0,
      saturation:     1.0,
      followMouse:    true,
      mouseInfluence: 0.08,
      noiseAmount:    0.0,
      distortion:     0.0,
    }, options);

    // Crear canvas
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    container.appendChild(canvas);

    // Contexto WebGL
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      console.warn('WebGL no disponible en este navegador.');
      canvas.remove();
      return null;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive blending: acumula luz sobre el fondo oscuro

    // Programa
    const program = createProgram(gl, VERT_SRC, FRAG_SRC);
    if (!program) { canvas.remove(); return null; }

    // Geometría: triángulo que cubre toda la pantalla
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Ubicaciones de uniforms
    const U = {};
    [
      'iTime','iResolution','rayPos','rayDir','raysColor',
      'raysSpeed','lightSpread','rayLength','pulsating',
      'fadeDistance','saturation','mousePos','mouseInfluence',
      'noiseAmount','distortion'
    ].forEach(name => { U[name] = gl.getUniformLocation(program, name); });

    // Estado de ratón
    let mouse   = { x: 0.5, y: 0.5 };
    let smoothM = { x: 0.5, y: 0.5 };

    function onMouseMove(e) {
      const rect = container.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) / rect.width;
      mouse.y = (e.clientY - rect.top)  / rect.height;
    }
    if (options.followMouse) {
      window.addEventListener('mousemove', onMouseMove);
    }

    // Resize
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    // Color inicial
    const color = hexToRgb(options.raysColor);

    // Loop de animación
    let animId;
    function loop(t) {
      animId = requestAnimationFrame(loop);

      const time = t * 0.001;
      const w    = canvas.width;
      const h    = canvas.height;

      // Suavizar ratón
      const sm = 0.92;
      smoothM.x = smoothM.x * sm + mouse.x * (1 - sm);
      smoothM.y = smoothM.y * sm + mouse.y * (1 - sm);

      const { anchor, dir } = getAnchorAndDir(options.raysOrigin, w, h);

      gl.useProgram(program);
      gl.uniform1f(U.iTime,          time);
      gl.uniform2f(U.iResolution,    w, h);
      gl.uniform2f(U.rayPos,         anchor[0], anchor[1]);
      gl.uniform2f(U.rayDir,         dir[0],    dir[1]);
      gl.uniform3f(U.raysColor,      color[0],  color[1], color[2]);
      gl.uniform1f(U.raysSpeed,      options.raysSpeed);
      gl.uniform1f(U.lightSpread,    options.lightSpread);
      gl.uniform1f(U.rayLength,      options.rayLength);
      gl.uniform1f(U.pulsating,      options.pulsating ? 1.0 : 0.0);
      gl.uniform1f(U.fadeDistance,   options.fadeDistance);
      gl.uniform1f(U.saturation,     options.saturation);
      gl.uniform2f(U.mousePos,       smoothM.x, smoothM.y);
      gl.uniform1f(U.mouseInfluence, options.mouseInfluence);
      gl.uniform1f(U.noiseAmount,    options.noiseAmount);
      gl.uniform1f(U.distortion,     options.distortion);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    animId = requestAnimationFrame(loop);

    // Cleanup (por si necesitas destruirlo)
    return function destroy() {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.remove();
    };
  }

  // --- Arrancar cuando el DOM esté listo ---
  function start() {
    // El canvas WebGL va dentro de .light-rays-container que ya existe en tu HTML
    const container = document.querySelector('.light-rays-container');
    if (!container) {
      console.warn('No se encontró .light-rays-container en el DOM.');
      return;
    }

    // Asegurar que el contenedor tenga position relative/absolute para que el canvas se posicione bien
    const pos = getComputedStyle(container).position;
    if (pos === 'static') container.style.position = 'relative';

    // Quitar la atmósfera CSS porque ahora la reemplaza WebGL
    const oldAtm = container.querySelector('.light-rays-atmosphere');
    if (oldAtm) oldAtm.style.display = 'none';

    initLightRays(container, {
      raysOrigin:     'top-center',
      raysColor:      '#927b17',   // dorado más brillante
      raysSpeed:      1.0,
      lightSpread:    2.5,         // rayos más abiertos
      rayLength:      10.0,         // rayos más largos
      pulsating:      true,
      fadeDistance:   2.0,         // se desvanecen más lejos
      saturation:     1.5,
      followMouse:    true,
      mouseInfluence: 0.08,
      noiseAmount:    0.0,
      distortion:     0.15,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();