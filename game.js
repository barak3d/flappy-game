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
  const PIPE_SPEED = 2.2;
  const PIPE_INTERVAL = 220; // pixels between pipe centres
  const INITIAL_GAP_SIZE = 140; // vertical gap at start (easy)
  const MIN_GAP_SIZE = 95;      // vertical gap at hardest
  const GAP_SHRINK_PER_POINT = 5; // gap shrinks by this per point scored
  const MUSIC_LOOP_COUNT = 200; // number of melody loops to schedule ahead

  // ---- Game state ----
  let bird, pipes, score, frameCount, gameRunning, gameOver;
  let backgroundOffset = 0;

  // ---- Audio (procedural using Web Audio API) ----
  let audioCtx = null;
  let musicGain = null;
  let musicPlaying = false;
  let musicMuted = false;
  let flapOsc = null;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(audioCtx.destination);
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
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.1);
    g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  }

  function playCorrectSound() {
    if (!audioCtx) return;
    const notes = [523, 659, 784];
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.18, audioCtx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.1 + 0.2);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + i * 0.1);
      osc.stop(audioCtx.currentTime + i * 0.1 + 0.2);
    });
  }

  function playWrongSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 150;
    g.gain.setValueAtTime(0.2, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  }

  function toggleMute() {
    musicMuted = !musicMuted;
    if (musicGain) {
      musicGain.gain.value = musicMuted ? 0 : 0.18;
    }
    muteBtn.textContent = musicMuted ? "🔇 Music Off" : "🔊 Music On";
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
    pipes.forEach((pipe) => {
      const px = pipe.x;

      // Draw the problem text above the pipe
      if (px > -pipe.width && px < W) {
        ctx.save();
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 3;
        ctx.font = "bold 20px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center";
        const textX = px + pipe.width / 2;
        ctx.strokeText(pipe.problem.text, textX, 30);
        ctx.fillText(pipe.problem.text, textX, 30);
        ctx.restore();
      }

      // Draw pipe columns with gaps
      const sectionH = H / 3;

      pipe.sections.forEach((sec, i) => {
        // Pipe above gap
        drawPipeRect(px, sectionH * i, pipe.width, sec.gapTop - sectionH * i);
        // Pipe below gap
        drawPipeRect(px, sec.gapBottom, pipe.width, sectionH * (i + 1) - sec.gapBottom);

        // Draw answer number in the gap
        ctx.save();
        const centerY = (sec.gapTop + sec.gapBottom) / 2;
        const bubbleX = px + pipe.width / 2;

        if (sec.correct) {
          // Correct answer: green bubble with star indicator
          ctx.beginPath();
          ctx.arc(bubbleX, centerY, 26, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(50,205,50,0.9)";
          ctx.fill();
          ctx.strokeStyle = "#228B22";
          ctx.lineWidth = 3;
          ctx.stroke();

          // Star icon above the bubble
          ctx.font = "18px 'Segoe UI', Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText("⭐", bubbleX, centerY - 26);

          ctx.fillStyle = "#fff";
        } else {
          // Wrong answer: plain white bubble
          ctx.beginPath();
          ctx.arc(bubbleX, centerY, 22, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fill();
          ctx.strokeStyle = "#555";
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = "#222";
        }

        // Answer number
        ctx.font = "bold 28px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sec.value, bubbleX, centerY);

        ctx.restore();
      });
    });
  }

  function drawPipeRect(x, y, w, h) {
    if (h <= 0) return;
    ctx.save();
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, "#3CB371");
    grad.addColorStop(0.5, "#66CDAA");
    grad.addColorStop(1, "#3CB371");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#2E8B57";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  // ---- HUD ----
  function drawHUD() {
    ctx.save();
    ctx.font = "bold 32px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.strokeText("Score: " + score, 14, 60);
    ctx.fillText("Score: " + score, 14, 60);
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

    // Floor / ceiling
    if (bird.y + bird.size > H - 40) {
      bird.y = H - 40 - bird.size;
      endGame();
      return;
    }
    if (bird.y - bird.size < 0) {
      bird.y = bird.size;
      bird.vy = 0;
    }

    // Spawn pipes (delay the first pipe to give the player time)
    const lastPipe = pipes[pipes.length - 1];
    if (frameCount > 80 && (!lastPipe || lastPipe.x < W - PIPE_INTERVAL)) {
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
        playWrongSound();
        endGame();
        return;
      }
      if (result && typeof result === "object" && !pipe.scored) {
        pipe.scored = true;
        if (result.correct) {
          score++;
          playCorrectSound();
          spawnStars(bird.x + 30, bird.y);
        } else {
          playWrongSound();
          endGame();
          return;
        }
      }
    }

    updateParticles();
  }

  function draw() {
    drawBackground();
    drawPipes();
    drawParticles();

    // Kirby
    drawKirby(bird.x, bird.y, bird.size, bird.rotation, bird.flapAnim);

    drawHUD();
  }

  function gameLoop() {
    update();
    draw();

    if (!gameOver) {
      requestAnimationFrame(gameLoop);
    }
  }

  function endGame() {
    gameRunning = false;
    gameOver = true;
    finalScoreEl.textContent = score;
    gameOverScreen.classList.remove("hidden");
  }

  function startGame() {
    initAudio();
    if (!musicMuted) startMusic();
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
