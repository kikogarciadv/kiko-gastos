import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ⚠️ RELLENA AQUÍ CON TU CONFIGURACIÓN DE FIREBASE
// Ve a console.firebase.google.com → Tu proyecto → Configuración → Tus apps → Config
const firebaseConfig = {
  apiKey:            "AQUI_TU_API_KEY",
  authDomain:        "AQUI_TU_PROJECT.firebaseapp.com",
  projectId:         "AQUI_TU_PROJECT_ID",
  storageBucket:     "AQUI_TU_PROJECT.appspot.com",
  messagingSenderId: "AQUI_TU_SENDER_ID",
  appId:             "AQUI_TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// Persistencia offline (datos disponibles sin internet)
enableIndexedDbPersistence(db).catch(() => {});
