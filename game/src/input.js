// Skyline Courier — input. Keyboard and mouse, both steering the same
// stick: arrows or WASD pitch and bank, W/S (or Shift/Ctrl) work the
// throttle, the mouse steers by position when it moves, and clicks press
// the menu buttons. Every frame the game reads a single normalised stick
// object, so the flight model never knows which device moved it.

export function createInput(canvas) {
  const keys = new Set();
  const input = {
    pitch: 0, // -1 (nose down) .. 1 (nose up)
    roll: 0, // -1 (left) .. 1 (right)
    throttle: 0, // -1 .. 1, applied as a change per second
    brake: false,
    mouseX: 0.5, // 0..1 across the canvas
    mouseY: 0.5, // 0..1 down the canvas
    mouseActive: false,
    mouseDown: false,
    clicked: null, // { x, y } in canvas pixels, consumed by the main loop
  };

  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ShiftLeft: 'throttleUp', ShiftRight: 'throttleUp',
    ControlLeft: 'throttleDown', ControlRight: 'throttleDown',
    Space: 'brake',
  };

  function onKey(e, down) {
    const action = KEYMAP[e.code];
    if (action) {
      if (down) keys.add(action);
      else keys.delete(action);
      e.preventDefault();
    }
    if (down && (e.code === 'KeyP' || e.code === 'Escape')) input.pausePressed = true;
    if (down && e.code === 'KeyR') input.restartPressed = true;
    if (down && e.code === 'KeyM') input.mutePressed = true;
    if (down && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
      input.missionPressed = Number(e.code.slice(-1)) - 1;
    }
    if (down && e.code === 'Enter') input.confirmPressed = true;
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - rect.left) / rect.width;
    input.mouseY = (e.clientY - rect.top) / rect.height;
    input.mouseActive = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.clicked = {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
    input.mouseDown = true;
  });
  window.addEventListener('mouseup', () => {
    input.mouseDown = false;
  });
  canvas.addEventListener('wheel', (e) => {
    input.wheelDelta = (input.wheelDelta || 0) + (e.deltaY < 0 ? 1 : -1);
    e.preventDefault();
  }, { passive: false });

  // Fold the current device state into one stick, called once per frame.
  // Keyboard wins while a key is held; the mouse takes over as soon as it
  // moves, so a player can fly with either hand without switching modes.
  function poll() {
    let pitch = 0;
    let roll = 0;
    let throttle = 0;
    if (keys.has('up')) pitch += 1;
    if (keys.has('down')) pitch -= 1;
    if (keys.has('left')) roll -= 1;
    if (keys.has('right')) roll += 1;
    if (keys.has('throttleUp')) throttle += 1;
    if (keys.has('throttleDown')) throttle -= 1;
    if (input.wheelDelta) {
      throttle += Math.sign(input.wheelDelta) * 0.6;
      input.wheelDelta = 0;
    }
    if (pitch === 0 && roll === 0 && input.mouseActive) {
      // Mouse steering: centre is level, edges are full deflection.
      roll = (input.mouseX - 0.5) * 2;
      pitch = (0.5 - input.mouseY) * 2;
      const dead = 0.08;
      if (Math.abs(roll) < dead) roll = 0;
      if (Math.abs(pitch) < dead) pitch = 0;
    }
    input.pitch = Math.max(-1, Math.min(1, pitch));
    input.roll = Math.max(-1, Math.min(1, roll));
    input.throttle = Math.max(-1, Math.min(1, throttle));
    input.brake = keys.has('brake');
    return input;
  }

  function takeClick() {
    const c = input.clicked;
    input.clicked = null;
    return c;
  }

  function takePress(name) {
    const v = input[name];
    input[name] = false;
    return v;
  }

  return { input, poll, takeClick, takePress, keys };
}
