document.addEventListener('DOMContentLoaded', () => {
  const distortDiv = document.createElement('div');
  Object.assign(distortDiv.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '9998',
    opacity: '0',
    willChange: 'mask-image, opacity'
  });
  document.body.appendChild(distortDiv);

  const canvas = document.createElement('canvas');
  canvas.className = 'fluid-canvas';
  Object.assign(canvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '9997',
    mixBlendMode: 'difference'
  });
  document.body.appendChild(canvas);

  const trail = [];
  const MAX_TRAIL = 20;
  const TRAIL_LIFETIME = 800;

  let distortIsActive = false;

  const onMoveDistort = (e) => {
    if (isMobile) return; // Hard block synthetic mouse events on mobile
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }
    trail.push({ x: clientX, y: clientY, t: Date.now() });
    if (trail.length > MAX_TRAIL) trail.shift();

    if (!distortIsActive) {
      distortIsActive = true;
      updateDistort();
    }
  };

  let distortRafId;
  const updateDistort = () => {
    const now = Date.now();
    while (trail.length > 0 && now - trail[0].t > TRAIL_LIFETIME) trail.shift();

    if (trail.length === 0) {
      distortDiv.style.opacity = '0';
      distortIsActive = false;
      return;
    }

    const gradients = trail.map((p) => {
      const age = (now - p.t) / TRAIL_LIFETIME;
      const radius = Math.max(12, 80 * (1 - age * 0.7));
      return `radial-gradient(circle ${radius}px at ${p.x}px ${p.y}px, black ${radius * 0.25}px, transparent ${radius}px)`;
    });

    const grads = gradients.join(', ');
    distortDiv.style.WebkitMaskImage = grads;
    distortDiv.style.maskImage = grads;
    distortDiv.style.WebkitMaskComposite = 'source-over';
    distortDiv.style.maskComposite = 'add';
    distortDiv.style.opacity = '1';

    distortRafId = requestAnimationFrame(updateDistort);
  };


  const onLeaveDistort = () => {
    trail.length = 0;
    distortDiv.style.opacity = '0';
  };
  window.addEventListener('mouseleave', onLeaveDistort);

  const isMobile = window.matchMedia("(max-width: 768px)").matches || window.matchMedia("(pointer: coarse)").matches;

  const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false }
  let gl = canvas.getContext('webgl2', params)
  const isWebGL2 = !!gl
  if (!gl) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params)
  if (!gl) return

  if (isWebGL2) gl.getExtension('EXT_color_buffer_float')
  else { gl.getExtension('OES_texture_half_float'); gl.getExtension('OES_texture_half_float_linear') }

  const halfFloatExt = isWebGL2 ? null : gl.getExtension('OES_texture_half_float')
  const texType = isWebGL2 ? gl.HALF_FLOAT : (halfFloatExt ? halfFloatExt.HALF_FLOAT_OES : gl.UNSIGNED_BYTE)
  const internalFormat = isWebGL2 ? gl.RGBA16F : gl.RGBA
  const formatRG = isWebGL2 ? gl.RG : gl.RGBA
  const internalRG = isWebGL2 ? gl.RG16F : gl.RGBA

  const SIM_RES = isMobile ? 32 : 64
  const DYE_RES = isMobile ? 256 : 512
  const CURSOR_RADIUS = isMobile ? 0.096 : 0.064 // Reduced by 20% globally
  const VELOCITY_FORCE = 2200      // Slightly under 2500 for better control
  const PRESSURE_ITERATIONS = isMobile ? 4 : 20   // Back to high-accuracy solving on desktop, incredibly fast on mobile
  const CURL_STRENGTH = 55         // Enough vorticity for swirls but not CHAOS
  const DENSITY_DISSIPATION = 0.92 // Faster clearing
  const VELOCITY_DISSIPATION = 0.96 // Enough for momentum but stable
  const PRESSURE_DISSIPATION = 0.4
  const DYE_AMOUNT = 0.60          // Less intensity to avoid screen filling

  const baseVS = `
      precision highp float;
      attribute vec2 aPosition;
      varying vec2 vUv;
      varying vec2 vL, vR, vT, vB;
      uniform vec2 texelSize;
      void main() {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `

  const splatFS = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTarget;
      uniform float aspectRatio;
      uniform vec3 color;
      uniform vec2 point;
      uniform float radius;
      void main() {
        vec2 p = vUv - point;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
      }
    `

  const advectionFS = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uVelocity;
      uniform sampler2D uSource;
      uniform vec2 texelSize;
      uniform float dt;
      uniform float dissipation;
      void main() {
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = dissipation * texture2D(uSource, coord);
        gl_FragColor = result;
      }
    `

  const divergenceFS = `
      precision highp float;
      varying vec2 vUv;
      varying vec2 vL, vR, vT, vB;
      uniform sampler2D uVelocity;
      void main() {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;
        gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
      }
    `

  const curlFS = `
      precision highp float;
      varying vec2 vUv;
      varying vec2 vL, vR, vT, vB;
      uniform sampler2D uVelocity;
      void main() {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
      }
    `

  const vorticityFS = `
      precision highp float;
      varying vec2 vUv;
      varying vec2 vL, vR, vT, vB;
      uniform sampler2D uVelocity;
      uniform sampler2D uCurl;
      uniform float curl;
      uniform float dt;
      void main() {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;
        vec2 vel = texture2D(uVelocity, vUv).xy;
        vel += force * dt;
        gl_FragColor = vec4(vel, 0.0, 1.0);
      }
    `

  const pressureFS = `
      precision highp float;
      varying vec2 vUv;
      varying vec2 vL, vR, vT, vB;
      uniform sampler2D uPressure;
      uniform sampler2D uDivergence;
      void main() {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uDivergence, vUv).x;
        gl_FragColor = vec4((L + R + B + T - C) * 0.25, 0.0, 0.0, 1.0);
      }
    `

  const gradSubFS = `
      precision highp float;
      varying vec2 vUv;
      varying vec2 vL, vR, vT, vB;
      uniform sampler2D uPressure;
      uniform sampler2D uVelocity;
      void main() {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 vel = texture2D(uVelocity, vUv).xy;
        vel -= vec2(R - L, T - B);
        gl_FragColor = vec4(vel, 0.0, 1.0);
      }
    `

  const clearFS = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform float value;
      void main() {
        gl_FragColor = value * texture2D(uTexture, vUv);
      }
    `

  const displayFS = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      void main() {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float intensity = length(c);
        float alpha = step(0.07, intensity);
        float rI = length(texture2D(uTexture, vUv + vec2(0.004, 0.001)).rgb);
        float gI = length(texture2D(uTexture, vUv).rgb);
        float bI = length(texture2D(uTexture, vUv - vec2(0.004, 0.001)).rgb);
        float edgeMask = smoothstep(0.04, 0.10, intensity) * (1.0 - smoothstep(0.10, 0.30, intensity));
        vec3 rainbow = vec3(
          step(0.06, rI) * 0.95,
          step(0.07, gI) * 0.9,
          step(0.06, bI) * 0.95
        );
        vec3 color = mix(vec3(1.0), rainbow, edgeMask * 0.7);
        gl_FragColor = vec4(color, alpha);
      }
    `

  function compileShader(type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(shader)); return null }
    return shader
  }

  function createProgram(vsSrc, fsSrc) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSrc)
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc)
    if (!vs || !fs) return null
    const prog = gl.createProgram()
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
    const uniforms = {}
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < count; i++) { const info = gl.getActiveUniform(prog, i); uniforms[info.name] = gl.getUniformLocation(prog, info.name) }
    return { program: prog, uniforms }
  }

  const splatProg = createProgram(baseVS, splatFS)
  const advectionProg = createProgram(baseVS, advectionFS)
  const divergenceProg = createProgram(baseVS, divergenceFS)
  const curlProg = createProgram(baseVS, curlFS)
  const vorticityProg = createProgram(baseVS, vorticityFS)
  const pressureProg = createProgram(baseVS, pressureFS)
  const gradSubProg = createProgram(baseVS, gradSubFS)
  const clearProg = createProgram(baseVS, clearFS)
  const displayProg = createProgram(baseVS, displayFS)

  const quadBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
  const indexBuf = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)

  function createFBO(w, h, intFmt, fmt, type, filter) {
    gl.activeTexture(gl.TEXTURE0)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, intFmt, w, h, 0, fmt, type, null)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.viewport(0, 0, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return { texture: tex, fbo, width: w, height: h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id } }
  }

  function createDoubleFBO(w, h, intFmt, fmt, type, filter) {
    let fbo1 = createFBO(w, h, intFmt, fmt, type, filter)
    let fbo2 = createFBO(w, h, intFmt, fmt, type, filter)
    return {
      width: w, height: h, texelSizeX: 1.0 / w, texelSizeY: 1.0 / h,
      get read() { return fbo1 }, set read(v) { fbo1 = v },
      get write() { return fbo2 }, set write(v) { fbo2 = v },
      swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t }
    }
  }

  let velocity, dye, pressure, divergenceFBO, curlFBO

  function initFBOs() {
    const w = canvas.width, h = canvas.height
    const sS = Math.max(1, Math.round(w / SIM_RES))
    const sW = Math.round(w / sS), sH = Math.round(h / sS)
    const dS = Math.max(1, Math.round(w / DYE_RES))
    const dW = Math.round(w / dS), dH = Math.round(h / dS)
    velocity = createDoubleFBO(sW, sH, internalRG, formatRG, texType, gl.LINEAR)
    dye = createDoubleFBO(dW, dH, internalFormat, gl.RGBA, texType, gl.LINEAR)
    pressure = createDoubleFBO(sW, sH, internalRG, formatRG, texType, gl.LINEAR)
    divergenceFBO = createFBO(sW, sH, internalRG, formatRG, texType, gl.NEAREST)
    curlFBO = createFBO(sW, sH, internalRG, formatRG, texType, gl.NEAREST)
  }

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; initFBOs() }
  resize()
  window.addEventListener('resize', resize)

  const mouse = { x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.5, moved: false }
  let firstMove = true;
  let lastActivityTime = Date.now();
  let glIdle = false;

  function onMouseMove(e) {
    let clientX = e.clientX;
    let clientY = e.clientY;

    if (firstMove) {
      mouse.prevX = clientX / canvas.width;
      mouse.prevY = 1.0 - clientY / canvas.height;
      firstMove = false;
    }

    mouse.x = clientX / canvas.width;
    mouse.y = 1.0 - clientY / canvas.height;
    mouse.moved = true;
    lastActivityTime = Date.now();

    if (glIdle) {
      glIdle = false;
      lastTime = performance.now();
      animId = requestAnimationFrame(render);
    }
  }

  function onTouchMove(e) {
    const t = e.touches[0];
    onMouseMove({ clientX: t.clientX, clientY: t.clientY })
  }

  window.addEventListener('mousemove', onMouseMove, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: true })

  function blit(target) {
    if (target == null) { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null) }
    else { gl.viewport(0, 0, target.width, target.height); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo) }
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(0)
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
  }

  function doSplat(x, y, dx, dy, dyeAmt, dynRadius, dynForce) {
    const ar = canvas.width / canvas.height
    const baseR = (dynRadius || CURSOR_RADIUS) / 100.0
    const r = baseR * (0.7 + Math.random() * 0.6)
    const jitter = baseR * 0.3
    x += (Math.random() - 0.5) * jitter
    y += (Math.random() - 0.5) * jitter
    const force = dynForce || VELOCITY_FORCE

    gl.useProgram(splatProg.program)
    gl.uniform1i(splatProg.uniforms.uTarget, velocity.read.attach(0))
    gl.uniform1f(splatProg.uniforms.aspectRatio, ar)
    gl.uniform2f(splatProg.uniforms.point, x, y)
    gl.uniform3f(splatProg.uniforms.color, dx * force, dy * force, 0.0)
    gl.uniform1f(splatProg.uniforms.radius, r)
    blit(velocity.write)
    velocity.swap()

    gl.uniform1i(splatProg.uniforms.uTarget, dye.read.attach(0))
    gl.uniform3f(splatProg.uniforms.color, dyeAmt, dyeAmt, dyeAmt)
    gl.uniform1f(splatProg.uniforms.radius, r)
    blit(dye.write)
    dye.swap()
  }

  function step(dt) {
    gl.useProgram(curlProg.program)
    gl.uniform2f(curlProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(curlProg.uniforms.uVelocity, velocity.read.attach(0))
    blit(curlFBO)

    gl.useProgram(vorticityProg.program)
    gl.uniform2f(vorticityProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(vorticityProg.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(vorticityProg.uniforms.uCurl, curlFBO.attach(1))
    gl.uniform1f(vorticityProg.uniforms.curl, CURL_STRENGTH)
    gl.uniform1f(vorticityProg.uniforms.dt, dt)
    blit(velocity.write); velocity.swap()

    gl.useProgram(divergenceProg.program)
    gl.uniform2f(divergenceProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(divergenceProg.uniforms.uVelocity, velocity.read.attach(0))
    blit(divergenceFBO)

    gl.useProgram(clearProg.program)
    gl.uniform1i(clearProg.uniforms.uTexture, pressure.read.attach(0))
    gl.uniform1f(clearProg.uniforms.value, PRESSURE_DISSIPATION)
    blit(pressure.write); pressure.swap()

    gl.useProgram(pressureProg.program)
    gl.uniform2f(pressureProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(pressureProg.uniforms.uDivergence, divergenceFBO.attach(0))
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProg.uniforms.uPressure, pressure.read.attach(1))
      blit(pressure.write); pressure.swap()
    }

    gl.useProgram(gradSubProg.program)
    gl.uniform2f(gradSubProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(gradSubProg.uniforms.uPressure, pressure.read.attach(0))
    gl.uniform1i(gradSubProg.uniforms.uVelocity, velocity.read.attach(1))
    blit(velocity.write); velocity.swap()

    gl.useProgram(advectionProg.program)
    gl.uniform2f(advectionProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
    gl.uniform1i(advectionProg.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(advectionProg.uniforms.uSource, velocity.read.attach(0))
    gl.uniform1f(advectionProg.uniforms.dt, dt)
    gl.uniform1f(advectionProg.uniforms.dissipation, VELOCITY_DISSIPATION)
    blit(velocity.write); velocity.swap()

    gl.uniform2f(advectionProg.uniforms.texelSize, dye.texelSizeX, dye.texelSizeY)
    gl.uniform1i(advectionProg.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(advectionProg.uniforms.uSource, dye.read.attach(1))
    gl.uniform1f(advectionProg.uniforms.dissipation, DENSITY_DISSIPATION)
    blit(dye.write); dye.swap()
  }

  let animId, lastTime = 0

  function render(time) {
    if (!glIdle && Date.now() - lastActivityTime > 3000) {
      glIdle = true;
      return; // Stop animation loop until mouse moves again
    }

    animId = requestAnimationFrame(render)

    const dt = Math.min((time - lastTime) / 1000, 0.016666)
    lastTime = time

    if (mouse.moved) {
      mouse.moved = false
      const dx = mouse.x - mouse.prevX
      const dy = mouse.y - mouse.prevY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const speed = dist * 1000

      const speedMult = Math.min(3, 1 + speed / 20)
      const dynRadius = CURSOR_RADIUS * speedMult
      const dynDye = DYE_AMOUNT * Math.min(2.5, 0.6 + speed / 25)
      const dynForce = VELOCITY_FORCE * Math.min(2, 1 + speed / 40)

      const steps = Math.max(1, Math.floor(dist * (isMobile ? 100 : 300)))
      for (let i = 0; i < steps; i++) {
        const t = (i + 1) / steps
        const ix = mouse.prevX + dx * t
        const iy = mouse.prevY + dy * t
        doSplat(ix, iy, dx / steps, dy / steps, dynDye / steps, dynRadius, dynForce)
      }


      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
    }

    step(dt)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(displayProg.program)
    gl.uniform1i(displayProg.uniforms.uTexture, dye.read.attach(0))
    blit(null)
    gl.disable(gl.BLEND)
  }

  animId = requestAnimationFrame(render);

  const glitchChars = '01XYZ/\\_<>[]{}O♦○•';
  let lastTextEmitTime = 0;

  const onMoveGlitchText = (e) => {
    if (isMobile) return; // Hard block synthetic mouse events on mobile
    const now = Date.now();
    if (now - lastTextEmitTime < 40) return;
    lastTextEmitTime = now;

    let target = e;
    if (e.touches && e.touches.length > 0) {
      target = e.touches[0];
    }

    const char = glitchChars[Math.floor(Math.random() * glitchChars.length)];
    const el = document.createElement('div');
    el.textContent = char;

    const offsetX = (Math.random() - 0.5) * 20;
    const offsetY = (Math.random() - 0.5) * 20;

    const colors = ['var(--primary-cyan)', 'var(--alert-orange)', 'var(--accent-purple)'];
    const chosenColor = colors[Math.floor(Math.random() * colors.length)];

    Object.assign(el.style, {
      position: 'fixed',
      left: `${target.clientX + offsetX}px`,
      top: `${target.clientY + offsetY}px`,
      color: chosenColor,
      fontFamily: 'var(--font-header)',
      fontSize: `${Math.random() * 8 + 8}px`, // 8px to 16px
      pointerEvents: 'none',
      zIndex: '9999',
      opacity: '0.8',
      textShadow: '0 0 5px currentColor',
      transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
      transform: 'translate(-50%, -50%) scale(1)'
    });

    document.body.appendChild(el);

    requestAnimationFrame(() => {
      const driftY = (Math.random() - 0.5) * 60;
      const driftX = (Math.random() - 0.5) * 20;
      el.style.transform = `translate(calc(-50% + ${driftX}px), calc(-50% + ${driftY}px)) scale(0.1)`;
      el.style.opacity = '0';
    });

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 600);
  };

  window.addEventListener('mousemove', onMoveGlitchText);

});
