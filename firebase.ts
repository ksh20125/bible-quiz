import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Replace with your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyCviP3HNQzW5wprOC1O1GPgs_UT0wFPnKg",
  authDomain: "bible-quiz-490206.firebaseapp.com",
  projectId: "bible-quiz-490206",
  storageBucket: "bible-quiz-490206.firebasestorage.app",
  messagingSenderId: "416363170335",
  appId: "1:416363170335:web:266eb4f892a24dc275e32a",
  measurementId: "G-KM7KWD1B7P"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
