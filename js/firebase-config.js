// js/firebase-config.js
// Fill in your own Firebase project config below.
// Get this from: Firebase Console > Project Settings > General > Your apps > SDK setup
// This uses the Firebase Modular SDK loaded straight from Google's CDN as an
// ES module — no npm install, no bundler, works in a plain <script type="module">.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const env = (typeof window !== "undefined" && window.__ENV__) || globalThis.process?.env || {};

const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY ,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  databaseURL: env.FIREBASE_DATABASE_URL ,
  projectId: env.FIREBASE_PROJECT_ID ,
  storageBucket: env.FIREBASE_STORAGE_BUCKET ,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID ,
  appId: env.FIREBASE_APP_ID ,
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
