// firebaseConfig.js — Firebase project configuration
//
// Uses the same Firebase project as space-racer (barak3d/space-racer)
// with a separate Firestore collection for this game.
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
  authDomain: "space-racer-7d447.firebaseapp.com",
  projectId: "space-racer-7d447",
  storageBucket: "space-racer-7d447.firebasestorage.app",
  messagingSenderId: "836177941752",
  appId: "1:836177941752:web:8bffb1aa3f8c86ac19970d",
};

// eslint-disable-next-line no-unused-vars
const FLAPPY_COLLECTION_NAME = "flappy-leaderboard";
