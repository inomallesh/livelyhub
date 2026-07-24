// js/firebase-config.js
// Fill in your own Firebase project config below.
// Get this from: Firebase Console > Project Settings > General > Your apps > SDK setup
// This uses the Firebase Modular SDK loaded straight from Google's CDN as an
// ES module — no npm install, no bundler, works in a plain <script type="module">.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD6VsVa-s23mEn5s2TkqPdyNPCYR4D51Q0",
  authDomain: "livelyhub-b75a0.firebaseapp.com",
  databaseURL: "https://livelyhub-b75a0-default-rtdb.firebaseio.com",
  projectId: "livelyhub-b75a0",
  storageBucket: "livelyhub-b75a0.firebasestorage.app",
  messagingSenderId: "885842871186",
  appId: "1:885842871186:web:52174cea19bbbebe60774b",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
