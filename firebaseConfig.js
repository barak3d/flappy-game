// firebaseConfig.js — Firebase project configuration
//
// Dedicated Firebase project for flappy-game (barak3d/flappy-game).
//
// ─── SECURITY NOTICE ──────────────────────────────────────────────────────────
// Firebase Web API keys are NOT secrets. Google explicitly designs them to be
// included in client-side code (see https://firebase.google.com/support/guides/security-checklist).
// They are project *identifiers* — similar to a username, not a password.
// Access control is enforced by Firestore Security Rules and by restricting
// the key to your domain in the Google Cloud Console.
// ──────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBDqvv82aBViHmSDu2dgQ3JGNbNTqflMqE",
  authDomain: "flappy-game-9d235.firebaseapp.com",
  projectId: "flappy-game-9d235",
  storageBucket: "flappy-game-9d235.firebasestorage.app",
  messagingSenderId: "798097424289",
  appId: "1:798097424289:web:55b618b92931905a7815e0",
};

// eslint-disable-next-line no-unused-vars
const FLAPPY_COLLECTION_NAME = "flappy-leaderboard";
