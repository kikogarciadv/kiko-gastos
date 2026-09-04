import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey:            "AIzaSyDPz0Z9BCYfxvGRZta9HyYNJ9swvQ6eDcE",
  authDomain:        "kiko-gastos.firebaseapp.com",
  projectId:         "kiko-gastos",
  storageBucket:     "kiko-gastos.firebasestorage.app",
  messagingSenderId: "747835066810",
  appId:             "1:747835066810:web:2d0c4c55f2b389d14d3583"
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// Persistencia offline (datos disponibles sin internet)
enableIndexedDbPersistence(db).catch(() => {});
