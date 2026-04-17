/**
 * Canvas port of index.py — Elastic collision demo.
 */
(function () {
  "use strict";

  const WIDTH = 1530;
  const HEIGHT = 800;
  const TRACK_WIDTH = 1070;
  const g = 0.15;
  const PI = Math.PI;

  const bgColor = "rgb(220, 240, 255)";
  const groundColor = "rgb(180, 210, 255)";
  const panelColor = "rgb(240, 248, 255)";
  const textColor = "rgb(50, 70, 120)";

  const GROUND_Y = 540;

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  function copysign(mag, s) {
    return Math.abs(mag) * (s >= 0 ? 1 : -1);
  }

  function initBallPhase2(ball) {
    ball.zone = "straight";
    ball.vy = 0;
    ball.arc_alpha = 0;
    ball.arc_v0 = 0;
    ball.stopped = false;
  }

  const blueBall = {
    x: 165,
    y: GROUND_Y,
    radius: 50,
    color: "rgb(100, 180, 255)",
    vx: 8,
    mass: 6,
  };
  const pinkBall = {
    x: 850,
    y: GROUND_Y,
    radius: 35,
    color: "rgb(255, 160, 200)",
    vx: -4,
    mass: 4,
  };
  initBallPhase2(blueBall);
  initBallPhase2(pinkBall);

  const resetBlue = { vx: 8 };
  const resetPink = { vx: -4 };

  let mode = "elastic";
  let phase2Enabled = true;
  let paused = false;
  let ballCollisionHappened = false;
  let ballsStopped = false;
  let momentumBeforeCollision = null;
  let energyBeforeCollision = null;

  const sliders = [
    { x: 1100, y: 120, w: 180, min: 1, max: 20, value: 6, label: "Blue Ball Mass", knobColor: null, dragging: false },
    { x: 1300, y: 120, w: 180, min: 20, max: 80, value: 50, label: "Blue Ball Radius", knobColor: null, dragging: false },
    { x: 1100, y: 180, w: 180, min: 1, max: 20, value: 4, label: "Pink Ball Mass", knobColor: null, dragging: false },
    { x: 1300, y: 180, w: 180, min: 20, max: 80, value: 35, label: "Pink Ball Radius", knobColor: null, dragging: false },
    { x: 1100, y: 240, w: 180, min: 0, max: 10, value: 8, label: "Blue Ball Speed", knobColor: blueBall.color, dragging: false },
    { x: 1300, y: 240, w: 180, min: 0, max: 10, value: 4, label: "Pink Ball Speed", knobColor: pinkBall.color, dragging: false },
    { x: 1100, y: 300, w: 180, min: 100, max: 200, value: 160, label: "Semicircle Radius", knobColor: null, dragging: false },
  ];

  const btnElastic = { x: 1100, y: 350, w: 140, h: 36 };
  const btnInelastic = { x: 1250, y: 350, w: 140, h: 36 };
  const btnPhase2 = { x: 1100, y: 395, w: 290, h: 36 };

  function getSemicircleR() {
    return phase2Enabled ? sliders[6].value : 0;
  }

  function getKnobX(s) {
    return s.x + ((s.value - s.min) / (s.max - s.min)) * s.w;
  }

  function canvasCoords(ev) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    return {
      x: (ev.clientX - r.left) * sx,
      y: (ev.clientY - r.top) * sy,
    };
  }

  function hitSlider(mx, my, s) {
    const knobX = getKnobX(s);
    const cy = s.y + 6;
    const track = { x: s.x, y: s.y, w: s.w, h: 20 };
    if (mx >= track.x && mx <= track.x + track.w && my >= track.y && my <= track.y + track.h) return true;
    if (Math.abs(mx - knobX) < 18 && Math.abs(my - cy) < 25) return true;
    return false;
  }

  function pointInRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  }

  function drawBackground() {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const R = getSemicircleR();
    ctx.strokeStyle = groundColor;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    if (!phase2Enabled || R <= 0) {
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(TRACK_WIDTH, GROUND_Y);
      ctx.stroke();
    } else {
      const leftEnd = R;
      const rightStart = TRACK_WIDTH - 2 * R;
      ctx.beginPath();
      ctx.moveTo(leftEnd, GROUND_Y);
      ctx.lineTo(rightStart + R, GROUND_Y);
      ctx.stroke();

      const cxL = R;
      const cyL = GROUND_Y - R;
      ctx.beginPath();
      ctx.arc(cxL, cyL, R, PI / 2, -PI / 2, false);
      ctx.stroke();

      const cxR = rightStart + R;
      const cyR = GROUND_Y - R;
      ctx.beginPath();
      ctx.arc(cxR, cyR, R, -PI / 2, PI / 2, false);
      ctx.stroke();
    }
  }

  function getBallSpeed(ball) {
    if (ball.zone === "straight") return Math.abs(ball.vx);
    if (ball.stopped) return 0;
    const v0 = ball.arc_v0 || 0;
    const R = getSemicircleR();
    const r = ball.radius;
    const R_eff = Math.max(1, R - r);
    const alpha = ball.arc_alpha;
    const vSq = v0 * v0 - 2 * g * R_eff * (1 - Math.sin(alpha));
    return Math.sqrt(Math.max(0, vSq));
  }

  function getBallVelocityAngle(ball) {
    if (ball.zone === "straight") return ball.vx >= 0 ? 0 : PI;
    if (ball.stopped) return 0;
    const alpha = ball.arc_alpha;
    if (ball.zone === "left_arc") return Math.atan2(Math.cos(alpha), -Math.sin(alpha));
    return Math.atan2(-Math.cos(alpha), Math.sin(alpha));
  }

  function drawArrow(color, x, y, angle, len, head) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const x0 = x - (len / 2) * cosA;
    const y0 = y - (len / 2) * sinA;
    const x1 = x + (len / 2) * cosA;
    const y1 = y + (len / 2) * sinA;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const hx = head * cosA;
    const hy = head * sinA;
    const px = head * sinA;
    const py = -head * cosA;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - hx + px, y1 - hy + py);
    ctx.lineTo(x1 - hx - px, y1 - hy - py);
    ctx.closePath();
    ctx.fill();
  }

  function drawBall(ball) {
    const x = Math.round(ball.x);
    const cy = Math.round(ball.y - ball.radius);
    const r = Math.round(ball.radius);
    const color = ball.color;

    const grd = ctx.createRadialGradient(x - r / 3, cy - r / 3, 0, x, cy, r);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.4, color);
    grd.addColorStop(1, color);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 3;
    ctx.stroke();

    const arrowY = cy - r - 30;
    const arrowLen = 40;
    const head = 8;
    const speed = getBallSpeed(ball);

    if (phase2Enabled && ball.zone !== "straight") {
      const ang = getBallVelocityAngle(ball);
      drawArrow(color, x, arrowY, ang, arrowLen, head);
    } else if (ball.vx > 0) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;
      const ax0 = x - arrowLen / 2;
      const ax1 = x + arrowLen / 2;
      ctx.beginPath();
      ctx.moveTo(ax0, arrowY);
      ctx.lineTo(ax1, arrowY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax1, arrowY);
      ctx.lineTo(ax1 - head, arrowY - head);
      ctx.lineTo(ax1 - head, arrowY + head);
      ctx.closePath();
      ctx.fill();
    } else if (ball.vx < 0) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;
      const ax0 = x + arrowLen / 2;
      const ax1 = x - arrowLen / 2;
      ctx.beginPath();
      ctx.moveTo(ax0, arrowY);
      ctx.lineTo(ax1, arrowY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax1, arrowY);
      ctx.lineTo(ax1 + head, arrowY - head);
      ctx.lineTo(ax1 + head, arrowY + head);
      ctx.closePath();
      ctx.fill();
    }

    if (speed > 0) {
      ctx.font = "bold 32px system-ui, sans-serif";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(speed.toFixed(1), x, arrowY - 20);
    }
  }

  function moveBall(ball) {
    if (paused || ballsStopped) return;
    const R = getSemicircleR();
    const r = ball.radius;

    if (!phase2Enabled || R <= 0) {
      ball.x += ball.vx;
      if (!ballCollisionHappened) {
        if (ball.x - r < 0) {
          ball.x = r;
          ball.vx = Math.abs(ball.vx);
        } else if (ball.x + r > TRACK_WIDTH) {
          ball.x = TRACK_WIDTH - r;
          ball.vx = -Math.abs(ball.vx);
        }
      }
      return;
    }

    const leftEnd = R;
    const rightEnd = TRACK_WIDTH - R;
    const R_eff = Math.max(1, R - r);

    if (ball.zone === "straight") {
      ball.x += ball.vx;
      if (!ballCollisionHappened) {
        if (ball.x - r < leftEnd) {
          ball.x = leftEnd;
          ball.vx = Math.abs(ball.vx);
        } else if (ball.x + r > rightEnd) {
          ball.x = rightEnd;
          ball.vx = -Math.abs(ball.vx);
        }
      }
      if (ball.vx < 0 && ball.x <= leftEnd) {
        ball.zone = "left_arc";
        ball.arc_alpha = PI / 2;
        ball.arc_v0 = Math.abs(ball.vx);
        ball.vy = 0;
        ball.x = R + R_eff * Math.cos(PI / 2);
        ball.y = GROUND_Y - R + R_eff * Math.sin(PI / 2) + r;
      } else if (ball.vx > 0 && ball.x >= rightEnd) {
        ball.zone = "right_arc";
        ball.arc_alpha = PI / 2;
        ball.arc_v0 = Math.abs(ball.vx);
        ball.vy = 0;
        ball.x = TRACK_WIDTH - R + R_eff * Math.cos(PI / 2);
        ball.y = GROUND_Y - R + R_eff * Math.sin(PI / 2) + r;
      }
    } else if (ball.zone === "left_arc") {
      if (ball.stopped) return;
      let alpha = ball.arc_alpha;
      const v0 = ball.arc_v0;
      let vSq = v0 * v0 - 2 * g * R_eff * (1 - Math.sin(alpha));
      if (vSq <= 0) {
        ball.stopped = true;
        const sinStop = 1 - (v0 * v0) / (2 * g * R_eff);
        ball.arc_alpha = PI - Math.asin(Math.max(-1, Math.min(1, sinStop)));
        alpha = ball.arc_alpha;
      } else {
        const v = Math.sqrt(vSq);
        const dAlpha = v / R_eff;
        ball.arc_alpha = Math.min((3 * PI) / 2, alpha + dAlpha);
        alpha = ball.arc_alpha;
      }
      ball.x = R + R_eff * Math.cos(alpha);
      ball.y = GROUND_Y - R + R_eff * Math.sin(alpha) + r;
    } else if (ball.zone === "right_arc") {
      if (ball.stopped) return;
      let alpha = ball.arc_alpha;
      const v0 = ball.arc_v0;
      let vSq = v0 * v0 - 2 * g * R_eff * (1 - Math.sin(alpha));
      if (vSq <= 0) {
        ball.stopped = true;
        const sinStop = 1 - (v0 * v0) / (2 * g * R_eff);
        ball.arc_alpha = Math.asin(Math.max(-1, Math.min(1, sinStop)));
        alpha = ball.arc_alpha;
      } else {
        const v = Math.sqrt(vSq);
        const dAlpha = -v / R_eff;
        ball.arc_alpha = Math.max(-PI / 2, alpha + dAlpha);
        alpha = ball.arc_alpha;
      }
      ball.x = TRACK_WIDTH - R + R_eff * Math.cos(alpha);
      ball.y = GROUND_Y - R + R_eff * Math.sin(alpha) + r;
    }
  }

  function resolveCollision(b1, b2) {
    if (paused || ballsStopped) return;
    if (phase2Enabled && (b1.zone !== "straight" || b2.zone !== "straight")) return;

    const dx = b2.x - b1.x;
    const dist = Math.abs(dx);
    if (dist >= b1.radius + b2.radius) return;
    if ((dx > 0 && b1.vx <= b2.vx) || (dx < 0 && b1.vx >= b2.vx)) return;

    if (momentumBeforeCollision == null) {
      momentumBeforeCollision = b1.mass * b1.vx + b2.mass * b2.vx;
    }
    if (energyBeforeCollision == null) {
      energyBeforeCollision = 0.5 * b1.mass * b1.vx * b1.vx + 0.5 * b2.mass * b2.vx * b2.vx;
    }

    const m1 = b1.mass;
    const v1 = b1.vx;
    const m2 = b2.mass;
    const v2 = b2.vx;
    const mTotal = m1 + m2;

    if (mode === "elastic") {
      b1.vx = (v1 * (m1 - m2) + 2 * m2 * v2) / mTotal;
      b2.vx = (v2 * (m2 - m1) + 2 * m1 * v1) / mTotal;
    } else {
      const vCommon = (m1 * v1 + m2 * v2) / mTotal;
      b1.vx = vCommon;
      b2.vx = vCommon;
    }

    const overlap = b1.radius + b2.radius - dist;
    const step = overlap / 2;
    if (dx > 0) {
      b1.x -= step;
      b2.x += step;
    } else {
      b1.x += step;
      b2.x -= step;
    }
    ballCollisionHappened = true;
  }

  function getMomentumBefore() {
    if (!ballCollisionHappened) {
      return blueBall.mass * blueBall.vx + pinkBall.mass * pinkBall.vx;
    }
    return momentumBeforeCollision;
  }

  function getBallVx(ball) {
    if (ball.zone === "straight") return ball.vx;
    if (ball.stopped) return 0;
    const v = getBallSpeed(ball);
    const alpha = ball.arc_alpha;
    if (ball.zone === "left_arc") return -v * Math.sin(alpha);
    return v * Math.sin(alpha);
  }

  function getMomentumAfter() {
    if (!ballCollisionHappened) return 0;
    return blueBall.mass * getBallVx(blueBall) + pinkBall.mass * getBallVx(pinkBall);
  }

  function getEnergyBefore() {
    if (!ballCollisionHappened) {
      return 0.5 * blueBall.mass * blueBall.vx * blueBall.vx + 0.5 * pinkBall.mass * pinkBall.vx * pinkBall.vx;
    }
    return energyBeforeCollision;
  }

  function getEnergyAfter() {
    if (!ballCollisionHappened) return 0;
    if (mode === "elastic") {
      const v1 = getBallSpeed(blueBall);
      const v2 = getBallSpeed(pinkBall);
      return 0.5 * blueBall.mass * v1 * v1 + 0.5 * pinkBall.mass * v2 * v2;
    }
    const mTotal = blueBall.mass + pinkBall.mass;
    const vCom =
      (blueBall.mass * getBallVx(blueBall) + pinkBall.mass * getBallVx(pinkBall)) / mTotal;
    return 0.5 * mTotal * vCom * vCom;
  }

  function drawSlider(s) {
    const padY = 6;
    const rx = s.x;
    const ry = s.y - padY;
    const rw = s.w;
    const rh = 10 + padY * 2;
    ctx.fillStyle = "rgb(200, 200, 200)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = "rgb(150, 180, 220)";
    ctx.fillRect(rx, ry, rw, rh);

    const posX = getKnobX(s);
    const kcy = s.y + 6;
    const fill = s.knobColor || "rgb(80, 150, 255)";
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(posX, kcy, 14, 0, PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = "20px system-ui, sans-serif";
    ctx.fillStyle = s.knobColor || textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${s.label}: ${s.value.toFixed(1)}`, s.x, s.y - 10);
  }

  function drawPanel() {
    ctx.fillStyle = panelColor;
    ctx.fillRect(1070, 0, 500, HEIGHT);
    ctx.strokeStyle = "rgb(180, 210, 255)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(1070, 0);
    ctx.lineTo(1070, HEIGHT);
    ctx.stroke();

    ctx.font = "bold 44px system-ui, sans-serif";
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Control Panel", 1300, 20);

    const btnSel = "rgb(80, 150, 220)";
    const btnUnsel = "rgb(200, 210, 235)";
    const btnBorder = "rgb(120, 150, 200)";

    function drawBtn(rect, label, selected) {
      ctx.fillStyle = selected ? btnSel : btnUnsel;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = btnBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.font = "22px system-ui, sans-serif";
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
    }

    drawBtn(btnElastic, "Elastic", mode === "elastic");
    drawBtn(btnInelastic, "Inelastic", mode === "inelastic");

    const pBefore = getMomentumBefore();
    const pAfter = getMomentumAfter();
    const eBefore = getEnergyBefore();
    const eAfter = getEnergyAfter();

    const lines = [
      "Space - Pause / Resume",
      "R     - Reset Position",
      "",
      `Momentum Before:  ${(pBefore >= 0 ? "+" : "") + pBefore.toFixed(2)}`,
      `Momentum After:   ${(pAfter >= 0 ? "+" : "") + pAfter.toFixed(2)}`,
      "",
      `Energy Before:    ${eBefore.toFixed(2)} J`,
      `Energy After:     ${eAfter.toFixed(2)} J`,
      "",
      `Blue velocity: ${(getBallVx(blueBall) >= 0 ? "+" : "") + getBallVx(blueBall).toFixed(1)}`,
      `Pink velocity: ${(getBallVx(pinkBall) >= 0 ? "+" : "") + getBallVx(pinkBall).toFixed(1)}`,
    ];

    ctx.font = "22px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const infoY = 435;
    lines.forEach((line, i) => {
      ctx.fillStyle = textColor;
      ctx.fillText(line, 1100, infoY + i * 26);
    });

    sliders.forEach((s, i) => {
      if (i === 6 && !phase2Enabled) return;
      drawSlider(s);
    });

    ctx.fillStyle = phase2Enabled ? btnSel : btnUnsel;
    ctx.fillRect(btnPhase2.x, btnPhase2.y, btnPhase2.w, btnPhase2.h);
    ctx.strokeStyle = btnBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(btnPhase2.x, btnPhase2.y, btnPhase2.w, btnPhase2.h);
    ctx.font = "22px system-ui, sans-serif";
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Phase 2: Semicircle Track", btnPhase2.x + btnPhase2.w / 2, btnPhase2.y + btnPhase2.h / 2);
  }

  function resetBalls() {
    const R = phase2Enabled ? getSemicircleR() : 0;
    if (phase2Enabled && R > 0) {
      const leftEnd = R;
      const rightEnd = TRACK_WIDTH - R;
      const margin = 15;
      blueBall.x = leftEnd + sliders[1].value + margin;
      pinkBall.x = rightEnd - sliders[3].value - margin;
    } else {
      blueBall.x = sliders[1].value;
      pinkBall.x = TRACK_WIDTH - sliders[3].value;
    }
    blueBall.vx = resetBlue.vx;
    pinkBall.vx = resetPink.vx;
    initBallPhase2(blueBall);
    initBallPhase2(pinkBall);
    blueBall.y = GROUND_Y;
    pinkBall.y = GROUND_Y;
    paused = false;
    ballCollisionHappened = false;
    ballsStopped = false;
    momentumBeforeCollision = null;
    energyBeforeCollision = null;
  }

  function onMouseDown(ev) {
    const { x: mx, y: my } = canvasCoords(ev);
    if (pointInRect(mx, my, btnElastic)) {
      mode = "elastic";
      phase2Enabled = true;
      return;
    }
    if (pointInRect(mx, my, btnInelastic)) {
      mode = "inelastic";
      phase2Enabled = false;
      return;
    }
    if (pointInRect(mx, my, btnPhase2)) {
      phase2Enabled = !phase2Enabled;
      return;
    }
    sliders.forEach((s) => {
      if (hitSlider(mx, my, s)) {
        s.dragging = true;
        const relX = Math.max(0, Math.min(mx - s.x, s.w));
        s.value = s.min + (relX / s.w) * (s.max - s.min);
      }
    });
  }

  function onMouseMove(ev) {
    const { x: mx, y: my } = canvasCoords(ev);
    sliders.forEach((s) => {
      if (s.dragging) {
        const relX = Math.max(0, Math.min(mx - s.x, s.w));
        s.value = s.min + (relX / s.w) * (s.max - s.min);
      }
    });
  }

  function onMouseUp() {
    sliders.forEach((s) => {
      s.dragging = false;
    });
  }

  function onKeyDown(ev) {
    if (ev.code === "Space") {
      ev.preventDefault();
      paused = !paused;
    } else if (ev.key === "r" || ev.key === "R") {
      resetBalls();
    }
  }

  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("keydown", onKeyDown);

  function syncSlidersToBalls() {
    blueBall.mass = sliders[0].value;
    blueBall.radius = sliders[1].value;
    pinkBall.mass = sliders[2].value;
    pinkBall.radius = sliders[3].value;
    if (!ballCollisionHappened) {
      const sb = sliders[4].value;
      const sp = sliders[5].value;
      blueBall.vx = blueBall.vx !== 0 ? copysign(sb, blueBall.vx) : sb;
      pinkBall.vx = pinkBall.vx !== 0 ? copysign(sp, pinkBall.vx) : -sp;
    }
  }

  function tick() {
    syncSlidersToBalls();

    drawBackground();
    moveBall(blueBall);
    moveBall(pinkBall);
    resolveCollision(blueBall, pinkBall);

    if (phase2Enabled) {
      if (ballCollisionHappened && blueBall.stopped && pinkBall.stopped) {
        ballsStopped = true;
      }
    } else {
      const blueOut =
        blueBall.x - blueBall.radius < 0 || blueBall.x + blueBall.radius > TRACK_WIDTH;
      const pinkOut =
        pinkBall.x - pinkBall.radius < 0 || pinkBall.x + pinkBall.radius > TRACK_WIDTH;
      if (ballCollisionHappened && (blueOut || pinkOut)) {
        ballsStopped = true;
      }
    }

    drawBall(blueBall);
    drawBall(pinkBall);

    ctx.font = "bold 44px system-ui, sans-serif";
    ctx.fillStyle = "rgb(80, 120, 180)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Collision Demo", 500, 60);

    drawPanel();

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
