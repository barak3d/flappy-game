# Kirby's Math Flight 🌟

A flappy-bird style HTML5 game designed to help first graders practice arithmetic!

## How to Play

- **Flap**: Press `Space` or tap/click the screen to make Kirby fly
- **Solve**: Each set of pipes shows a math problem at the top — fly through the gap with the **correct answer**
- **Score**: Earn points for every correct answer!

## Features

- 🎮 Classic flappy-bird gameplay
- 🧮 First-grade addition and subtraction problems
- 🩷 Kirby-inspired character drawn with Canvas API
- 🎵 Procedural background music using Web Audio API
- ⭐ Star particle effects on correct answers
- 📱 Touch-friendly — works on mobile and desktop

## Running Locally

Just open `index.html` in a modern web browser — no build step required!

```bash
# Or use any local server, e.g.:
npx serve .
```

## CI/CD

This project uses GitHub Actions to automatically deploy to GitHub Pages when changes are merged to `main`. See `.github/workflows/deploy.yml`.

## Tech Stack

- Vanilla HTML5, CSS3, JavaScript
- Canvas API for rendering
- Web Audio API for sound effects and music
- No external dependencies