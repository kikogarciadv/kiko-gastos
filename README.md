# 💸 KikoGastos

Control financiero personal · PWA instalable en iPhone · Firebase + GitHub Pages

---

## ✅ PASOS PARA PONERLO EN MARCHA

### 1️⃣ Crear proyecto en Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com)
2. **Crear proyecto** → ponle nombre (ej: `kiko-gastos`) → Continuar
3. Desactiva Google Analytics si no lo quieres → Crear proyecto

---

### 2️⃣ Activar autenticación con Google

1. En el menú lateral → **Authentication** → Empezar
2. Pestaña **Sign-in method** → **Google** → Activar
3. Pon tu email de soporte → Guardar

---

### 3️⃣ Crear base de datos Firestore

1. Menú lateral → **Firestore Database** → Crear base de datos
2. Elige **Modo de producción** → Siguiente
3. Selecciona una región (ej: `europe-west1`) → Listo

4. Ve a la pestaña **Reglas** y pega esto:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```
5. Pulsa **Publicar**

---

### 4️⃣ Obtener la configuración de Firebase

1. Menú lateral → ⚙️ **Configuración del proyecto** → pestaña **General**
2. Scroll abajo → **Tus aplicaciones** → icono `</>` (Web)
3. Ponle un nombre (ej: `kiko-gastos-web`) → Registrar app
4. Copia el objeto `firebaseConfig` que aparece

---

### 5️⃣ Pegar la config en el proyecto

Abre el archivo **`firebase-config.js`** y reemplaza los valores:

```js
const firebaseConfig = {
  apiKey:            "AIza...",
  authDomain:        "kiko-gastos.firebaseapp.com",
  projectId:         "kiko-gastos",
  storageBucket:     "kiko-gastos.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...:web:abc..."
};
```

---

### 6️⃣ Subir a GitHub

```bash
# En la carpeta del proyecto:
git init
git add .
git commit -m "feat: initial KikoGastos app"

# Crear repo en GitHub (hazlo en github.com primero)
git remote add origin https://github.com/TU_USUARIO/kiko-gastos.git
git branch -M main
git push -u origin main
```

---

### 7️⃣ Activar GitHub Pages

1. En tu repo de GitHub → **Settings** → **Pages**
2. Source → **GitHub Actions**
3. El workflow se ejecutará automáticamente al hacer push
4. Tu app estará en: `https://TU_USUARIO.github.io/kiko-gastos/`

---

### 8️⃣ Añadir el dominio a Firebase Auth

1. Firebase Console → **Authentication** → **Settings** → **Dominios autorizados**
2. Añade: `TU_USUARIO.github.io`

---

### 9️⃣ Generar los iconos PNG

1. Abre `icons/generate.html` en tu navegador
2. Descarga `icon-192.png` y `icon-512.png`
3. Ponlos en la carpeta `icons/`
4. Haz commit y push de los iconos

---

### 📱 Instalar en iPhone

1. Abre Safari → Ve a tu URL de GitHub Pages
2. Pulsa el botón **Compartir** (cuadrado con flecha)
3. → **Añadir a pantalla de inicio**
4. ✅ La app queda instalada como si fuera nativa

---

## 📂 Estructura del proyecto

```
kiko-gastos/
├── index.html          # Shell HTML
├── app.js              # Lógica principal
├── style.css           # Estilos (dark mode, mobile-first)
├── firebase-config.js  # ⚠️ Pega aquí tu config
├── manifest.json       # Config PWA
├── sw.js               # Service Worker (offline)
├── icons/
│   ├── icon.svg        # Icono fuente
│   ├── generate.html   # Generador de PNGs
│   ├── icon-192.png    # (generar y añadir)
│   └── icon-512.png    # (generar y añadir)
└── .github/workflows/
    └── pages.yml       # Deploy automático
```

---

## 🗂 Categorías disponibles

**Gastos:** Gastos Fijos · Ocio · Viajes · Ropa · Comida · Inversión · Transporte · Alimentación · Salud · Gasolina · Educación · Otros

**Ingresos:** Nómina · Bizum · Apuestas · Otros

---

## 💡 Cómo funciona

- **Mi Cuenta** → tus gastos e ingresos reales. Muestra balance mensual.
- **Tarjeta Mamá** → gastos con la tarjeta de tu madre. Se registran aparte y **no afectan a tu balance**.
- Los datos se sincronizan en tiempo real entre dispositivos vía Firestore.
- La app funciona offline gracias al Service Worker + persistencia de Firestore.
