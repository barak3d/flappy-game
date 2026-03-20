// ===================== Kirby's Math Flight =====================
// A flappy-bird style game that teaches first-grade arithmetic.
// Kirby must fly through the pipe gap that shows the CORRECT answer.
// ================================================================

(function () {
  "use strict";

  // ---- Canvas setup ----
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // 480
  const H = canvas.height;  // 640

  // ---- UI elements ----
  const startScreen = document.getElementById("start-screen");
  const gameOverScreen = document.getElementById("game-over-screen");
  const finalScoreEl = document.getElementById("finalScore");
  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");
  const muteBtn = document.getElementById("muteBtn");

  // ---- Game constants ----
  const GRAVITY = 0.45;
  const FLAP_STRENGTH = -7.5;
  const PIPE_WIDTH = 90;
  const PIPE_SPEED = 2.0;
  const PIPE_INTERVAL = 600; // pixels between pipe centres (wide spacing to read & solve questions)
  const INITIAL_GAP_SIZE = 170; // vertical gap at start (easy)
  const MIN_GAP_SIZE = 120;     // vertical gap at hardest
  const GAP_SHRINK_PER_POINT = 3; // gap shrinks by this per point scored
  const MUSIC_LOOP_COUNT = 200; // number of melody loops to schedule ahead

  // ---- Life system ----
  const MAX_LIVES = 3;
  const INVINCIBILITY_FRAMES = 90; // ~1.5 seconds of invincibility after a hit

  // ---- Game state ----
  let bird, pipes, score, frameCount, gameRunning, gameOver;
  let lives, invincibleTimer;
  let backgroundOffset = 0;

  // ---- Audio (procedural using Web Audio API) ----
  let audioCtx = null;
  let masterGain = null;  // master gain to mute/unmute ALL sound
  let musicGain = null;
  let sfxGain = null;
  let musicPlaying = false;
  let allMuted = false;
  let flapOsc = null;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1.0;
    masterGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(masterGain);
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 1.0;
    sfxGain.connect(masterGain);
  }

  // Simple happy background melody using oscillators
  function startMusic() {
    if (!audioCtx || musicPlaying) return;
    musicPlaying = true;

    // Simple melody using note frequencies (Hz): C4=262, D4=294, E4=330, F4=349, G4=392; 0=rest
    const notes = [262, 294, 330, 262, 330, 262, 294, 0,
                   330, 349, 392, 0, 392, 349, 330, 294,
                   262, 294, 330, 262, 294, 0, 262, 0];
    const noteDur = 0.22;
    const loopLen = notes.length * noteDur;

    function scheduleLoop(startTime) {
      notes.forEach((freq, i) => {
        if (freq === 0) return;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.12, startTime + i * noteDur);
        g.gain.exponentialRampToValueAtTime(0.001, startTime + i * noteDur + noteDur * 0.9);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(startTime + i * noteDur);
        osc.stop(startTime + i * noteDur + noteDur);
      });
    }

    // Schedule several loops ahead
    const now = audioCtx.currentTime;
    for (let l = 0; l < MUSIC_LOOP_COUNT; l++) {
      scheduleLoop(now + l * loopLen);
    }
  }

  function playFlapSound() {
    if (!audioCtx || !sfxGain) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.1);
    g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  }

  function playCorrectSound() {
    if (!audioCtx || !sfxGain) return;
    const notes = [523, 659, 784];
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.18, audioCtx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.1 + 0.2);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(audioCtx.currentTime + i * 0.1);
      osc.stop(audioCtx.currentTime + i * 0.1 + 0.2);
    });
  }

  function playWrongSound() {
    if (!audioCtx || !sfxGain) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 150;
    g.gain.setValueAtTime(0.2, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  }

  function playHitSound() {
    if (!audioCtx || !sfxGain) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.25);
    g.gain.setValueAtTime(0.18, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  }

  function toggleMute() {
    allMuted = !allMuted;
    if (masterGain) {
      masterGain.gain.value = allMuted ? 0 : 1.0;
    }
    muteBtn.textContent = allMuted ? "🔇 Sound Off" : "🔊 Sound On";
  }

  // ---- Arithmetic problem generator (1st grade) ----
  function generateProblem() {
    // Addition or subtraction, numbers 1-10, result >= 0
    const isAdd = Math.random() < 0.6;
    let a, b, answer;
    if (isAdd) {
      a = randInt(1, 10);
      b = randInt(1, 10);
      answer = a + b;
      return { text: a + " + " + b + " = ?", answer: answer };
    } else {
      a = randInt(2, 15);
      b = randInt(1, a);   // ensure non-negative result
      answer = a - b;
      return { text: a + " − " + b + " = ?", answer: answer };
    }
  }

  function generateWrongAnswers(correct) {
    const wrongs = new Set();
    while (wrongs.size < 2) {
      let w = correct + randInt(-4, 4);
      if (w !== correct && w >= 0) wrongs.add(w);
    }
    return Array.from(wrongs);
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ---- Gap size based on current score (progressive difficulty) ----
  function currentGapSize() {
    return Math.max(MIN_GAP_SIZE, INITIAL_GAP_SIZE - score * GAP_SHRINK_PER_POINT);
  }

  // ---- Pipe (with answers) ----
  function createPipe(x) {
    const problem = generateProblem();
    const wrong = generateWrongAnswers(problem.answer);
    const options = [problem.answer, wrong[0], wrong[1]];
    // Shuffle and place in 3 vertical slots (top, middle, bottom)
    shuffle(options);

    // Determine 3 gap positions (we create 3 openings, each shows an answer)
    // The pipe is divided into 3 sections with a gap in each
    const sectionH = H / 3;
    const gapSize = currentGapSize();

    const sections = options.map((val, i) => {
      const centerY = sectionH * i + sectionH / 2;
      return {
        value: val,
        correct: val === problem.answer,
        gapTop: centerY - gapSize / 2,
        gapBottom: centerY + gapSize / 2,
      };
    });

    return {
      x: x,
      width: PIPE_WIDTH,
      problem: problem,
      sections: sections,
      scored: false,
      passed: false,
    };
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ---- Kirby drawing ----
  function drawKirby(x, y, size, rotation, flapAnim) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    // Squash-and-stretch on flap
    var scaleX = 1;
    var scaleY = 1;
    if (flapAnim > 0) {
      // t goes from 1.0 (just tapped) down to 0.0 (animation done)
      var t = flapAnim / 14;
      // Elastic squash-stretch: squish wide then bounce tall
      scaleX = 1 + 0.3 * Math.sin(t * Math.PI) * (t > 0.5 ? 1 : -0.5);
      scaleY = 1 - 0.25 * Math.sin(t * Math.PI) * (t > 0.5 ? 1 : -0.5);
    }
    ctx.scale(scaleX, scaleY);

    // Body (pink circle)
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fillStyle = "#FF69B4";
    ctx.fill();
    ctx.strokeStyle = "#D1477A";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cheeks (blush) — brighter during flap
    var blushAlpha = 0.4;
    if (flapAnim > 6) blushAlpha = 0.7;
    else if (flapAnim > 0) blushAlpha = 0.55;

    ctx.beginPath();
    ctx.ellipse(-size * 0.5, size * 0.2, size * 0.2, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#FF1493";
    ctx.globalAlpha = blushAlpha;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.ellipse(size * 0.5, size * 0.2, size * 0.2, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#FF1493";
    ctx.globalAlpha = blushAlpha;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Eyes — squint shut during first frames of flap, then reopen
    var eyeScaleY = 1;
    if (flapAnim > 10) eyeScaleY = 0.15;        // eyes squeezed shut
    else if (flapAnim > 7) eyeScaleY = 0.4;      // half open
    else if (flapAnim > 4) eyeScaleY = 0.75;     // mostly open

    // Eyes
    ctx.beginPath();
    ctx.ellipse(-size * 0.28, -size * 0.15, size * 0.18, size * 0.22 * eyeScaleY, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a40";
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(size * 0.28, -size * 0.15, size * 0.18, size * 0.22 * eyeScaleY, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a40";
    ctx.fill();

    // Eye highlights (hidden when eyes squinted)
    if (eyeScaleY > 0.5) {
      ctx.globalAlpha = (eyeScaleY - 0.5) * 2; // fade in as eyes open
      ctx.beginPath();
      ctx.ellipse(-size * 0.22, -size * 0.25, size * 0.07, size * 0.09 * eyeScaleY, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(size * 0.34, -size * 0.25, size * 0.05, size * 0.07 * eyeScaleY, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Blue eye color (hidden when eyes squinted)
    if (eyeScaleY > 0.3) {
      ctx.beginPath();
      ctx.ellipse(-size * 0.3, -size * 0.08, size * 0.1, size * 0.1 * eyeScaleY, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#4169E1";
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(size * 0.26, -size * 0.08, size * 0.1, size * 0.1 * eyeScaleY, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#4169E1";
      ctx.fill();
    }

    // Mouth — open "O" during flap, otherwise happy curve
    if (flapAnim > 4) {
      // Open mouth (cute "O" shape)
      var mouthOpen = 0.4;
      if (flapAnim > 10) mouthOpen = 1.0;
      else if (flapAnim > 7) mouthOpen = 0.7;
      ctx.beginPath();
      ctx.ellipse(0, size * 0.25, size * 0.1 * mouthOpen, size * 0.13 * mouthOpen, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#C41060";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, size * 0.25, size * 0.06 * mouthOpen, size * 0.08 * mouthOpen, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#2a0010";
      ctx.fill();
    } else {
      // Mouth (small happy curve)
      ctx.beginPath();
      ctx.arc(0, size * 0.2, size * 0.15, 0.1, Math.PI - 0.1);
      ctx.strokeStyle = "#C41060";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Feet (little red ovals at bottom)
    ctx.beginPath();
    ctx.ellipse(-size * 0.35, size * 0.85, size * 0.22, size * 0.12, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = "#DC143C";
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(size * 0.35, size * 0.85, size * 0.22, size * 0.12, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "#DC143C";
    ctx.fill();

    ctx.restore();
  }

  // ---- Background drawing ----
  function drawBackground() {
    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#87CEEB");
    grad.addColorStop(0.6, "#E0F7FF");
    grad.addColorStop(1, "#98FB98");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Clouds
    drawCloud(((100 - backgroundOffset * 0.3) % (W + 200)) + 100, 80, 1.0);
    drawCloud(((350 - backgroundOffset * 0.2) % (W + 200)) + 50, 150, 0.7);
    drawCloud(((200 - backgroundOffset * 0.25) % (W + 200)) + 80, 250, 0.85);

    // Ground
    ctx.fillStyle = "#6B8E23";
    ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = "#556B2F";
    ctx.fillRect(0, H - 40, W, 6);
  }

  function drawCloud(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.arc(30, -10, 25, 0, Math.PI * 2);
    ctx.arc(55, 0, 30, 0, Math.PI * 2);
    ctx.arc(25, 10, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- Pipe drawing ----
  function drawPipes() {
    const colors = getPipeColors();

    pipes.forEach((pipe) => {
      const px = pipe.x;

      // Draw pipe columns with gaps
      const sectionH = H / 3;

      pipe.sections.forEach((sec, i) => {
        // Pipe above gap (cap at bottom = opening toward gap)
        drawMarioPipeSegment(px, sectionH * i, pipe.width, sec.gapTop - sectionH * i, colors, "top");
        // Pipe below gap (cap at top = opening toward gap)
        drawMarioPipeSegment(px, sec.gapBottom, pipe.width, sectionH * (i + 1) - sec.gapBottom, colors, "bottom");

        // Draw answer number in the gap
        ctx.save();
        const centerY = (sec.gapTop + sec.gapBottom) / 2;
        const bubbleX = px + pipe.width / 2;

        if (sec.correct) {
          // Correct answer: green bubble with star indicator
          ctx.beginPath();
          ctx.arc(bubbleX, centerY, 30, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(50,205,50,0.9)";
          ctx.fill();
          ctx.strokeStyle = "#228B22";
          ctx.lineWidth = 3;
          ctx.stroke();

          // Star icon above the bubble
          ctx.font = "20px 'Segoe UI', Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText("⭐", bubbleX, centerY - 30);

          ctx.fillStyle = "#fff";
        } else {
          // Wrong answer: plain white bubble
          ctx.beginPath();
          ctx.arc(bubbleX, centerY, 26, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fill();
          ctx.strokeStyle = "#555";
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = "#222";
        }

        // Answer number
        ctx.font = "bold 30px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sec.value, bubbleX, centerY);

        ctx.restore();
      });
    });
  }

  // ---- Pipe color progression based on score ----
  function getPipeColors() {
    // Colors progress: green → teal → yellow → orange → red as score increases
    const stages = [
      { body: "#2E9B3E", bodyLight: "#5FCF6A", bodyDark: "#1C6B28", rim: "#3DBF50", rimLight: "#72E082", rimDark: "#1F7F32", stroke: "#1A5420" }, // green (classic Mario)
      { body: "#1E8B8B", bodyLight: "#4FC9C9", bodyDark: "#0E5B5B", rim: "#28ABAB", rimLight: "#62DADA", rimDark: "#147070", stroke: "#0A4040" }, // teal
      { body: "#C8A800", bodyLight: "#F0D040", bodyDark: "#907800", rim: "#DAB800", rimLight: "#FFE050", rimDark: "#A08800", stroke: "#706000" }, // yellow
      { body: "#CC6600", bodyLight: "#F09030", bodyDark: "#994400", rim: "#DD7720", rimLight: "#FFB060", rimDark: "#AA5500", stroke: "#703000" }, // orange
      { body: "#BB2222", bodyLight: "#E05050", bodyDark: "#881111", rim: "#CC3333", rimLight: "#F06060", rimDark: "#991515", stroke: "#600808" }, // red
    ];
    const idx = Math.min(Math.floor(score / 3), stages.length - 1);
    return stages[idx];
  }

  // ---- Mario-style pipe drawing ----
  function drawMarioPipeSegment(x, y, w, h, colors, capSide) {
    // capSide: "top" draws a lip at the bottom edge, "bottom" draws a lip at the top edge
    // This refers to which side of a gap the pipe is on
    if (h <= 0) return;
    ctx.save();

    const lipH = 16;
    const lipOverhang = 6;

    // Main pipe body gradient
    const bodyGrad = ctx.createLinearGradient(x, 0, x + w, 0);
    bodyGrad.addColorStop(0, colors.bodyDark);
    bodyGrad.addColorStop(0.15, colors.bodyLight);
    bodyGrad.addColorStop(0.4, colors.body);
    bodyGrad.addColorStop(0.85, colors.bodyDark);
    bodyGrad.addColorStop(1, colors.bodyDark);

    // Rim/lip gradient
    const rimGrad = ctx.createLinearGradient(x - lipOverhang, 0, x + w + lipOverhang, 0);
    rimGrad.addColorStop(0, colors.rimDark);
    rimGrad.addColorStop(0.15, colors.rimLight);
    rimGrad.addColorStop(0.4, colors.rim);
    rimGrad.addColorStop(0.85, colors.rimDark);
    rimGrad.addColorStop(1, colors.rimDark);

    if (capSide === "top") {
      // Pipe body (above the lip)
      const bodyH = h - lipH;
      if (bodyH > 0) {
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(x, y, w, bodyH);
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, bodyH);

        // Vertical highlight stripe on the body
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.fillRect(x + w * 0.15, y, w * 0.12, bodyH);
      }

      // Lip at bottom (opening towards gap)
      const lipY = y + h - lipH;
      ctx.fillStyle = rimGrad;
      roundRect(x - lipOverhang, lipY, w + lipOverhang * 2, lipH, 4);
      ctx.fill();
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Highlight on the lip
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x - lipOverhang + 3, lipY + 2, (w + lipOverhang * 2) * 0.25, lipH - 4);

    } else {
      // capSide === "bottom": lip at the top, body below

      // Lip at top (opening towards gap)
      ctx.fillStyle = rimGrad;
      roundRect(x - lipOverhang, y, w + lipOverhang * 2, lipH, 4);
      ctx.fill();
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Highlight on the lip
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x - lipOverhang + 3, y + 2, (w + lipOverhang * 2) * 0.25, lipH - 4);

      // Pipe body (below the lip)
      const bodyY = y + lipH;
      const bodyH = h - lipH;
      if (bodyH > 0) {
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(x, bodyY, w, bodyH);
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, bodyY, w, bodyH);

        // Vertical highlight stripe on the body
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.fillRect(x + w * 0.15, bodyY, w * 0.12, bodyH);
      }
    }

    ctx.restore();
  }

  // Utility: draw a rounded rectangle path
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ---- HUD ----
  function drawHUD() {
    ctx.save();
    ctx.font = "bold 32px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.strokeText("Score: " + score, 14, 96);
    ctx.fillText("Score: " + score, 14, 96);

    // Draw lives as hearts at top-left
    ctx.font = "28px 'Segoe UI', Arial, sans-serif";
    for (let i = 0; i < MAX_LIVES; i++) {
      const heartX = 18 + i * 34;
      const heartY = 120;
      if (i < lives) {
        ctx.fillStyle = "#FF1744";
        drawHeart(heartX, heartY, 12);
        ctx.fill();
        ctx.strokeStyle = "#B71C1C";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(100,100,100,0.5)";
        drawHeart(heartX, heartY, 12);
        ctx.fill();
        ctx.strokeStyle = "rgba(60,60,60,0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // Draw a heart shape path centred at (cx, cy) with given size
  function drawHeart(cx, cy, size) {
    ctx.beginPath();
    const topY = cy - size * 0.4;
    ctx.moveTo(cx, cy + size);
    // Left curve
    ctx.bezierCurveTo(cx - size * 1.5, cy - size * 0.2, cx - size * 0.8, topY - size, cx, topY);
    // Right curve
    ctx.bezierCurveTo(cx + size * 0.8, topY - size, cx + size * 1.5, cy - size * 0.2, cx, cy + size);
    ctx.closePath();
  }

  // ---- Question banner (large, always-visible, centred at top of screen) ----
  function drawQuestionBanner() {
    // Find the nearest pipe that hasn't been scored (the next challenge)
    const activePipe = pipes.find((p) => !p.scored && p.x + p.width > bird.x - bird.size);
    if (!activePipe) return;

    const questionText = activePipe.problem.text;

    ctx.save();

    // Large semi-transparent rounded banner background spanning most of the width
    const bw = 380;
    const bh = 70;
    const bx = (W - bw) / 2;
    const by = 6;
    const radius = 20;
    ctx.beginPath();
    ctx.moveTo(bx + radius, by);
    ctx.lineTo(bx + bw - radius, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
    ctx.lineTo(bx + bw, by + bh - radius);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
    ctx.lineTo(bx + radius, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
    ctx.lineTo(bx, by + radius);
    ctx.quadraticCurveTo(bx, by, bx + radius, by);
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fill();
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 3;
    ctx.stroke();

    // "Solve:" label
    ctx.font = "bold 18px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFF";
    ctx.fillText("Solve:", W / 2, by + 18);

    // Question text (large, centred, very prominent)
    ctx.font = "bold 36px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFD700";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 4;
    ctx.strokeText(questionText, W / 2, by + 48);
    ctx.fillText(questionText, W / 2, by + 48);

    ctx.restore();
  }

  // ---- Star particles on correct answer ----
  let particles = [];

  function spawnStars(x, y) {
    for (let i = 0; i < 12; i++) {
      particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 40,
        size: Math.random() * 4 + 2,
        color: ["#FFD700", "#FFA500", "#FF69B4", "#ADFF2F"][randInt(0, 3)],
      });
    }
  }

  function updateParticles() {
    particles = particles.filter((p) => p.life > 0);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
    });
  }

  function drawParticles() {
    particles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = p.life / 40;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      // Star shape
      drawStar(p.x, p.y, 5, p.size, p.size * 0.5);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawStar(cx, cy, spikes, outerR, innerR) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
  }

  // ---- Collision detection ----
  function checkCollision(pipe) {
    const bx = bird.x;
    const by = bird.y;
    const br = bird.size * 0.85; // slightly forgiving hitbox

    // Check if bird is within pipe X range
    if (bx + br < pipe.x || bx - br > pipe.x + pipe.width) return null;

    // Check each section
    for (const sec of pipe.sections) {
      // Bird is within this gap vertically
      if (by - br >= sec.gapTop && by + br <= sec.gapBottom) {
        return sec;
      }
    }

    // Bird hit a pipe wall
    return "hit";
  }

  // ---- Game init ----
  function resetGame() {
    bird = {
      x: 80,
      y: H / 2,
      vy: 0,
      size: 22,
      rotation: 0,
      flapAnim: 0,
    };
    pipes = [];
    particles = [];
    score = 0;
    lives = MAX_LIVES;
    invincibleTimer = 0;
    frameCount = 0;
    gameRunning = true;
    gameOver = false;
    backgroundOffset = 0;
  }

  // ---- Game loop ----
  function update() {
    if (!gameRunning) return;

    frameCount++;
    backgroundOffset += PIPE_SPEED;

    // Bird physics
    bird.vy += GRAVITY;
    bird.y += bird.vy;
    bird.rotation = Math.min(bird.vy * 0.06, 0.5);

    // Flap animation timer
    if (bird.flapAnim > 0) bird.flapAnim--;

    // Invincibility timer
    if (invincibleTimer > 0) invincibleTimer--;

    // Floor / ceiling
    if (bird.y + bird.size > H - 40) {
      bird.y = H - 40 - bird.size;
      bird.vy = FLAP_STRENGTH * 0.6;
      takeDamage();
      if (gameOver) return;
    }
    if (bird.y - bird.size < 0) {
      bird.y = bird.size;
      bird.vy = 0;
      takeDamage();
      if (gameOver) return;
    }

    // Spawn pipes (delay the first pipe to give the player time to read)
    const lastPipe = pipes[pipes.length - 1];
    if (frameCount > 120 && (!lastPipe || lastPipe.x < W - PIPE_INTERVAL)) {
      pipes.push(createPipe(W + 20));
    }

    // Move pipes
    pipes.forEach((p) => (p.x -= PIPE_SPEED));

    // Remove off-screen pipes
    pipes = pipes.filter((p) => p.x + p.width > -20);

    // Collision
    for (const pipe of pipes) {
      const result = checkCollision(pipe);
      if (result === "hit") {
        if (invincibleTimer > 0) continue; // ignore wall hits during invincibility
        takeDamage();
        if (gameOver) return;
        // Bounce the bird slightly away from the pipe
        bird.vy = FLAP_STRENGTH * 0.5;
        break;
      }
      if (result && typeof result === "object" && !pipe.scored) {
        pipe.scored = true;
        if (result.correct) {
          score++;
          playCorrectSound();
          spawnStars(bird.x + 30, bird.y);
        } else {
          if (invincibleTimer > 0) continue; // ignore wrong answers during invincibility
          takeDamage();
          if (gameOver) return;
        }
      }
    }

    updateParticles();
  }

  function draw() {
    drawBackground();
    drawPipes();
    drawParticles();

    // Kirby (blink when invincible)
    if (invincibleTimer > 0 && Math.floor(invincibleTimer / 4) % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      drawKirby(bird.x, bird.y, bird.size, bird.rotation, bird.flapAnim);
      ctx.restore();
    } else {
      drawKirby(bird.x, bird.y, bird.size, bird.rotation, bird.flapAnim);
    }

    drawHUD();
    drawQuestionBanner();
  }

  function gameLoop() {
    update();
    draw();

    if (!gameOver) {
      requestAnimationFrame(gameLoop);
    }
  }

  function takeDamage() {
    if (invincibleTimer > 0) return; // still invincible
    lives--;
    if (lives <= 0) {
      playWrongSound();
      endGame();
      return;
    }
    playHitSound();
    invincibleTimer = INVINCIBILITY_FRAMES;
  }

  function endGame() {
    gameRunning = false;
    gameOver = true;
    finalScoreEl.textContent = score;
    gameOverScreen.classList.remove("hidden");
  }

  function startGame() {
    initAudio();
    if (!allMuted) startMusic();
    resetGame();
    // Give an initial flap so Kirby doesn't fall immediately
    bird.vy = FLAP_STRENGTH;
    startScreen.classList.add("hidden");
    gameOverScreen.classList.add("hidden");
    gameLoop();
  }

  function flap() {
    if (!gameRunning) return;
    bird.vy = FLAP_STRENGTH;
    bird.flapAnim = 14;
    playFlapSound();
  }

  // ---- Event listeners ----
  startBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", startGame);
  muteBtn.addEventListener("click", toggleMute);

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!gameRunning && !gameOver) {
        startGame();
      } else {
        flap();
      }
    }
  });

  canvas.addEventListener("click", () => {
    if (gameRunning) flap();
  });

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (gameRunning) flap();
  });

  // Initial draw (idle screen background)
  function drawIdleScreen() {
    drawBackground();
    drawKirby(W / 2, H / 2, 40, 0, 0);
  }
  drawIdleScreen();
})();
