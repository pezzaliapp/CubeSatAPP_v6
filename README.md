# 🛰️ CubeSatAPP — CesiumJS TLE Orbit Viewer (PWA)

**v6.0 — capolavoro laptop + iPhone**  
Licenza **MIT 2025** · Autore **pezzaliAPP**

## ✨ Perché questa versione
Progettata come se il miglior sviluppatore frontend/graphics l'avesse costruita da zero: robusta, elegante, accessibile. Unisce **CesiumJS** + **satellite.js** con una UX studiata per **laptop** e **iPhone**.

## 🚀 Feature principali
- TLE → **orbita 3D** con etichetta Alt/Vel in tempo reale
- **Telemetria live** (Altitudine, Velocità, Lat/Lon) + **Subsolare, Azimut/Elev** del Sole
- **Velocità simulazione** configurabile, play/pause, reset
- **CSV export** della traiettoria campionata
- **URL share** (Web Share API / clipboard fallback)
- **Drag&drop** file TLE, persistenza **localStorage**
- **PWA offline** con Service Worker v6 (stale‑while‑revalidate)
- Layout **responsive**: griglia 2‑colonne su desktop, singola colonna su mobile
- **Scorciatoie**: `L` play/pause · `R` reset · `?` guida

## 📦 Avvio rapido
1. Apri `index.html` in un browser moderno (Chrome/Edge/Firefox/Safari).  
2. Incolla due righe TLE o trascina un `.txt`.  
3. Premi **Simula** → **Play/Pause**.  
4. Esporta CSV o condividi la configurazione.

## 🛠️ Stack
- CesiumJS 1.120 · satellite.js 4.0  
- HTML/CSS/JS vanilla · PWA (manifest + SW)  
- Nessuna dipendenza cloud

## 📄 Licenza
MIT © 2025 — uso libero per scopi educativi/scientifici.
