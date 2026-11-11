const canvas = document.getElementById("ciel");
const ctx = canvas.getContext("2d");
let W, H;

function redimensionner() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener("resize", redimensionner);
redimensionner();

/* ---------- ÉTAT DE LA SIMULATION ---------- */

const etat = {
  pause: false,
  vitesseTemps: 1,
  captures: 0,
  modeFixe: false,
};

const DUREE_TRACE = 1; 
const PUISSANCE_LANCER = 0.25; 
const DRAG_MAX = 130; // longueur max du drag (px)

// Décroissance orbitale : à chaque pas de physique, la planète perd
// un peu de vitesse (simule traînée du disque + effets de marée).
// Aucune orbite n'est stable : tout finit dans le trou noir.
const DECAY_ORBITE = 0.9991; // par pas de physique (240 pas/s)

// Le trou noir : toujours exactement au centre de l'écran
const trouNoir = {
  x: () => W / 2,
  y: () => H / 2,
  masse: 2000,
  rayonHorizon: () => Math.sqrt(trouNoir.masse) * 0.6,
};

// Gravité forte : la libération est difficile, la plupart des
// lancers spiralent vers le trou noir
const G = 100;

let planetes = []; // { x, y, vx, vy, taille, couleur, trail[] }
let fixes = []; // { x, y, taille, couleur, masse }
let etincelles = [];

// Traces : segments qui vivent DUREE_TRACE secondes
let traces = []; // { x1, y1, x2, y2, couleur, vie }

/* ---------- ÉTOILES EN ARRIÈRE-PLAN ---------- */

const etoiles = [];
for (let i = 0; i < 220; i++) {
  etoiles.push({
    x: Math.random(),
    y: Math.random(),
    taille: Math.random() * 1.4 + 0.3,
    phase: Math.random() * Math.PI * 2,
  });
}

/* ---------- DISQUE D'ACCRÉTION ---------- */

const disque = [];
function creerDisque() {
  disque.length = 0;
  for (let i = 0; i < 380; i++) {
    disque.push({
      rayon: trouNoir.rayonHorizon() * (1.4 + Math.random() * 2.4),
      angle: Math.random() * Math.PI * 2,
      epaisseur: Math.random() * 4 + 1,
    });
  }
}

/* ---------- PHYSIQUE ---------- */

// Accélération totale en un point : trou noir + planètes fixes
function acceleration(px, py) {
  let ax = 0,
    ay = 0;

  const bx = trouNoir.x(),
    by = trouNoir.y();
  let dx = bx - px,
    dy = by - py;
  let r = Math.sqrt(dx * dx + dy * dy);
  const rClamp = Math.max(r, 12);
  const a = (G * trouNoir.masse) / (rClamp * rClamp);
  ax += (a * dx) / r;
  ay += (a * dy) / r;

  for (const f of fixes) {
    dx = f.x - px;
    dy = f.y - py;
    r = Math.sqrt(dx * dx + dy * dy);
    const rc = Math.max(r, 18);
    const af = (G * f.masse) / (rc * rc);
    ax += (af * dx) / r;
    ay += (af * dy) / r;
  }

  return { ax, ay };
}

// Un pas de physique (Euler semi-implicite)
function pasPhysique(dt) {
  for (let i = planetes.length - 1; i >= 0; i--) {
    const p = planetes[i];
    const { ax, ay } = acceleration(p.x, p.y);
    p.vx += ax * dt;
    p.vy += ay * dt;

    // Décroissance orbitale : perte d'énergie progressive.
    // L'orbite rétrécit, la spirale s'accélère près de l'horizon,
    // et aucune planète ne peut échapper indéfiniment.
    p.vx *= DECAY_ORBITE;
    p.vy *= DECAY_ORBITE;

    const ancienX = p.x;
    const ancienY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Trace persistante : un segment par pas de physique
    traces.push({
      x1: ancienX,
      y1: ancienY,
      x2: p.x,
      y2: p.y,
      couleur: p.couleur,
      vie: DUREE_TRACE,
    });
    if (traces.length > 6000) traces.splice(0, 600);

    // Traînée "comet" vive derrière la planète
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 200) p.trail.shift();

    // Capture par l'horizon des événements
    const bx = trouNoir.x(),
      by = trouNoir.y();
    const dx = p.x - bx,
      dy = p.y - by;
    if (Math.sqrt(dx * dx + dy * dy) < trouNoir.rayonHorizon()) {
      etincelles.push({ x: p.x, y: p.y, vie: 1, taille: p.taille * 3 });
      planetes.splice(i, 1);
      etat.captures++;
      document.getElementById("captures").textContent = etat.captures;
      continue;
    }

    // Planète partie trop loin → on la retire
    if (p.x < -300 || p.x > W + 300 || p.y < -300 || p.y > H + 300) {
      planetes.splice(i, 1);
    }
  }
}

/* ---------- SOURIS : LANCER OU POSER ---------- */

let debutDrag = null;
let finDrag = null;

// Vecteur de lancement : direction + puissance plafonnée
function vecteurLancer() {
  let vx = (debutDrag.x - finDrag.x) * PUISSANCE_LANCER;
  let vy = (debutDrag.y - finDrag.y) * PUISSANCE_LANCER;
  const norme = Math.hypot(vx, vy);
  const maxV = DRAG_MAX * PUISSANCE_LANCER;
  if (norme > maxV) {
    vx = (vx / norme) * maxV;
    vy = (vy / norme) * maxV;
  }
  return { vx, vy };
}

canvas.addEventListener("mousedown", (e) => {
  debutDrag = { x: e.clientX, y: e.clientY };
  finDrag = debutDrag;
});
canvas.addEventListener("mousemove", (e) => {
  if (debutDrag && !etat.modeFixe) finDrag = { x: e.clientX, y: e.clientY };
});

window.addEventListener("mouseup", () => {
  if (!debutDrag) return;

  if (etat.modeFixe) {
    const x = debutDrag.x,
      y = debutDrag.y;
    const bx = trouNoir.x(),
      by = trouNoir.y();
    const d = Math.hypot(x - bx, y - by);
    if (d > trouNoir.rayonHorizon() * 1.5) {
      const taille = 5 + Math.random() * 4;
      fixes.push({
        x,
        y,
        taille,
        couleur: `hsl(${Math.random() * 360}, 80%, 70%)`,
        masse: 40 + taille * 20,
      });
    }
  } else {
    const { vx, vy } = vecteurLancer();
    planetes.push({
      x: finDrag.x,
      y: finDrag.y,
      vx,
      vy,
      taille: 3 + Math.random() * 3,
      couleur: `hsl(${Math.random() * 360}, 80%, 65%)`,
      trail: [],
    });
  }
  debutDrag = finDrag = null;
});

// Prédiction de trajectoire (mode lancer uniquement)
function tracerPrediction() {
  if (!debutDrag || etat.modeFixe) return;

  const { vx, vy } = vecteurLancer();
  let x = finDrag.x,
    y = finDrag.y,
    pvx = vx,
    pvy = vy;
  const dt = 1 / 60;
  const rh = trouNoir.rayonHorizon();

  ctx.fillStyle = "rgba(120, 255, 160, 0.7)";
  for (let i = 0; i < 500; i++) {
    const { ax, ay } = acceleration(x, y);
    pvx += ax * dt;
    pvy += ay * dt;
    // Le decay est appliqué par pas de 1/240 s ; ici dt = 1/60 s,
    // on applique donc l'équivalent de 4 pas
    const decayPred = Math.pow(DECAY_ORBITE, 4);
    pvx *= decayPred;
    pvy *= decayPred;
    x += pvx * dt;
    y += pvy * dt;

    const bx = trouNoir.x(),
      by = trouNoir.y();
    if (Math.hypot(x - bx, y - by) < rh) break;
    if (x < -50 || x > W + 50 || y < -50 || y > H + 50) break;

    if (i % 6 === 0) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ligne de visée
  ctx.strokeStyle = "rgba(120, 255, 160, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(finDrag.x, finDrag.y);
  ctx.lineTo(debutDrag.x, debutDrag.y);
  ctx.stroke();
}

/* ---------- RENDU ---------- */

function dessiner(ts) {
  // Temps écoulé depuis la frame précédente (fondu en temps réel)
  const deltaFrame = Math.min((ts - dernierTsDessin) / 1000, 0.05);
  dernierTsDessin = ts;

  // Fond opaque : les traces gèrent elles-mêmes leur disparition
  ctx.fillStyle = "#02040c";
  ctx.fillRect(0, 0, W, H);

  // Étoiles scintillantes
  for (const s of etoiles) {
    const scintille = 0.4 + 0.6 * Math.abs(Math.sin(ts * 0.001 + s.phase));
    ctx.fillStyle = `rgba(255,255,255,${scintille * 0.8})`;
    ctx.fillRect(s.x * W, s.y * H, s.taille, s.taille);
  }

  const bx = trouNoir.x(),
    by = trouNoir.y();
  const rh = trouNoir.rayonHorizon();

  // Disque d'accrétion
  for (const d of disque) {
    const v = Math.sqrt((G * trouNoir.masse) / d.rayon);
    d.angle += (v / d.rayon) * 0.016;
    d.rayon -= 0.06;
    if (d.rayon < rh * 1.15) d.rayon = rh * (3.5 + Math.random() * 0.5);

    const px = bx + Math.cos(d.angle) * d.rayon;
    const py = by + Math.sin(d.angle) * d.rayon * 0.55;

    const t = Math.min(1, (rh * 3.5 - d.rayon) / (rh * 2.5));
    const teinte = 40 - t * 30;
    const lum = 45 + t * 50;
    ctx.fillStyle = `hsla(${teinte}, 95%, ${lum}%, 0.8)`;
    ctx.beginPath();
    ctx.arc(px, py, d.epaisseur * (0.5 + t * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }

  // Halo lumineux autour de l'horizon
  const halo = ctx.createRadialGradient(bx, by, rh, bx, by, rh * 3);
  halo.addColorStop(0, "rgba(255, 200, 120, 0.5)");
  halo.addColorStop(0.4, "rgba(255, 120, 40, 0.15)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(bx, by, rh * 3, 0, Math.PI * 2);
  ctx.fill();

  // L'horizon des événements
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(bx, by, rh, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 230, 180, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Traces : épaisses, opaques, effacées en exactement 1 s
  ctx.lineCap = "round";
  for (const t of traces) {
    t.vie -= deltaFrame;
    ctx.strokeStyle = t.couleur;
    ctx.globalAlpha = Math.max(0, t.vie / DUREE_TRACE) * 0.95;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  traces = traces.filter((t) => t.vie > 0);

  // Planètes fixes : contour blanc
  for (const f of fixes) {
    ctx.fillStyle = f.couleur;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.taille, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Traînée "comet" avec dégradé + planète
  for (const p of planetes) {
    const n = p.trail.length;
    for (let i = 1; i < n; i++) {
      const frac = i / n; // 0 = queue, 1 = tête
      ctx.strokeStyle = p.couleur;
      ctx.globalAlpha = frac * 0.9;
      ctx.lineWidth = 1 + frac * 2.5;
      ctx.beginPath();
      ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
      ctx.lineTo(p.trail[i].x, p.trail[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = p.couleur;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.taille, 0, Math.PI * 2);
    ctx.fill();
  }

  // Étincelles de capture
  for (const e of etincelles) {
    e.vie -= 0.04;
    ctx.fillStyle = `rgba(255, 180, 100, ${Math.max(0, e.vie)})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.taille * (1 + (1 - e.vie) * 3), 0, Math.PI * 2);
    ctx.fill();
  }
  etincelles = etincelles.filter((e) => e.vie > 0);

  tracerPrediction();
}

let dernierTsDessin = 0;

/* ---------- BOUCLE PRINCIPALE ---------- */
let dernierT = 0;
let accumulateur = 0;
const PAS = 1 / 240;

function boucle(ts) {
  const delta = Math.min((ts - dernierT) / 1000, 0.05);
  dernierT = ts;

  if (!etat.pause) {
    accumulateur += delta * etat.vitesseTemps;
    while (accumulateur >= PAS) {
      pasPhysique(PAS);
      accumulateur -= PAS;
    }
  }

  dessiner(ts);
  requestAnimationFrame(boucle);
}

/* ---------- INTERFACE ---------- */

document.getElementById("masse").addEventListener("input", (e) => {
  trouNoir.masse = +e.target.value;
  document.getElementById("valMasse").textContent = trouNoir.masse;
});
document.getElementById("temps").addEventListener("input", (e) => {
  etat.vitesseTemps = +e.target.value;
  document.getElementById("valTemps").textContent =
    "×" + etat.vitesseTemps.toFixed(1);
});
document.getElementById("modeBtn").addEventListener("click", function () {
  etat.modeFixe = !etat.modeFixe;
  this.textContent = "Mode fixe : " + (etat.modeFixe ? "ON" : "OFF");
  this.classList.toggle("actif", etat.modeFixe);
});
document.getElementById("pauseBtn").addEventListener("click", function () {
  etat.pause = !etat.pause;
  this.textContent = etat.pause ? "Reprendre" : "Pause";
});
document.getElementById("clearBtn").addEventListener("click", () => {
  planetes = [];
  fixes = [];
  traces = [];
  etat.captures = 0;
  document.getElementById("captures").textContent = 0;
  majStats();
});

function majStats() {
  document.getElementById("valN").textContent = planetes.length;
  document.getElementById("valF").textContent = fixes.length;
}
setInterval(majStats, 500);

/* ---------- SYSTÈME INITIAL : 3 planètes en orbite circulaire ---------- */

function planeteEnOrbite(distance, couleur, taille) {
  const bx = trouNoir.x(),
    by = trouNoir.y();
  const v = Math.sqrt((G * trouNoir.masse) / distance);
  planetes.push({
    x: bx + distance,
    y: by,
    vx: 0,
    vy: -v,
    taille,
    couleur,
    trail: [],
  });
}
planeteEnOrbite(180, "#7ec8ff", 4);
planeteEnOrbite(320, "#ffb36b", 5);
planeteEnOrbite(480, "#b3ff9e", 6);

creerDisque();
requestAnimationFrame(boucle);
