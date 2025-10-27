/* CubeSatAPP v6.1 — CesiumJS + satellite.js — capolavoro di robustezza e UX */
'use strict';

/* iOS fullheight fix */
(function(){
  const setVH = () => document.documentElement.style.setProperty('--vh', (window.innerHeight||0) * 0.01 + 'px');
  window.addEventListener('resize', setVH, {passive:true});
  window.addEventListener('orientationchange', setVH, {passive:true});
  setVH();
})();

/* Shorthands */
const $ = (sel) => document.querySelector(sel);
const logEl = $('#log');
const statusEl = $('#status');
function log(msg){ try{ logEl.textContent = (logEl.textContent + '\n' + msg).slice(-4000); logEl.scrollTop = logEl.scrollHeight; }catch(_){} }
function setStatus(msg){ if(statusEl){ statusEl.textContent = msg; } }

/* Install prompt */
let deferredPrompt=null;
const btnInstall = $('#btnInstall');
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt=e; if(btnInstall) btnInstall.hidden=false; });
btnInstall?.addEventListener('click', async()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; btnInstall.hidden=true; });

/* Service Worker */
if('serviceWorker' in navigator){ navigator.serviceWorker.register('./service-worker.js').catch(()=>{}); }

/* Cesium Viewer base */
Cesium.Ion.defaultAccessToken = undefined;
const viewer = new Cesium.Viewer('viewer', {
  imageryProvider: new Cesium.UrlTemplateImageryProvider({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', credit: '© OpenStreetMap contributors' }),
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  animation: true, timeline: true, baseLayerPicker: false, geocoder: false, homeButton: true, sceneModePicker: true, navigationHelpButton: false, fullscreenButton: false,
});
viewer.scene.globe.enableLighting = true;
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 900_000;
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 60_000_000;
viewer.scene.requestRenderMode = true;
viewer.scene.maximumRenderTimeChange = Infinity;
viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
viewer.clock.multiplier = 60; /* default */
viewer.clock.shouldAnimate = false;
viewer.clock.onTick.addEventListener(()=> viewer.scene.requestRender());

/* HUD refs */
const hudClock = $('#hudClock');
const hudAlt = $('#hudAlt');
const hudVel = $('#hudVel');

/* UI refs */
const elTLE = $('#tle');
const elMinutes = $('#minutes');
const elStep = $('#step');
const elMult = $('#mult');
const elSim = $('#simulate');
const elPlay = $('#play');
const elReset = $('#reset');
const elExport = $('#btnExportCSV');
const btnShare = $('#btnShare');
const btnHelp = $('#btnHelp');
const dlgHelp = $('#helpDialog');
const telemetryEl = $('#telemetry');
const sunEl = $('#suninfo');

/* Persistence */
const LS_KEY = 'cubesatapp:v6';
function saveState(){
  try {
    const st = { tle: elTLE?.value||'', minutes: +elMinutes.value||120, step: +elStep.value||30, mult: +elMult.value||60 };
    localStorage.setItem(LS_KEY, JSON.stringify(st));
  } catch(_) {}
}
function loadState(){
  try {
    const u = new URL(location.href);
    const qsTLE = u.searchParams.get('tle');
    const st = JSON.parse(localStorage.getItem(LS_KEY)||'null');
    if(qsTLE){
      elTLE.value = decodeURIComponent(qsTLE);
      const m = +u.searchParams.get('minutes'); if(m) elMinutes.value = m;
      const s = +u.searchParams.get('step'); if(s) elStep.value = s;
      const mu = +u.searchParams.get('mult'); if(mu) elMult.value = mu;
    }else if(st){
      elTLE.value = st.tle||elTLE.value;
      elMinutes.value = st.minutes||120;
      elStep.value = st.step||30;
      elMult.value = st.mult||60;
    } else {
      elTLE.value = `ISS (ZARYA)\n1 25544U 98067A   24299.50000000  .00016717  00000-0  10270-3 0  9995\n2 25544  51.6437  28.9044 0005712  35.3822  65.1452 15.50386381445585`;
    }
  } catch(_) {}
}
loadState();

/* Entities */
let satEntity = null;
let samples = null; // SampledPositionProperty for CSV export

/* Drag & Drop TLE */
(function setupDrop(){
  const area = elTLE;
  if(!area) return;
  area.addEventListener('dragover', (e)=>{ e.preventDefault(); area.classList.add('drag'); });
  area.addEventListener('dragleave', ()=> area.classList.remove('drag'));
  area.addEventListener('drop', async(e)=>{
    e.preventDefault(); area.classList.remove('drag');
    const f = e.dataTransfer?.files?.[0]; if(!f) return;
    const text = await f.text();
    area.value = text.trim();
    saveState();
  });
})();

/* Utilities */
function buildPositionsFromTLE(tleLine1, tleLine2, minutes=120, stepSec=30){
  const satrec = satellite.twoline2satrec(tleLine1.trim(), tleLine2.trim());
  const start = Cesium.JulianDate.now();
  const pos = new Cesium.SampledPositionProperty();
  for(let t=0;t<=minutes*60;t+=stepSec){
    const time = Cesium.JulianDate.addSeconds(start, t, new Cesium.JulianDate());
    const jsDate = Cesium.JulianDate.toDate(time);
    const gmst = satellite.gstime(jsDate);
    const prop = satellite.propagate(satrec, jsDate);
    if(!prop.position) continue;
    const gd = satellite.eciToGeodetic(prop.position, gmst);
    const cart = Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height*1000);
    pos.addSample(time, cart);
  }
  return { pos, start };
}
function meanMotionToPeriodSeconds(tleLine2){
  // columns 53-63 on line 2 (17 char starting at 53) but we parse flexibly
  const mm = parseFloat(tleLine2.trim().split(/\s+/).slice(-1)[0]); // last token is mean motion rev/day
  if(!isFinite(mm)||mm<=0) return null;
  return 86400/mm;
}
function fmt(num, digits=1){ return (isFinite(num)? num.toFixed(digits) : '-') }

/* Sun subsolar calc (approx) */
function sunECEF(jd){
  try{
    const JD = Cesium.JulianDate.toDate(jd).getTime()/86400000 + 2440587.5;
    const T = (JD - 2451545.0) / 36525.0;
    const L0 = (280.46646 + 36000.76983 * T) % 360;
    const M = (357.52911 + 35999.05029 * T) % 360;
    const Mr = Cesium.Math.toRadians(M);
    const C = (1.914602 - 0.004817*T - 0.000014*T*T)*Math.sin(Mr) + (0.019993 - 0.000101*T)*Math.sin(2*Mr) + 0.000289*Math.sin(3*Mr);
    const lambda = Cesium.Math.toRadians((L0 + C) % 360);
    const eps = Cesium.Math.toRadians(23.439 - 0.00000036*T);
    const x = Math.cos(lambda), y = Math.cos(eps)*Math.sin(lambda), z = Math.sin(eps)*Math.sin(lambda);
    const m = Cesium.Transforms.computeIcrfToFixedMatrix(jd);
    return m ? Cesium.Matrix3.multiplyByVector(m, new Cesium.Cartesian3(x,y,z), new Cesium.Cartesian3()) : new Cesium.Cartesian3(x,y,z);
  }catch{ return null; }
}

/* Simulation */
function simulate(){
  try{
    const lines = (elTLE.value||'').split('\n').map(s=>s.trim()).filter(Boolean);
    if(lines.length<2) throw new Error('Inserisci almeno due righe TLE valide.');
    const l1 = lines[lines.length-2];
    const l2 = lines[lines.length-1];
    const minutes = Math.max(1, parseInt(elMinutes.value||'120',10));
    const stepSec = Math.max(1, parseInt(elStep.value||'30',10));

    if(satEntity) viewer.entities.remove(satEntity);
    const { pos/*, start*/ } = buildPositionsFromTLE(l1, l2, minutes, stepSec);
    samples = pos;

    // Label dinamica Alt/Vel live
    const labelText = new Cesium.CallbackProperty(function () {
      try{
        const t = viewer.clock.currentTime;
        const p1 = satEntity?.position?.getValue(t);
        if(!p1) return '';
        const c = Cesium.Cartographic.fromCartesian(p1);
        const alt = (c.height/1000);
        const p2 = satEntity.position.getValue(Cesium.JulianDate.addSeconds(t,1,new Cesium.JulianDate()));
        let vel='';
        if(p2) vel = Cesium.Cartesian3.distance(p1,p2);
        hudAlt.textContent = `Alt ${fmt(alt,0)} km`;
        hudVel.textContent = `Vel ${fmt(vel,0)} m/s`;
        return `${fmt(alt,0)} km • ${fmt(vel,0)} m/s`;
      }catch{ return ''; }
    }, false);

    satEntity = viewer.entities.add({
      name:'CubeSat',
      position: pos,
      point:{ pixelSize:7, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth:2 },
      label:{ text: labelText, showBackground:true, backgroundColor: Cesium.Color.fromAlpha(Cesium.Color.BLACK,0.5), fillColor: Cesium.Color.WHITE, font:'12px sans-serif', pixelOffset:new Cesium.Cartesian2(0,-18), verticalOrigin: Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      path:{ show:true, leadTime:0, trailTime: minutes*60, resolution: stepSec, material: new Cesium.PolylineGlowMaterialProperty({ glowPower:.2, color: Cesium.Color.CYAN }), width:2 },
    });

    // Clock window
    const startTime = pos._property._times[0];
    const stopTime = pos._property._times[pos._property._times.length-1];
    viewer.clock.startTime = startTime.clone();
    viewer.clock.currentTime = startTime.clone();
    viewer.clock.stopTime = stopTime.clone();
    viewer.clock.multiplier = Math.max(1, +elMult.value||60);
    viewer.clock.shouldAnimate = true;

    // Camera safe pose adattiva (desktop vs iPhone)
    viewer.trackedEntity = undefined;
    satEntity.viewFrom = new Cesium.Cartesian3(-9_000_000, 9_000_000, 5_000_000);

    const isIphone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const offset = isIphone
      ? new Cesium.HeadingPitchRange(0.0, Cesium.Math.toRadians(-10), 9_000_000)
      : new Cesium.HeadingPitchRange(0.0, Cesium.Math.toRadians(-35), 12_000_000);

    viewer.flyTo(satEntity, {
      offset,
      duration: isIphone ? 1.2 : 0.0
    });

    // Period from mean motion
    const period = meanMotionToPeriodSeconds(l2);
    updateTelemetryStatic(period);

    setStatus('Simulazione pronta ✅');
    log('Simulazione impostata.');
    saveState();
  }catch(e){
    setStatus('Errore: ' + e.message);
    log(e.stack||e.message);
  }
}

/* Telemetry live */
function updateTelemetryStatic(periodSec){
  const prettyPeriod = periodSec ? `${fmt(periodSec/60,1)} min` : '-';
  const current = `Altitudine: -\nVelocità: -\nPeriodo: ${prettyPeriod}\nLat/Lon: -`;
  telemetryEl.innerHTML = current.replace(/\n/g,'<br>');
}
function onTick(){
  try{
    hudClock.textContent = Cesium.JulianDate.toDate(viewer.clock.currentTime).toISOString().replace('T',' ').replace('Z',' UTC');
    if(!satEntity) return;
    const t = viewer.clock.currentTime;
    const p1 = satEntity.position.getValue(t); if(!p1) return;
    const c = Cesium.Cartographic.fromCartesian(p1);
    const lat = Cesium.Math.toDegrees(c.latitude);
    const lon = Cesium.Math.toDegrees(c.longitude);
    const altKm = c.height/1000;
    const p2 = satEntity.position.getValue(Cesium.JulianDate.addSeconds(t,1,new Cesium.JulianDate()));
    const vel = p2 ? Cesium.Cartesian3.distance(p1,p2) : NaN;

    const latFix = lat.toFixed(5), lonFix = lon.toFixed(5);
    const gmaps = `https://www.google.com/maps/@?api=1&map_action=map&center=${latFix},${lonFix}&zoom=4&basemap=satellite`;
    const osm = `https://www.openstreetmap.org/?mlat=${latFix}&mlon=${lonFix}#map=4/${latFix}/${lonFix}`;
    telemetryEl.innerHTML = `Altitudine: ${fmt(altKm,1)} km<br>Velocità: ${fmt(vel,1)} m/s<br>Periodo: (da TLE)<br>Lat/Lon: ${lat.toFixed(2)}°, ${lon.toFixed(2)}°<br><a href="${gmaps}" target="_blank" rel="noopener">Apri in Google Maps</a> · <a href="${osm}" target="_blank" rel="noopener">OSM</a>`;

    // Sun info
    const s = sunECEF(t);
    if(s && sunEl){
      const dir = Cesium.Cartesian3.normalize(s, new Cesium.Cartesian3());
      const ell = Cesium.Ellipsoid.WGS84;
      const sub = ell.scaleToGeodeticSurface(dir, new Cesium.Cartesian3());
      if(sub){
        const sc = ell.cartesianToCartographic(sub);
        const slat = Cesium.Math.toDegrees(sc.latitude).toFixed(2);
        const slon = Cesium.Math.toDegrees(sc.longitude).toFixed(2);
        const obsECEF = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, 0);
        const enu = Cesium.Transforms.eastNorthUpToFixedFrame(obsECEF);
        const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
        const sunPoint = new Cesium.Cartesian3(dir.x*1e7, dir.y*1e7, dir.z*1e7);
        const local = Cesium.Matrix4.multiplyByPoint(inv, sunPoint, new Cesium.Cartesian3());
        const e = local.x, n = local.y, u = local.z;
        const az = (Math.atan2(e,n)*180)/Math.PI;
        const elv = (Math.asin(u/Math.sqrt(e*e+n*n+u*u))*180)/Math.PI;
        sunEl.textContent = `Subsolare: ${slat}°, ${slon}°\nAzimut/Elev: ${((az+360)%360).toFixed(1)}°, ${elv.toFixed(1)}°`;
      }
    }
  }catch{}
}
viewer.clock.onTick.addEventListener(onTick);

/* Buttons */
elSim?.addEventListener('click', simulate);
elPlay?.addEventListener('click', ()=> viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate );
elReset?.addEventListener('click', ()=> viewer.clock.currentTime = viewer.clock.startTime.clone() );
[elMinutes, elStep, elMult, elTLE].forEach(el=> el?.addEventListener('change', saveState));

/* Keyboard shortcuts */
window.addEventListener('keydown', (e)=>{
  if(e.key==='l' || e.key==='L'){ viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate; }
  else if(e.key==='r' || e.key==='R'){ viewer.clock.currentTime = viewer.clock.startTime.clone(); }
  else if(e.key==='?'){ dlgHelp?.showModal?.(); }
});

/* Share */
btnShare?.addEventListener('click', async()=>{
  try{
    const base = location.origin + location.pathname;
    const url = new URL(base);
    url.searchParams.set('tle', encodeURIComponent(elTLE.value||''));
    url.searchParams.set('minutes', elMinutes.value||'120');
    url.searchParams.set('step', elStep.value||'30');
    url.searchParams.set('mult', elMult.value||'60');
    const shareData = { title:'CubeSatAPP', text:'Configura TLE in CubeSatAPP', url: url.toString() };
    if(navigator.share){ await navigator.share(shareData); }
    else { await navigator.clipboard.writeText(url.toString()); alert('Link copiato negli appunti'); }
  }catch(err){ alert('Impossibile condividere: '+ err.message); }
});

/* Help dialog */
btnHelp?.addEventListener('click', ()=> dlgHelp?.showModal?.() );

/* Export CSV */
elExport?.addEventListener('click', ()=>{
  try{
    if(!samples) throw new Error('Esegui prima la simulazione.');
    const times = samples._property._times;
    let out = 'iso_time,lat_deg,lon_deg,alt_km\n';
    for(const t of times){
      const p = samples.getValue(t); if(!p) continue;
      const c = Cesium.Cartographic.fromCartesian(p);
      const lat = Cesium.Math.toDegrees(c.latitude);
      const lon = Cesium.Math.toDegrees(c.longitude);
      const altKm = c.height/1000;
      out += `${Cesium.JulianDate.toDate(t).toISOString()},${lat},${lon},${altKm}\n`;
    }
    const blob = new Blob([out], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href:url, download:'cubesat_telemetry.csv' });
    document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 100);
  }catch(e){ alert(e.message); }
});

/* Initial demo sim after load (optional) */
window.addEventListener('load', ()=>{
  // Avoid auto-sim if user supplied qs tle
  const hasQS = new URL(location.href).searchParams.has('tle');
  if(!hasQS){ simulate(); }
});
