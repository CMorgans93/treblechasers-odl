// firebase-init.js
// TrebleChasers ODL Firebase Central Connection

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtWUo8-OlZp8c06jhkEjRwyK1Q4s9GlaA",
  authDomain: "treblechasersodl-f7abe.firebaseapp.com",
  projectId: "treblechasersodl-f7abe",
  storageBucket: "treblechasersodl-f7abe.firebasestorage.app",
  messagingSenderId: "310895501905",
  appId: "1:310895501905:web:79412e33dc100781ea0e70",
  measurementId: "G-NY6D0EP97L"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  app,
  auth,
  db,
  onAuthStateChanged,
  signOut,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
};