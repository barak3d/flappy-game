// ================= קִירְבִּי טָס בְּחֶשְׁבּוֹן =================
// A flappy-bird style game that teaches first-grade arithmetic (Hebrew).
// Kirby must fly through the pipe gap that shows the CORRECT answer.
// ================================================================

(function () {
  "use strict";

  // ---- Canvas setup ----
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  let W = canvas.width;   // 480 default, updated by resizeCanvas()
  let H = canvas.height;  // 640 default, updated by resizeCanvas()

  // ---- Dynamic canvas sizing ----
  // Fills the viewport on mobile/tablet; on desktop (>768px) keeps original aspect ratio
  function resizeCanvas() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (vw <= 768) {
      // Mobile / tablet: fill the entire viewport
      canvas.width = vw;
      canvas.height = vh;
    } else {
      // Desktop: maintain original proportions
      canvas.width = 480;
      canvas.height = 640;
    }

    W = canvas.width;
    H = canvas.height;
  }

  resizeCanvas();
  window.addEventListener("resize", function () {
    resizeCanvas();
    // Redraw idle screen if game is not running
    if (!gameRunning && !gameOver) {
      drawIdleScreen();
    }
  });

  // ---- UI elements ----
  const startScreen = document.getElementById("start-screen");
  const gameOverScreen = document.getElementById("game-over-screen");
  const finalScoreEl = document.getElementById("finalScore");
  const bestScoreValueEl = document.getElementById("bestScoreValue");
  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");
  const muteBtn = document.getElementById("muteBtn");
  const customizeBtn = document.getElementById("customizeBtn");
  const customizeBtnGameOver = document.getElementById("customizeBtnGameOver");
  const customizeScreen = document.getElementById("customize-screen");
  const customizeBackBtn = document.getElementById("customizeBackBtn");
  const bestScoreDisplayEl = document.getElementById("bestScoreDisplay");
  const skinsGrid = document.getElementById("skins-grid");
  const accessoriesGrid = document.getElementById("accessories-grid");
  const skinsProgressEl = document.getElementById("skins-progress");
  const accessoriesProgressEl = document.getElementById("accessories-progress");
  const previewCanvas = document.getElementById("kirby-preview");
  const previewCtx = previewCanvas.getContext("2d");
  const nameInputSection = document.getElementById("name-input-section");
  const playerNameInput = document.getElementById("playerName");
  const saveScoreBtn = document.getElementById("saveScoreBtn");
  const leaderboardBody = document.getElementById("leaderboard-body");

  // ---- Leaderboard constants ----
  const LEADERBOARD_KEY = "flappy-kirby-leaderboard";
  const MAX_LEADERBOARD = 10;

  // ---- Firebase initialization ----
  let _firestoreDb = null;
  var _collectionName = typeof FLAPPY_COLLECTION_NAME !== "undefined"
    ? FLAPPY_COLLECTION_NAME : "flappy-leaderboard";
  try {
    if (typeof firebase !== "undefined" &&
        typeof FIREBASE_CONFIG !== "undefined" &&
        FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId) {
      const app = firebase.initializeApp(FIREBASE_CONFIG);
      _firestoreDb = firebase.firestore(app);
    }
  } catch (e) {
    console.warn("Firebase init failed:", e.message);
  }

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
  const INITIAL_MAX_LIVES = 3;
  const EXTRA_LIFE_INTERVAL = 10; // award an extra life (and raise the cap) every N points
  const INVINCIBILITY_FRAMES = 90; // ~1.5 seconds of invincibility after a hit

  // ---- Hard mode (after reaching this score, correct answer is no longer highlighted) ----
  const HARD_MODE_THRESHOLD = 10;
  const HARD_MODE_PIPE_INTERVAL = 900;  // wider spacing so kids can calculate
  const HARD_MODE_INITIAL_SPEED = 1.5;  // slower start after hard mode kicks in
  const HARD_MODE_SPEED_INCREMENT = 0.08; // speed increase per point beyond threshold
  const HARD_MODE_MAX_SPEED = 3.0;

  // ---- Fixed-timestep loop (frame-rate independent) ----
  const TARGET_FPS = 60;
  const FRAME_DURATION = 1000 / TARGET_FPS; // ~16.667 ms per simulation step

  // ---- Clock reward (slow-down power-up) ----
  const CLOCK_MIN_SCORE = 15;            // only spawns after reaching this score
  const CLOCK_SCORE_INTERVAL = 5;        // spawn a clock every N points (100 % of the time)
  const CLOCK_MAX_ACTIVE = 1;            // at most 1 clock on screen at a time
  const CLOCK_SIZE = 22;                 // radius used for drawing & collision
  const CLOCK_SLOWDOWN_FACTOR = 0.4;     // multiply speed by this while active

  // ---- Game state ----
  let bird, pipes, score, frameCount, gameRunning, gameOver;
  let lives, invincibleTimer;
  let backgroundOffset = 0;
  let extraLivesAwarded = 0; // tracks how many milestone extra lives have been given
  let hardModeActivated = false; // once hard mode triggers, it stays on for the rest of the game
  let pendingHardMode = false;   // defer activation until bird clears the trigger pipe
  let hardModeTriggerPipe = null; // the pipe that caused the threshold to be reached
  let clocks = [];             // scrolling clock reward objects (move left like pipes)
  let slowdownTimer = 0;       // remaining frames of slow-down effect
  let lastClockScore = 0;      // last score at which a clock was spawned
  let lastFrameTime = 0;       // timestamp of last gameLoop call (ms)
  let accumulator = 0;         // accumulated time for fixed-timestep loop (ms)

  // ---- Interpolation state (previous simulation tick) ----
  let prevBirdY = 0;
  let prevBirdRotation = 0;
  let prevBackgroundOffset = 0;

  // ---- Customization data ----
  const SKINS = {
    classic: { name: "קְלָסִי", body: "#FF69B4", stroke: "#D1477A", blush: "#FF1493", feet: "#DC143C", unlock: 0 },
    ocean:   { name: "אוֹקְיָנוּס", body: "#69B4FF", stroke: "#477AD1", blush: "#1493FF", feet: "#143CDC", unlock: 5 },
    forest:  { name: "יַעַר", body: "#69FFB4", stroke: "#47D17A", blush: "#14FF93", feet: "#14DC3C", unlock: 10 },
    sunset:  { name: "שְׁקִיעָה", body: "#FFB469", stroke: "#D1A047", blush: "#FF9314", feet: "#DC6914", unlock: 15 },
    royal:   { name: "מַלְכוּתִי", body: "#B469FF", stroke: "#8A47D1", blush: "#9314FF", feet: "#6914DC", unlock: 20 },
    golden:  { name: "זְהָב", body: "#FFD700", stroke: "#DAA520", blush: "#FFC125", feet: "#B8860B", unlock: 30 },
  };

  const ACCESSORIES = {
    none:       { name: "לְלֹא", emoji: "❌", unlock: 0 },
    crown:      { name: "כֶּתֶר", emoji: "👑", unlock: 3 },
    bow:        { name: "סֶרֶט", emoji: "🎀", unlock: 7 },
    sunglasses: { name: "מִשְׁקָפַיִם", emoji: "🕶️", unlock: 12 },
    cape:       { name: "גַּלִּימָה", emoji: "🦸", unlock: 18 },
    star_aura:  { name: "הִילָת כּוֹכָבִים", emoji: "✨", unlock: 25 },
  };

  // ---- Customization state (persisted in localStorage) ----
  let bestScore = parseInt(localStorage.getItem("kirbyBestScore")) || 0;
  let selectedSkin = localStorage.getItem("kirbySelectedSkin") || "classic";
  let selectedAccessory = localStorage.getItem("kirbySelectedAccessory") || "none";
  let unlockNotification = { text: "", timer: 0 };

  // Validate stored selections still exist
  if (!SKINS[selectedSkin]) selectedSkin = "classic";
  if (!ACCESSORIES[selectedAccessory]) selectedAccessory = "none";

  function getActiveSkin() {
    return SKINS[selectedSkin] || SKINS.classic;
  }

  // ---- Audio (procedural using Web Audio API) ----
  let audioCtx = null;
  let masterGain = null;  // master gain to mute/unmute ALL sound
  let musicGain = null;
  let sfxGain = null;
  let musicPlaying = false;
  let allMuted = localStorage.getItem("kirbyMuted") === "true";
  let flapOsc = null;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = allMuted ? 0 : 1.0;
    masterGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(masterGain);
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 1.0;
    sfxGain.connect(masterGain);
    // Resume AudioContext if suspended (browser autoplay policy)
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function ensureAudioResumed() {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  // Simple happy background melody using oscillators
  function startMusic() {
    if (!audioCtx || musicPlaying) return;
    ensureAudioResumed();
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
    ensureAudioResumed();
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
    ensureAudioResumed();
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
    ensureAudioResumed();
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
    ensureAudioResumed();
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

  function playClockSound() {
    if (!audioCtx || !sfxGain) return;
    ensureAudioResumed();
    // Magical chime: two rising tones
    [880, 1175].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.15, audioCtx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.12 + 0.3);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(audioCtx.currentTime + i * 0.12);
      osc.stop(audioCtx.currentTime + i * 0.12 + 0.3);
    });
  }

  function toggleMute() {
    allMuted = !allMuted;
    localStorage.setItem("kirbyMuted", allMuted);
    if (masterGain) {
      masterGain.gain.value = allMuted ? 0 : 1.0;
    }
    muteBtn.textContent = allMuted ? "🔇 קוֹל כָּבוּי" : "🔊 קוֹל דָּלוּק";
  }

  // ---- Arithmetic problem generator (1st grade) ----
  let usedProblems = new Set();

  function problemKey(op, a, b) {
    // For addition, normalize order (commutativity: 1+4 == 4+1)
    if (op === "+") {
      return "+" + Math.min(a, b) + ":" + Math.max(a, b);
    }
    return "-" + a + ":" + b;
  }

  function generateProblem() {
    // Addition or subtraction, numbers 1-10, result >= 0
    for (let attempt = 0; attempt < 200; attempt++) {
      const isAdd = Math.random() < 0.6;
      let a, b, answer, key;
      if (isAdd) {
        a = randInt(1, 10);
        b = randInt(1, 10);
        answer = a + b;
        key = problemKey("+", a, b);
      } else {
        a = randInt(2, 15);
        b = randInt(1, a);   // ensure non-negative result
        answer = a - b;
        key = problemKey("-", a, b);
      }
      if (!usedProblems.has(key)) {
        usedProblems.add(key);
        const op = isAdd ? " + " : " − ";
        return { text: a + op + b + " = ?", answer: answer };
      }
    }
    // All problems exhausted – clear and start fresh
    usedProblems.clear();
    const isAdd = Math.random() < 0.6;
    let a, b, answer;
    if (isAdd) {
      a = randInt(1, 10);
      b = randInt(1, 10);
      answer = a + b;
    } else {
      a = randInt(2, 15);
      b = randInt(1, a);
      answer = a - b;
    }
    const key = problemKey(isAdd ? "+" : "-", a, b);
    usedProblems.add(key);
    const op = isAdd ? " + " : " − ";
    return { text: a + op + b + " = ?", answer: answer };
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

  function isHardMode() {
    return hardModeActivated;
  }

  function getMaxLives() {
    return INITIAL_MAX_LIVES + Math.floor(score / EXTRA_LIFE_INTERVAL);
  }

  // ---- Dynamic pipe speed (ramps up after hard mode threshold) ----
  function currentPipeSpeed() {
    let spd;
    if (!isHardMode()) {
      spd = PIPE_SPEED;
    } else {
      const extra = Math.max(0, score - HARD_MODE_THRESHOLD);
      spd = Math.min(HARD_MODE_MAX_SPEED, HARD_MODE_INITIAL_SPEED + extra * HARD_MODE_SPEED_INCREMENT);
    }
    // Apply clock slow-down if active
    if (slowdownTimer > 0) spd *= CLOCK_SLOWDOWN_FACTOR;
    return spd;
  }

  // ---- Dynamic pipe interval (wider after hard mode threshold) ----
  function currentPipeInterval() {
    if (!isHardMode()) return PIPE_INTERVAL;
    return HARD_MODE_PIPE_INTERVAL;
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
    const sectionH = (H - 40) / 3;
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
      prevX: x,
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
  function drawKirby(x, y, size, rotation, flapAnim, targetCtx) {
    var c = targetCtx || ctx;
    var skin = getActiveSkin();

    c.save();
    c.translate(x, y);
    c.rotate(rotation);

    // Squash-and-stretch on flap
    var scaleX = 1;
    var scaleY = 1;
    if (flapAnim > 0) {
      var t = flapAnim / 14;
      scaleX = 1 + 0.3 * Math.sin(t * Math.PI) * (t > 0.5 ? 1 : -0.5);
      scaleY = 1 - 0.25 * Math.sin(t * Math.PI) * (t > 0.5 ? 1 : -0.5);
    }
    c.scale(scaleX, scaleY);

    // Cape accessory drawn behind Kirby
    if (selectedAccessory === "cape") {
      drawCape(c, size, skin);
    }

    // Body
    c.beginPath();
    c.arc(0, 0, size, 0, Math.PI * 2);
    c.fillStyle = skin.body;
    c.fill();
    c.strokeStyle = skin.stroke;
    c.lineWidth = 2;
    c.stroke();

    // Cheeks (blush)
    var blushAlpha = 0.4;
    if (flapAnim > 6) blushAlpha = 0.7;
    else if (flapAnim > 0) blushAlpha = 0.55;

    c.beginPath();
    c.ellipse(-size * 0.5, size * 0.2, size * 0.2, size * 0.12, 0, 0, Math.PI * 2);
    c.fillStyle = skin.blush;
    c.globalAlpha = blushAlpha;
    c.fill();
    c.globalAlpha = 1;

    c.beginPath();
    c.ellipse(size * 0.5, size * 0.2, size * 0.2, size * 0.12, 0, 0, Math.PI * 2);
    c.fillStyle = skin.blush;
    c.globalAlpha = blushAlpha;
    c.fill();
    c.globalAlpha = 1;

    // Eyes
    var eyeScaleY = 1;
    if (flapAnim > 10) eyeScaleY = 0.15;
    else if (flapAnim > 7) eyeScaleY = 0.4;
    else if (flapAnim > 4) eyeScaleY = 0.75;

    c.beginPath();
    c.ellipse(-size * 0.28, -size * 0.15, size * 0.18, size * 0.22 * eyeScaleY, 0, 0, Math.PI * 2);
    c.fillStyle = "#1a1a40";
    c.fill();

    c.beginPath();
    c.ellipse(size * 0.28, -size * 0.15, size * 0.18, size * 0.22 * eyeScaleY, 0, 0, Math.PI * 2);
    c.fillStyle = "#1a1a40";
    c.fill();

    // Eye highlights
    if (eyeScaleY > 0.5) {
      c.globalAlpha = (eyeScaleY - 0.5) * 2;
      c.beginPath();
      c.ellipse(-size * 0.22, -size * 0.25, size * 0.07, size * 0.09 * eyeScaleY, 0, 0, Math.PI * 2);
      c.fillStyle = "#fff";
      c.fill();

      c.beginPath();
      c.ellipse(size * 0.34, -size * 0.25, size * 0.05, size * 0.07 * eyeScaleY, 0, 0, Math.PI * 2);
      c.fillStyle = "#fff";
      c.fill();
      c.globalAlpha = 1;
    }

    // Blue eye color
    if (eyeScaleY > 0.3) {
      c.beginPath();
      c.ellipse(-size * 0.3, -size * 0.08, size * 0.1, size * 0.1 * eyeScaleY, 0, 0, Math.PI * 2);
      c.fillStyle = "#4169E1";
      c.fill();

      c.beginPath();
      c.ellipse(size * 0.26, -size * 0.08, size * 0.1, size * 0.1 * eyeScaleY, 0, 0, Math.PI * 2);
      c.fillStyle = "#4169E1";
      c.fill();
    }

    // Mouth
    if (flapAnim > 4) {
      var mouthOpen = 0.4;
      if (flapAnim > 10) mouthOpen = 1.0;
      else if (flapAnim > 7) mouthOpen = 0.7;
      c.beginPath();
      c.ellipse(0, size * 0.25, size * 0.1 * mouthOpen, size * 0.13 * mouthOpen, 0, 0, Math.PI * 2);
      c.fillStyle = skin.stroke;
      c.fill();
      c.beginPath();
      c.ellipse(0, size * 0.25, size * 0.06 * mouthOpen, size * 0.08 * mouthOpen, 0, 0, Math.PI * 2);
      c.fillStyle = "#2a0010";
      c.fill();
    } else {
      c.beginPath();
      c.arc(0, size * 0.2, size * 0.15, 0.1, Math.PI - 0.1);
      c.strokeStyle = skin.stroke;
      c.lineWidth = 2;
      c.stroke();
    }

    // Feet
    c.beginPath();
    c.ellipse(-size * 0.35, size * 0.85, size * 0.22, size * 0.12, -0.2, 0, Math.PI * 2);
    c.fillStyle = skin.feet;
    c.fill();

    c.beginPath();
    c.ellipse(size * 0.35, size * 0.85, size * 0.22, size * 0.12, 0.2, 0, Math.PI * 2);
    c.fillStyle = skin.feet;
    c.fill();

    // Accessory drawn on top (except cape which is behind)
    if (selectedAccessory && selectedAccessory !== "none" && selectedAccessory !== "cape") {
      drawAccessoryOnTop(c, size);
    }

    c.restore();

    // Star aura drawn outside the save/restore so it orbits in world space
    if (selectedAccessory === "star_aura") {
      drawStarAura(targetCtx || ctx, x, y, size);
    }
  }

  // ---- Accessory drawing functions ----
  function drawCape(c, size, skin) {
    c.save();
    c.beginPath();
    c.moveTo(-size * 0.2, -size * 0.5);
    c.quadraticCurveTo(-size * 1.8, size * 0.3, -size * 0.6, size * 1.2);
    c.lineTo(-size * 0.1, size * 0.6);
    c.closePath();
    c.fillStyle = skin.stroke;
    c.globalAlpha = 0.7;
    c.fill();
    c.globalAlpha = 1;
    c.restore();
  }

  function drawAccessoryOnTop(c, size) {
    switch (selectedAccessory) {
      case "crown":
        drawCrown(c, size);
        break;
      case "bow":
        drawBow(c, size);
        break;
      case "sunglasses":
        drawSunglasses(c, size);
        break;
    }
  }

  function drawCrown(c, size) {
    var crownY = -size * 1.05;
    var crownW = size * 0.8;
    var crownH = size * 0.5;
    c.save();
    c.fillStyle = "#FFD700";
    c.strokeStyle = "#DAA520";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-crownW / 2, crownY);
    c.lineTo(-crownW / 2, crownY - crownH * 0.4);
    c.lineTo(-crownW / 4, crownY - crownH * 0.15);
    c.lineTo(0, crownY - crownH);
    c.lineTo(crownW / 4, crownY - crownH * 0.15);
    c.lineTo(crownW / 2, crownY - crownH * 0.4);
    c.lineTo(crownW / 2, crownY);
    c.closePath();
    c.fill();
    c.stroke();
    // Jewels
    c.fillStyle = "#FF1744";
    c.beginPath();
    c.arc(0, crownY - crownH * 0.55, size * 0.06, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2196F3";
    c.beginPath();
    c.arc(-crownW * 0.3, crownY - crownH * 0.2, size * 0.04, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(crownW * 0.3, crownY - crownH * 0.2, size * 0.04, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawBow(c, size) {
    var bowY = -size * 0.95;
    c.save();
    // Left loop
    c.beginPath();
    c.ellipse(-size * 0.25, bowY, size * 0.25, size * 0.15, -0.3, 0, Math.PI * 2);
    c.fillStyle = "#FF4081";
    c.fill();
    c.strokeStyle = "#C2185B";
    c.lineWidth = 1;
    c.stroke();
    // Right loop
    c.beginPath();
    c.ellipse(size * 0.25, bowY, size * 0.25, size * 0.15, 0.3, 0, Math.PI * 2);
    c.fillStyle = "#FF4081";
    c.fill();
    c.strokeStyle = "#C2185B";
    c.stroke();
    // Center knot
    c.beginPath();
    c.arc(0, bowY, size * 0.1, 0, Math.PI * 2);
    c.fillStyle = "#E91E63";
    c.fill();
    c.restore();
  }

  function drawSunglasses(c, size) {
    var glassY = -size * 0.12;
    var glassW = size * 0.3;
    var glassH = size * 0.2;
    c.save();
    c.fillStyle = "rgba(20, 20, 40, 0.85)";
    c.strokeStyle = "#333";
    c.lineWidth = 1.5;
    // Left lens
    c.beginPath();
    c.ellipse(-size * 0.28, glassY, glassW, glassH, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Right lens
    c.beginPath();
    c.ellipse(size * 0.28, glassY, glassW, glassH, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Bridge
    c.beginPath();
    c.moveTo(-size * 0.05, glassY);
    c.lineTo(size * 0.05, glassY);
    c.strokeStyle = "#333";
    c.lineWidth = 2;
    c.stroke();
    // Shine on lenses
    c.beginPath();
    c.ellipse(-size * 0.2, glassY - glassH * 0.3, glassW * 0.3, glassH * 0.25, -0.3, 0, Math.PI * 2);
    c.fillStyle = "rgba(255, 255, 255, 0.2)";
    c.fill();
    c.beginPath();
    c.ellipse(size * 0.36, glassY - glassH * 0.3, glassW * 0.2, glassH * 0.2, -0.3, 0, Math.PI * 2);
    c.fillStyle = "rgba(255, 255, 255, 0.15)";
    c.fill();
    c.restore();
  }

  function drawStarAura(c, cx, cy, size) {
    c.save();
    var count = 6;
    var t = (typeof frameCount !== "undefined" ? frameCount : 0) * 0.04;
    for (var i = 0; i < count; i++) {
      var angle = t + (Math.PI * 2 / count) * i;
      var dist = size * 1.6 + Math.sin(t * 2 + i) * size * 0.2;
      var sx = cx + Math.cos(angle) * dist;
      var sy = cy + Math.sin(angle) * dist;
      var starSize = size * 0.18 + Math.sin(t * 3 + i * 1.5) * size * 0.06;
      c.fillStyle = "#FFD700";
      c.globalAlpha = 0.6 + Math.sin(t * 2 + i) * 0.3;
      drawStar(sx, sy, 5, starSize, starSize * 0.5, c);
      c.fill();
    }
    c.globalAlpha = 1;
    c.restore();
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
      const sectionH = (H - 40) / 3;

      pipe.sections.forEach((sec, i) => {
        // Pipe above gap (cap at bottom = opening toward gap)
        drawMarioPipeSegment(px, sectionH * i, pipe.width, sec.gapTop - sectionH * i, colors, "top");
        // Pipe below gap (cap at top = opening toward gap)
        drawMarioPipeSegment(px, sec.gapBottom, pipe.width, sectionH * (i + 1) - sec.gapBottom, colors, "bottom");

        // Draw answer number in the gap
        ctx.save();
        const centerY = (sec.gapTop + sec.gapBottom) / 2;
        const bubbleX = px + pipe.width / 2;

        if (sec.correct && !isHardMode()) {
          // Correct answer: green bubble with star indicator (only before hard mode)
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
          // Wrong answer (or any answer in hard mode): plain white bubble
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
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.strokeText("נִקּוּד: " + score, W - 14, 96);
    ctx.fillText("נִקּוּד: " + score, W - 14, 96);

    // Draw lives as hearts at top-right
    ctx.font = "28px 'Segoe UI', Arial, sans-serif";
    for (let i = 0; i < getMaxLives(); i++) {
      const heartX = W - 18 - i * 34;
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

  // ---- Slow-down HUD indicator ----
  function drawSlowdownIndicator() {
    if (slowdownTimer <= 0) return;
    ctx.save();
    const alpha = slowdownTimer < 30 ? slowdownTimer / 30 : 1;
    ctx.globalAlpha = alpha;
    // Small banner at top-left
    const bx = 10;
    const by = 130;
    const bw = 120;
    const bh = 32;
    ctx.fillStyle = "rgba(30, 60, 120, 0.75)";
    roundRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.strokeStyle = "#90CAF9";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = "bold 16px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#E3F2FD";
    ctx.fillText("⏰ הַאָטָה!", bx + bw / 2, by + bh / 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---- Question banner (large, always-visible, centred at top of screen) ----
  function drawQuestionBanner() {
    // Find the nearest pipe that hasn't been scored (the next challenge)
    const activePipe = pipes.find((p) => !p.scored && p.x + p.width > bird.x - bird.size);
    if (!activePipe) return;

    const questionText = activePipe.problem.text;

    ctx.save();

    // Large semi-transparent rounded banner background spanning most of the width
    const bw = Math.min(380, W - 20);
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

    // "!פִּתְרוּ" label
    ctx.font = "bold 18px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFF";
    ctx.fillText("!פִּתְרוּ", W / 2, by + 18);

    // Question text (large, centred, very prominent)
    ctx.direction = "ltr";
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
        prevX: x,
        prevY: y,
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

  function drawStar(cx, cy, spikes, outerR, innerR, targetCtx) {
    var c = targetCtx || ctx;
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    c.beginPath();
    c.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      c.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
      rot += step;
      c.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
      rot += step;
    }
    c.lineTo(cx, cy - outerR);
    c.closePath();
  }

  // ---- Clock reward (falling slow-down power-up) ----
  function drawClock(cx, cy, r) {
    ctx.save();

    // Outer circle (clock face)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFDE7";
    ctx.fill();
    ctx.strokeStyle = "#5D4037";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner ring
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
    ctx.strokeStyle = "#8D6E63";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Hour ticks
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 / 12) * i - Math.PI / 2;
      const inner = r * 0.7;
      const outer = r * 0.85;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.strokeStyle = "#5D4037";
      ctx.lineWidth = i % 3 === 0 ? 2 : 1;
      ctx.stroke();
    }

    // Animated hands – use frameCount so they spin
    const t = frameCount;
    // Minute hand
    const minAngle = (t * 0.02) - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(minAngle) * r * 0.65, cy + Math.sin(minAngle) * r * 0.65);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Hour hand
    const hrAngle = (t * 0.002) - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hrAngle) * r * 0.45, cy + Math.sin(hrAngle) * r * 0.45);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Centre dot
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = "#D32F2F";
    ctx.fill();

    // Small bell / nub on top
    ctx.beginPath();
    ctx.arc(cx, cy - r - 4, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#5D4037";
    ctx.fill();

    ctx.restore();
  }

  function spawnClock() {
    // Place clock at the right edge so it scrolls in like pipes.
    // Random Y within playable area (avoid floor and ceiling).
    const marginY = CLOCK_SIZE + 30;
    const y = marginY + Math.random() * (H - marginY * 2 - 40); // 40 = floor height

    // Position clock before the next pipe: half an interval ahead of the last pipe,
    // or at the right edge if there are no pipes yet.
    const lastPipe = pipes[pipes.length - 1];
    const interval = currentPipeInterval();
    let x;
    if (lastPipe) {
      x = lastPipe.x + interval / 2;
      // Ensure it is at least off-screen to the right
      if (x < W + CLOCK_SIZE) x = W + CLOCK_SIZE;
    } else {
      x = W + CLOCK_SIZE;
    }

    clocks.push({ x: x, y: y, prevX: x });
  }

  function updateClocks() {
    // Slow-down timer
    if (slowdownTimer > 0) slowdownTimer--;

    // Spawn a clock at every CLOCK_SCORE_INTERVAL milestone starting at CLOCK_MIN_SCORE
    if (score >= CLOCK_MIN_SCORE && score % CLOCK_SCORE_INTERVAL === 0 && score !== lastClockScore && clocks.length < CLOCK_MAX_ACTIVE) {
      lastClockScore = score;
      spawnClock();
    }

    // Move clocks horizontally with the game (same speed as pipes)
    const clockSpeed = currentPipeSpeed();
    clocks.forEach(function (c) { c.x -= clockSpeed; });

    // Collision with bird
    clocks = clocks.filter(function (c) {
      const dx = c.x - bird.x;
      const dy = c.y - bird.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CLOCK_SIZE + bird.size) {
        // Collected! – calculate duration sufficient to score one point
        const baseSpeed = isHardMode()
          ? Math.min(HARD_MODE_MAX_SPEED, HARD_MODE_INITIAL_SPEED + (score - HARD_MODE_THRESHOLD) * HARD_MODE_SPEED_INCREMENT)
          : PIPE_SPEED;
        const interval = currentPipeInterval();
        slowdownTimer = Math.min(1500, Math.ceil(interval / (baseSpeed * CLOCK_SLOWDOWN_FACTOR)));
        playClockSound();
        spawnStars(c.x, c.y);
        return false; // remove this clock
      }
      return true;
    });

    // Remove clocks that scrolled off the left edge
    clocks = clocks.filter(function (c) { return c.x + CLOCK_SIZE > 0; });
  }

  function drawClocks() {
    clocks.forEach(function (c) {
      drawClock(c.x, c.y, CLOCK_SIZE);
    });
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
    usedProblems.clear();
    score = 0;
    lives = INITIAL_MAX_LIVES;
    invincibleTimer = 0;
    extraLivesAwarded = 0;
    hardModeActivated = false;
    pendingHardMode = false;
    hardModeTriggerPipe = null;
    frameCount = 0;
    gameRunning = true;
    gameOver = false;
    backgroundOffset = 0;
    clocks = [];
    slowdownTimer = 0;
    lastClockScore = 0;
    // Initialise interpolation state so the first rendered frame is correct
    prevBirdY = H / 2;
    prevBirdRotation = 0;
    prevBackgroundOffset = 0;
  }

  // ---- Game loop ----
  function update() {
    if (!gameRunning) return;

    frameCount++;
    const speed = currentPipeSpeed();
    backgroundOffset += speed;

    // Bird physics (apply clock slow-down to gravity for easier control)
    const grav = slowdownTimer > 0 ? GRAVITY * CLOCK_SLOWDOWN_FACTOR : GRAVITY;
    bird.vy += grav;
    bird.y += bird.vy;
    bird.rotation = Math.min(bird.vy * 0.06, 0.5);

    // Flap animation timer
    if (bird.flapAnim > 0) bird.flapAnim--;

    // Invincibility timer
    if (invincibleTimer > 0) invincibleTimer--;

    // Floor / ceiling (no life penalty, just reposition)
    if (bird.y + bird.size > H - 40) {
      bird.y = H - 40 - bird.size;
      bird.vy = FLAP_STRENGTH * 0.6;
    }
    if (bird.y - bird.size < 0) {
      bird.y = bird.size;
      bird.vy = 0;
    }

    // Spawn pipes (delay the first pipe to give the player time to read)
    const lastPipe = pipes[pipes.length - 1];
    const interval = currentPipeInterval();
    if (frameCount > 120 && (!lastPipe || lastPipe.x < W - interval)) {
      pipes.push(createPipe(W + 20));
    }

    // Move pipes
    pipes.forEach((p) => (p.x -= speed));

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
          if (!hardModeActivated && !pendingHardMode && score >= HARD_MODE_THRESHOLD) {
            pendingHardMode = true;
            hardModeTriggerPipe = pipe;
          }
          playCorrectSound();
          spawnStars(bird.x + 30, bird.y);
          checkUnlocks();

          // Award an extra life at every EXTRA_LIFE_INTERVAL milestone
          const milestonesReached = Math.floor(score / EXTRA_LIFE_INTERVAL);
          while (extraLivesAwarded < milestonesReached) {
            extraLivesAwarded++;
            lives++;
          }
        } else {
          playWrongSound();
          if (score > 0) score--;
        }
      }
    }

    // Activate hard mode only after bird fully clears the trigger pipe
    if (pendingHardMode && hardModeTriggerPipe) {
      const br = bird.size * 0.85;
      // If pipe already scrolled off-screen, bird has long since cleared it
      const pipeGone = !pipes.includes(hardModeTriggerPipe);
      if (pipeGone || bird.x - br > hardModeTriggerPipe.x + hardModeTriggerPipe.width) {
        hardModeActivated = true;
        pendingHardMode = false;
        hardModeTriggerPipe = null;
      }
    }

    updateParticles();
    updateClocks();
  }

  function draw() {
    drawBackground();
    drawPipes();
    drawClocks();
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
    drawSlowdownIndicator();
    drawQuestionBanner();
    drawUnlockNotification();
  }

  // ---- Interpolation helpers ----
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function savePrevState() {
    prevBirdY = bird.y;
    prevBirdRotation = bird.rotation;
    prevBackgroundOffset = backgroundOffset;
    for (let i = 0; i < pipes.length; i++) pipes[i].prevX = pipes[i].x;
    for (let i = 0; i < clocks.length; i++) clocks[i].prevX = clocks[i].x;
    for (let i = 0; i < particles.length; i++) {
      particles[i].prevX = particles[i].x;
      particles[i].prevY = particles[i].y;
    }
  }

  function gameLoop(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    let elapsed = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    // Clamp to avoid spiral of death after tab switch or long pause
    if (elapsed > 200) elapsed = 200;

    accumulator += elapsed;

    // Run simulation in fixed-size steps so speed is the same on all devices
    while (accumulator >= FRAME_DURATION) {
      savePrevState();
      update();
      accumulator -= FRAME_DURATION;
    }

    // Interpolation factor: how far we are between the last two simulation ticks.
    // Rendering at sub-frame positions lets 120 Hz+ screens show smoother motion
    // and reduces visible stutter on slower devices, while game pacing stays fixed.
    const alpha = accumulator / FRAME_DURATION;

    // Temporarily replace positions with interpolated values for rendering
    const simBirdY = bird.y;
    const simBirdRot = bird.rotation;
    const simBgOffset = backgroundOffset;
    bird.y = lerp(prevBirdY, bird.y, alpha);
    bird.rotation = lerp(prevBirdRotation, bird.rotation, alpha);
    backgroundOffset = lerp(prevBackgroundOffset, backgroundOffset, alpha);

    for (let i = 0; i < pipes.length; i++) {
      pipes[i].simX = pipes[i].x;
      pipes[i].x = lerp(pipes[i].prevX, pipes[i].x, alpha);
    }
    for (let i = 0; i < clocks.length; i++) {
      clocks[i].simX = clocks[i].x;
      clocks[i].x = lerp(clocks[i].prevX, clocks[i].x, alpha);
    }
    for (let i = 0; i < particles.length; i++) {
      particles[i].simX = particles[i].x;
      particles[i].simY = particles[i].y;
      particles[i].x = lerp(particles[i].prevX, particles[i].x, alpha);
      particles[i].y = lerp(particles[i].prevY, particles[i].y, alpha);
    }

    draw();

    // Restore actual simulation state so the next update() works with correct values
    bird.y = simBirdY;
    bird.rotation = simBirdRot;
    backgroundOffset = simBgOffset;
    for (let i = 0; i < pipes.length; i++) pipes[i].x = pipes[i].simX;
    for (let i = 0; i < clocks.length; i++) clocks[i].x = clocks[i].simX;
    for (let i = 0; i < particles.length; i++) {
      particles[i].x = particles[i].simX;
      particles[i].y = particles[i].simY;
    }

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

  // ---- Leaderboard helpers ----
  function loadLeaderboardLocal() {
    try {
      const data = localStorage.getItem(LEADERBOARD_KEY);
      return data ? JSON.parse(data) : [];
    } catch (_) {
      return [];
    }
  }

  function saveLeaderboardLocal(board) {
    try {
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(board));
    } catch (_) { /* storage full or unavailable */ }
  }

  async function loadLeaderboard() {
    if (_firestoreDb) {
      try {
        var snapshot = await _firestoreDb.collection(_collectionName)
          .orderBy("score", "desc")
          .limit(MAX_LEADERBOARD)
          .get();
        return snapshot.docs.map(function(doc) { return doc.data(); });
      } catch (e) {
        console.warn("Firebase loadLeaderboard failed:", e.message);
      }
    }
    return loadLeaderboardLocal();
  }

  async function qualifiesForLeaderboard(newScore) {
    if (newScore <= 0) return false;
    var board = await loadLeaderboard();
    if (board.length < MAX_LEADERBOARD) return true;
    return newScore > board[board.length - 1].score;
  }

  async function addToLeaderboard(name, newScore) {
    if (_firestoreDb) {
      try {
        await _firestoreDb.collection(_collectionName).add({
          name: String(name).slice(0, 20).trim(),
          score: Math.max(0, Math.trunc(Number(newScore) || 0)),
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
        var board = await loadLeaderboard();
        return board.findIndex(function(e) {
          return e.name === name && e.score === newScore;
        });
      } catch (e) {
        console.warn("Firebase addToLeaderboard failed:", e.message);
      }
    }
    // Fallback to localStorage
    var localBoard = loadLeaderboardLocal();
    localBoard.push({ name: name, score: newScore });
    localBoard.sort(function(a, b) { return b.score - a.score; });
    if (localBoard.length > MAX_LEADERBOARD) localBoard.length = MAX_LEADERBOARD;
    saveLeaderboardLocal(localBoard);
    return localBoard.findIndex(function(e) {
      return e.name === name && e.score === newScore;
    });
  }

  async function renderLeaderboard(highlightIndex) {
    const board = await loadLeaderboard();
    leaderboardBody.innerHTML = "";
    if (board.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.style.color = "#aaa";
      td.textContent = "אֵין שִׂיאִים עֲדַיִן";
      tr.appendChild(td);
      leaderboardBody.appendChild(tr);
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    board.forEach((entry, i) => {
      const tr = document.createElement("tr");
      if (highlightIndex !== undefined && i === highlightIndex) {
        tr.classList.add("highlight");
      }
      const tdPlace = document.createElement("td");
      tdPlace.textContent = medals[i] || (i + 1);
      const tdName = document.createElement("td");
      tdName.textContent = entry.name;
      const tdScore = document.createElement("td");
      tdScore.textContent = entry.score;
      tr.appendChild(tdPlace);
      tr.appendChild(tdName);
      tr.appendChild(tdScore);
      leaderboardBody.appendChild(tr);
    });
  }

  async function endGame() {
    gameRunning = false;
    gameOver = true;
    // bestScore is already persisted by checkUnlocks() during gameplay;
    // this covers the case where no new unlocks occurred
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem("kirbyBestScore", bestScore);
    }
    finalScoreEl.textContent = score;
    bestScoreValueEl.textContent = bestScore;

    if (await qualifiesForLeaderboard(score)) {
      nameInputSection.classList.remove("hidden");
      playerNameInput.value = "";
      playerNameInput.focus();
    } else {
      nameInputSection.classList.add("hidden");
    }

    await renderLeaderboard();
    gameOverScreen.classList.remove("hidden");
  }

  async function handleSaveScore() {
    const name = playerNameInput.value.trim();
    if (!name) {
      playerNameInput.focus();
      return;
    }
    saveScoreBtn.disabled = true;
    try {
      const idx = await addToLeaderboard(name, score);
      nameInputSection.classList.add("hidden");
      await renderLeaderboard(idx);
    } finally {
      saveScoreBtn.disabled = false;
    }
  }

  saveScoreBtn.addEventListener("click", handleSaveScore);
  // Stop propagation on name input key events so game controls (e.g. Space to flap) don't fire
  playerNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveScore();
    }
    e.stopPropagation();
  });
  playerNameInput.addEventListener("keyup", (e) => e.stopPropagation());
  playerNameInput.addEventListener("keypress", (e) => e.stopPropagation());

  function startGame() {
    initAudio();
    if (!allMuted) startMusic();
    resetGame();
    // Give an initial flap so Kirby doesn't fall immediately
    bird.vy = FLAP_STRENGTH;
    startScreen.classList.add("hidden");
    gameOverScreen.classList.add("hidden");
    customizeScreen.classList.add("hidden");
    lastFrameTime = 0;
    accumulator = 0;
    requestAnimationFrame(gameLoop);
  }

  function flap() {
    if (!gameRunning) return;
    // Apply clock slow-down to flap strength for easier control
    bird.vy = slowdownTimer > 0 ? FLAP_STRENGTH * CLOCK_SLOWDOWN_FACTOR : FLAP_STRENGTH;
    bird.flapAnim = 14;
    playFlapSound();
  }

  // ---- Unlock checking ----
  function checkUnlocks() {
    if (score <= bestScore) return; // only check on new personal bests
    var newlyUnlocked = [];
    for (var key in SKINS) {
      if (SKINS[key].unlock > bestScore && SKINS[key].unlock <= score) {
        newlyUnlocked.push(SKINS[key].name);
      }
    }
    for (var key in ACCESSORIES) {
      if (ACCESSORIES[key].unlock > bestScore && ACCESSORIES[key].unlock <= score) {
        newlyUnlocked.push(ACCESSORIES[key].name);
      }
    }
    // Update bestScore immediately during play
    bestScore = score;
    localStorage.setItem("kirbyBestScore", bestScore);
    if (newlyUnlocked.length > 0) {
      unlockNotification = { text: "🎉 !פְּרִיט חָדָשׁ נִפְתַּח", timer: 120 };
    }
  }

  function drawUnlockNotification() {
    if (unlockNotification.timer <= 0) return;
    unlockNotification.timer--;
    var alpha = Math.min(1, unlockNotification.timer / 20);
    var slideY = 0;
    if (unlockNotification.timer > 100) {
      slideY = (120 - unlockNotification.timer) * 2;
    } else if (unlockNotification.timer < 20) {
      slideY = 40;
      alpha = unlockNotification.timer / 20;
    } else {
      slideY = 40;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    var bannerW = 300;
    var bannerH = 40;
    var bx = (W - bannerW) / 2;
    var by = H - 80 - slideY;
    ctx.fillStyle = "rgba(50, 50, 50, 0.85)";
    roundRect(bx, by, bannerW, bannerH, 12);
    ctx.fill();
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = "bold 18px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFD700";
    ctx.fillText(unlockNotification.text, W / 2, by + bannerH / 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---- Customization screen ----
  function openCustomizeScreen() {
    startScreen.classList.add("hidden");
    gameOverScreen.classList.add("hidden");
    customizeScreen.classList.remove("hidden");
    bestScoreDisplayEl.textContent = bestScore;
    buildCustomizeGrid();
    updatePreview();
  }

  function closeCustomizeScreen() {
    customizeScreen.classList.add("hidden");
    startScreen.classList.remove("hidden");
    drawIdleScreen();
  }

  function buildCustomizeGrid() {
    skinsGrid.innerHTML = "";
    var totalSkins = 0;
    var unlockedSkins = 0;
    for (var key in SKINS) {
      totalSkins++;
      var skin = SKINS[key];
      var unlocked = bestScore >= skin.unlock;
      if (unlocked) unlockedSkins++;
      var selected = key === selectedSkin;
      var card = document.createElement("div");
      card.className = "item-card" + (selected ? " selected" : "") + (unlocked ? "" : " locked");
      card.dataset.key = key;
      card.dataset.type = "skin";

      var icon = document.createElement("div");
      icon.className = "item-icon";
      icon.style.backgroundColor = skin.body;
      icon.style.border = "2px solid " + skin.stroke;
      icon.style.borderRadius = "50%";

      var name = document.createElement("div");
      name.className = "item-name";
      name.textContent = skin.name;

      card.appendChild(icon);
      card.appendChild(name);

      if (!unlocked) {
        var lock = document.createElement("div");
        lock.className = "item-lock";
        lock.textContent = "🔒 " + skin.unlock;
        card.appendChild(lock);
      }

      card.addEventListener("click", onItemClick);
      skinsGrid.appendChild(card);
    }
    skinsProgressEl.textContent = "(" + unlockedSkins + "/" + totalSkins + ")";

    accessoriesGrid.innerHTML = "";
    var totalAcc = 0;
    var unlockedAcc = 0;
    for (var key in ACCESSORIES) {
      totalAcc++;
      var acc = ACCESSORIES[key];
      var unlocked = bestScore >= acc.unlock;
      if (unlocked) unlockedAcc++;
      var selected = key === selectedAccessory;
      var card = document.createElement("div");
      card.className = "item-card" + (selected ? " selected" : "") + (unlocked ? "" : " locked");
      card.dataset.key = key;
      card.dataset.type = "accessory";

      var icon = document.createElement("div");
      icon.className = "item-icon";
      icon.textContent = acc.emoji;

      var name = document.createElement("div");
      name.className = "item-name";
      name.textContent = acc.name;

      card.appendChild(icon);
      card.appendChild(name);

      if (!unlocked) {
        var lock = document.createElement("div");
        lock.className = "item-lock";
        lock.textContent = "🔒 " + acc.unlock;
        card.appendChild(lock);
      }

      card.addEventListener("click", onItemClick);
      accessoriesGrid.appendChild(card);
    }
    accessoriesProgressEl.textContent = "(" + unlockedAcc + "/" + totalAcc + ")";
  }

  function onItemClick(e) {
    var card = e.currentTarget;
    if (card.classList.contains("locked")) return;
    var key = card.dataset.key;
    var type = card.dataset.type;
    if (type === "skin") {
      selectedSkin = key;
      localStorage.setItem("kirbySelectedSkin", selectedSkin);
    } else {
      selectedAccessory = key;
      localStorage.setItem("kirbySelectedAccessory", selectedAccessory);
    }
    buildCustomizeGrid();
    updatePreview();
  }

  function updatePreview() {
    var pCtx = previewCtx;
    var pw = previewCanvas.width;
    var ph = previewCanvas.height;
    pCtx.clearRect(0, 0, pw, ph);
    // Light sky background
    pCtx.fillStyle = "rgba(135, 206, 235, 0.3)";
    pCtx.fillRect(0, 0, pw, ph);
    drawKirby(pw / 2, ph / 2, 35, 0, 0, pCtx);
  }

  // ---- Event listeners ----
  customizeBtn.addEventListener("click", openCustomizeScreen);
  customizeBtnGameOver.addEventListener("click", openCustomizeScreen);
  customizeBackBtn.addEventListener("click", closeCustomizeScreen);
  startBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", startGame);
  muteBtn.addEventListener("click", toggleMute);

  // Apply persisted mute state to button text on load
  if (allMuted) {
    muteBtn.textContent = "🔇 קוֹל כָּבוּי";
  }

  // Resume AudioContext when the tab regains visibility (browser may suspend it)
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      ensureAudioResumed();
    }
  });

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
