// ===== Réglages =====
const LEVELS = ["Normal", "Super", "Hyper", "Méga", "Giga", "Ultra", "Ultime"];
// L'espacement se compte en nombre de cartes répondues, jamais en secondes ni
// en jours. Une carte qui vient de passer au niveau X revient après
// INTERVALS[X] réponses.
//                 A  B   C   D    E    F    G
const INTERVALS = [3, 8, 20, 50, 120, 300, 700];
// Deux issues, et deux seulement (posé par Rex le 2026-10-25, en remplacement
// du système à seuils) : soit il trouve la carte et elle monte d'UN palier,
// soit il déclare lui-même qu'il abandonne et elle retombe en Normal, à revoir
// après WRONG_DELAY réponses. Aucune notion de temps nulle part : pas de
// chrono, pas de retournement automatique, pas de niveau décidé par une durée.
const WRONG_DELAY = 3;
// À chaque carte, probabilité de tirer une NOUVELLE carte plutôt qu'une carte à revoir (0 = jamais, 1 = toujours).
// Ramené de 0,8 à 0,2 le 2026-10-25. À 0,8, tant qu'il restait des Pokémon
// jamais vus, 4 tirages sur 5 étaient une carte inconnue. Invisible tant que
// seule la gen 9 était cochée et presque finie (plus rien à piocher) ; en
// ajoutant la gen 8 et ses 96 entrées, le robinet s'est ouvert et Rex ne
// révisait plus rien — il se faisait interroger en continu sur du matériel
// jamais appris.
const NEW_CARD_CHANCE = 0.2;
// Frein : plus de nouvelles cartes tant qu'il y a au moins ce nombre de cartes au niveau A.
// Ramené de 20 à 5 le 2026-10-25 : une carte neuve engendre de l'ordre de 7 à
// 10 révisions dans le mois qui suit, donc 20 inconnues en vol saturent la
// session. Les repères des utilisateurs d'Anki tournent autour de 5 à 15
// nouvelles cartes par jour.
const MAX_LEARNING = 5;

// Générations du Pokédex national : [premier, dernier]
const GENS = [[1, 151], [152, 251], [252, 386], [387, 493], [494, 649], [650, 721], [722, 809], [810, 905], [906, 1025]];
const IMG = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

// ===== État (une seule progression, sauvegardée dans le navigateur) =====
let state = loadState();
let gens = loadGens();     // générations cochées
let front = loadFront();   // ce qui est visible AVANT de retourner la carte
let mult5 = loadMult5();   // si actif, ne tire que les n° multiples de 5
let ordre = loadOrdre();   // mode "dans l'ordre" (voir la section plus bas)
let current = null;
let flipped = false;
// Non nul pendant un test de génération (voir la section Test plus bas).
let test = null;

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem("pkfc-all"));
    if (s && s.cards) return s;
    const merged = mergeOldModes();
    if (merged) return merged;
  } catch {}
  return { counter: 0, cards: {} }; // cards[id] = { lvl, due }
}
// Récupère les anciennes progressions séparées (nom→n° et n°→nom) en une seule
function mergeOldModes() {
  let found = false;
  const out = { counter: 0, cards: {} };
  for (const key of ["pkfc-toNumber", "pkfc-toName"]) {
    let old;
    try { old = JSON.parse(localStorage.getItem(key)); } catch {}
    if (!old || !old.cards) continue;
    found = true;
    out.counter = Math.max(out.counter, old.counter || 0);
    for (const [id, c] of Object.entries(old.cards)) {
      const prev = out.cards[id];
      // en cas de doublon on garde le niveau le plus bas (le plus prudent)
      out.cards[id] = !prev || c.lvl < prev.lvl ? { lvl: c.lvl, due: c.due } : prev;
    }
  }
  return found ? out : null;
}
function loadGens() {
  try {
    const g = JSON.parse(localStorage.getItem("pkfc-gens"));
    if (Array.isArray(g) && g.length) return g;
  } catch {}
  return GENS.map((_, i) => i);
}
function loadFront() {
  try {
    const f = JSON.parse(localStorage.getItem("pkfc-front"));
    if (f && isValidFront(f)) return f;
  } catch {}
  // Par défaut : le numéro seul côté question. C'est le sens que Rex travaille
  // (numéro → Pokémon), et le plus difficile des deux — voir Tools/tools.md.
  return { img: false, name: false, num: true };
}
// il faut au moins un élément visible (la question) et un caché (la réponse)
const isValidFront = f => [f.img, f.name, f.num].some(Boolean) && [f.img, f.name, f.num].some(v => !v);
function loadMult5() {
  try { return JSON.parse(localStorage.getItem("pkfc-mult5")) === true; } catch { return false; }
}
function loadOrdre() {
  try { return JSON.parse(localStorage.getItem("pkfc-ordre")) === true; } catch { return false; }
}

function save() {
  try {
    localStorage.setItem("pkfc-all", JSON.stringify(state));
    localStorage.setItem("pkfc-gens", JSON.stringify(gens));
    localStorage.setItem("pkfc-front", JSON.stringify(front));
    localStorage.setItem("pkfc-mult5", JSON.stringify(mult5));
    localStorage.setItem("pkfc-ordre", JSON.stringify(ordre));
  } catch {}
}

const genOf = id => GENS.findIndex(([a, b]) => id >= a && id <= b);
const inPool = id => gens.includes(genOf(id)) && (!mult5 || id % 5 === 0);

// ===== Mode "dans l'ordre" (2026-10-26) =====
// Demandé par Rex pour s'entraîner à connaître la suite du Pokédex. Rien à
// voir avec la révision espacée : on tire un Pokémon au hasard, puis les
// flèches avancent ou reculent d'un cran. Pas de "je savais / je ne savais
// pas", pas de retournement — la carte montre d'emblée ce que les boutons
// Question demandent d'afficher, et rien de plus.
//
// Deux règles explicites :
// - **Aucune écriture dans la progression.** Ni niveau, ni compteur, ni date
//   de retour. C'est du drill, et le faire compter fausserait les niveaux.
// - **Le filtre multiples de 5 ne s'applique pas** : avancer d'un cran est
//   tout l'intérêt du mode, pas avancer de cinq. La ligne Filtre est d'ailleurs
//   masquée tant que le mode est actif.
//
// En revanche les générations cochées, elles, comptent : on tourne en boucle
// à l'intérieur de la sélection, sans jamais en sortir.
const ordrePool = () => POKEMON.filter(p => gens.includes(genOf(p[0]))).map(p => p[0]);

function ordreGo(pas) {
  const liste = ordrePool();
  if (!liste.length) return;
  const i = current ? liste.indexOf(current[0]) : -1;
  // Première carte (ou carte sortie de la sélection) : tirage au hasard.
  const j = i < 0 ? Math.floor(Math.random() * liste.length)
                  : (i + pas + liste.length) % liste.length;
  current = POKEMON[liste[j] - 1];
  flipped = false;
  cardEl.classList.add("no-anim");
  cardEl.classList.remove("flipped");
  paintFaces();
  void cardEl.offsetWidth;
  cardEl.classList.remove("no-anim");
  dexMasquer(); // on ne dévoile rien et on ne déplace pas la grille : elle trahirait la réponse
  paintHint();
  render();
}

// ===== Choix de la carte suivante =====
const randomOf = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function pickNext() {
  const last = current ? current[0] : null;
  // seules les générations cochées comptent ; les autres cartes sont mises en pause
  const seen = Object.entries(state.cards).map(([id, c]) => ({ id: +id, ...c })).filter(c => inPool(c.id));
  const candidates = seen.filter(c => c.id !== last);
  const unseen = POKEMON.filter(p => inPool(p[0]) && !state.cards[p[0]]);
  const fresh = unseen.length ? randomOf(unseen)[0] : null;
  const enApprentissage = seen.filter(c => c.lvl === 0).length;
  const due = candidates.filter(c => c.due <= state.counter);

  // 1. De temps en temps (NEW_CARD_CHANCE), une nouvelle carte — sauf si trop de cartes au niveau A
  if (fresh && enApprentissage < MAX_LEARNING && Math.random() < NEW_CARD_CHANCE) return fresh;

  // 2. Sinon une carte à revoir : niveau le plus bas d'abord, au hasard parmi celles-ci
  if (due.length) {
    const minLvl = Math.min(...due.map(c => c.lvl));
    return randomOf(due.filter(c => c.lvl === minLvl)).id;
  }

  // 3. Rien à revoir : nouvelle carte
  if (fresh) return fresh;

  // 4. Tout est vu et rien n'est à revoir : la carte qui sera à revoir le plus tôt
  candidates.sort((a, b) => a.due - b.due || a.lvl - b.lvl);
  if (candidates.length) return candidates[0].id;
  return seen.length ? seen[0].id : POKEMON.find(p => inPool(p[0]))[0];
}


// ===== Test d'une génération (2026-10-25) =====
// Pourquoi un test et pas la simple lecture des niveaux : un niveau décroché il
// y a trois jours ne dit pas ce qui est su aujourd'hui. Le test mesure à neuf,
// dans un ordre aléatoire — donc sans pouvoir s'appuyer sur la suite des
// numéros — et ne touche pas à la progression.
// Le verdict est binaire, comme l'entraînement : trouvée ou pas.
// Réussie = toutes trouvées.

function startTest(gen) {
  const ids = POKEMON.filter(p => genOf(p[0]) === gen && (!mult5 || p[0] % 5 === 0)).map(p => p[0]);
  if (!ids.length) return;
  ordre = false; // les deux modes ne peuvent pas cohabiter
  const filtre = mult5 ? " (multiples de 5 seulement — le filtre est actif)" : "";
  if (!confirm(
    `Test de la génération ${gen + 1} : ${ids.length} cartes${filtre}, dans un ordre aléatoire.\n\n`
    + `La progression n'est pas modifiée. Réussie = toutes trouvées.`
  )) return;
  test = { gen, queue: shuffle(ids), i: 0, results: {} };
  $("#exam").hidden = true;
  next();
}

function abandonTest() {
  if (test && test.i && !confirm("Abandonner le test en cours ? Le résultat est perdu.")) return;
  test = null;
  $("#exam").hidden = true;
  next();
}

function finishTest() {
  const rates = [];
  let trouvees = 0;
  for (const id of test.queue) {
    if (test.results[id]) trouvees++; else rates.push(id);
  }
  const n = test.queue.length;
  const reussi = rates.length === 0;
  const gen = test.gen;
  rates.sort((a, b) => a - b);
  test = null;
  render();

  const nomDe = id => POKEMON[id - 1][1];
  $("#exam").innerHTML =
    `<div class="exam-box">`
    + `<h2 class="${reussi ? "ok" : "ko"}">Génération ${gen + 1} — ${reussi ? "réussie" : "pas encore"}</h2>`
    + `<p class="exam-score"><b>${trouvees} / ${n}</b> trouvées</p>`
    + `<div class="levels">`
    + `<div class="lvl l4"><b>${trouvees}</b><span>Trouvées</span></div>`
    + `<div class="lvl l0"><b>${rates.length}</b><span>Non trouvées</span></div>`
    + `</div>`
    + (rates.length
        ? `<p class="exam-sub">À retravailler :</p><ul class="exam-list">`
          + rates.map(id => `<li><span class="exam-num">N° ${id}</span> ${nomDe(id)}</li>`).join("")
          + `</ul>`
        : `<p class="exam-sub">Rien à retravailler.</p>`)
    + `<div class="exam-actions">`
    + (rates.length ? `<button id="btn-replonge" class="right">Renvoyer les ${rates.length} ratées en Normal</button>` : "")
    + `<button id="btn-exam-close" class="flip">Fermer</button>`
    + `</div></div>`;
  $("#exam").hidden = false;
  $("#btn-exam-close").addEventListener("click", () => { $("#exam").hidden = true; next(); });
  if (rates.length) {
    // Les cartes jamais vues ne sont pas créées ici — elles doivent passer par
    // la phase de présentation, pas apparaître directement en Normal.
    $("#btn-replonge").addEventListener("click", () => {
      let bougees = 0;
      for (const id of rates) {
        const c = state.cards[id];
        if (!c) continue;
        c.lvl = 0;
        c.due = state.counter + WRONG_DELAY;
        bougees++;
      }
      save();
      $("#exam").hidden = true;
      flash(`${bougees} carte${bougees > 1 ? "s" : ""} renvoyée${bougees > 1 ? "s" : ""} en ${LEVELS[0]}.`);
      next();
    });
  }
}

function answer(knew) {
  if (!current || !flipped || ordre) return;
  const id = current[0];
  if (test) {
    test.results[id] = knew;
    test.i++;
    next();
    return;
  }
  const c = state.cards[id] || { lvl: 0, due: 0 };
  state.counter++;
  if (knew) {
    // Un palier à la fois, sans condition de vitesse. Ultime est le sommet :
    // une carte qui y est reste là tant qu'elle est retrouvée.
    c.lvl = Math.min(c.lvl + 1, LEVELS.length - 1);
    c.due = state.counter + INTERVALS[c.lvl];
  } else {
    c.lvl = 0;
    c.due = state.counter + WRONG_DELAY;
  }
  state.cards[id] = c;
  save();
  next();
}

// ===== Affichage =====
const $ = s => document.querySelector(s);
const cardEl = $("#card");

const PART = {
  img: p => `<img src="${IMG(p[0])}" alt="" draggable="false">`,
  name: p => `<div class="name">${p[1]}</div>`,
  num: p => `<div class="num">N° ${p[0]}</div>`,
};

function faceHTML(parts, p) {
  const html = parts.map(k => PART[k](p)).join("");
  return { html, multi: parts.length > 1 };
}

// La ligne sous la carte. Rien tant que la carte n'est pas retournée : la
// question doit rester seule à l'écran.
function paintHint() {
  const el = $("#hint");
  if (ordre) {
    el.textContent = "Dans l'ordre   ·   ← précédent   ·   suivant →";
    return;
  }
  if (!flipped || test) { el.textContent = ""; return; }
  const lvl = state.cards[current[0]] ? state.cards[current[0]].lvl : 0;
  const monte = lvl < LEVELS.length - 1 ? `passe en ${LEVELS[lvl + 1]}` : `reste en ${LEVELS[lvl]}`;
  const tombe = lvl > 0 ? `retombe en ${LEVELS[0]}` : `reste en ${LEVELS[0]}`;
  el.textContent = `Je savais → ${monte}   ·   Je ne savais pas → ${tombe}`;
}

// remplit les deux faces avec la carte en cours
function paintFaces() {
  if (!current) return;
  const visible = ["img", "name", "num"].filter(k => front[k]);
  const q = faceHTML(visible, current);
  const a = faceHTML(["img", "name", "num"], current); // la réponse montre tout
  const lvl = state.cards[current[0]] ? state.cards[current[0]].lvl : 0;
  $(".front").innerHTML = q.html;
  // Le dos annonce le niveau ACTUEL de la carte (avant réponse), et s'en colore.
  // Deux exceptions : en présentation il n'y a pas encore de niveau, et pendant
  // un test le niveau stocké n'est pas ce qu'on mesure — on y met l'avancement.
  let tag = LEVELS[lvl], couleur = `var(--lvl${lvl})`;
  if (test) { tag = `${test.i + 1} / ${test.queue.length}`; couleur = "var(--muted)"; }

  $(".back").style.setProperty("--lvl-color", couleur);
  $(".back").innerHTML =
    `<span class="lvl-tag">${tag}</span>` + a.html +
    `<div class="gen-tag">Génération ${genOf(current[0]) + 1}</div>`;
  $(".front").classList.toggle("multi", q.multi);
  $(".back").classList.add("multi");
}

function next() {
  // En mode "dans l'ordre", avancer d'un cran EST la carte suivante. Au tout
  // premier appel current est nul, et ordreGo tire alors au hasard.
  if (ordre) { ordreGo(1); return; }
  if (test) {
    if (test.i >= test.queue.length) { finishTest(); return; }
    current = POKEMON[test.queue[test.i] - 1];
  } else {
    current = POKEMON[pickNext() - 1];
  }
  flipped = false;
  dexMasquer(); // nouvelle question = Pokédex regrisé, même s'il a été rouvert avant
  // retour instantané côté question (sans animation) pour ne pas dévoiler la réponse suivante
  cardEl.classList.add("no-anim");
  cardEl.classList.remove("flipped");
  paintFaces();
  void cardEl.offsetWidth;
  cardEl.classList.remove("no-anim");
  paintHint();
  render();
}

function flip() {
  // Une carte retournée ne se retourne plus : la réponse est déjà entièrement
  // visible, revenir à la question n'apporte rien. En mode "dans l'ordre" il
  // n'y a pas de dos du tout.
  if (!current || flipped || ordre) return;
  flipped = true;
  cardEl.classList.toggle("flipped", flipped);
  dexDemasquer();      // la réponse se dévoile aussi dans la grille
  dexShow(current[0]); // et on y situe le Pokémon parmi ses voisins
  paintHint();
  render();
}

function render() {
  // Pendant un test, les réglages et les compteurs disparaissent : changer la
  // sélection au milieu d'une mesure n'aurait aucun sens.
  document.body.classList.toggle("testing", !!test);
  document.body.classList.toggle("ordre", ordre);
  $("#btn-ordre").classList.toggle("active", ordre);
  if (test) {
    $("#test-bar").innerHTML =
      `<b>Test génération ${test.gen + 1}</b><span>${test.i} / ${test.queue.length} répondues</span>`
      + `<button id="btn-abandon" class="link">Abandonner</button>`;
    $("#btn-abandon").addEventListener("click", abandonTest);
  }
  document.querySelectorAll(".gen").forEach(b => b.classList.toggle("active", gens.includes(+b.dataset.gen)));
  document.querySelectorAll(".show").forEach(b => b.classList.toggle("active", front[b.dataset.show]));
  $("#btn-mult5").classList.toggle("active", mult5);
  // statistiques limitées aux générations cochées
  const counts = LEVELS.map(() => 0);
  let unseen = 0;
  for (const p of POKEMON) {
    if (!inPool(p[0])) continue;
    const c = state.cards[p[0]];
    if (c) counts[c.lvl]++; else unseen++;
  }
  $("#levels").innerHTML =
    `<div class="lvl unseen"><b>${unseen}</b><span>Non vues</span></div>` +
    LEVELS.map((l, i) => `<div class="lvl l${i}"><b>${counts[i]}</b><span>${l}</span></div>`).join("");
  // En mode "dans l'ordre" il n'y a rien à juger : un seul bouton, toujours le
  // même, toujours là.
  $("#btn-flip").hidden = flipped || ordre;
  $("#btn-wrong").hidden = !flipped || ordre;
  $("#btn-right").hidden = !flipped || ordre;
  $("#btn-next").hidden = !ordre;
  $("#counter").textContent = `${state.counter} réponses`;
}

// ===== Événements =====
cardEl.addEventListener("click", () => ordre ? ordreGo(1) : flip());
$("#btn-flip").addEventListener("click", flip);
$("#btn-wrong").addEventListener("click", () => answer(false));
$("#btn-right").addEventListener("click", () => answer(true));

$("#gens").innerHTML = GENS.map((_, i) => `<button class="gen" data-gen="${i}">${i + 1}</button>`).join("");
document.querySelectorAll(".gen").forEach(b => b.addEventListener("click", () => {
  const g = +b.dataset.gen;
  if (gens.includes(g)) {
    if (gens.length === 1) return; // au moins une génération
    gens = gens.filter(x => x !== g);
  } else {
    gens = [...gens, g].sort((a, b) => a - b);
  }
  save();
  b.blur();
  // on change de carte seulement si la carte actuelle sort de la sélection
  // (en mode "dans l'ordre" le filtre multiples de 5 ne compte pas)
  const dedans = current && (ordre ? gens.includes(genOf(current[0])) : inPool(current[0]));
  if (current && !dedans) { current = null; next(); } else render();
}));

$("#btn-ordre").addEventListener("click", () => {
  ordre = !ordre;
  save();
  $("#btn-ordre").blur();
  current = null; // on repart sur un tirage au hasard dans un sens comme dans l'autre
  next();
});

// Une rangée de boutons à part : un clic lance le test de cette génération.
// Volontairement sans la classe .gen, pour ne pas être repris par la sélection
// des générations travaillées dans render().
$("#test-gens").innerHTML = GENS.map((_, i) => `<button class="test-gen" data-gen="${i}">${i + 1}</button>`).join("");
document.querySelectorAll(".test-gen").forEach(b => b.addEventListener("click", () => {
  b.blur();
  startTest(+b.dataset.gen);
}));

$("#btn-mult5").addEventListener("click", () => {
  mult5 = !mult5;
  save();
  // on change de carte seulement si la carte actuelle sort de la sélection
  if (current && !inPool(current[0])) next(); else render();
});

document.querySelectorAll(".show").forEach(b => b.addEventListener("click", () => {
  const k = b.dataset.show;
  const tryFront = { ...front, [k]: !front[k] };
  if (!isValidFront(tryFront)) return; // toujours au moins une question et une réponse
  front = tryFront;
  save();
  paintFaces();
  render();
  b.blur();
}));

// ===== Import / export de la progression =====
// Le localStorage est propre à un navigateur : passer de Chrome à Firefox perd
// tout. Ces trois boutons permettent de transporter la progression à la main.
const SAVE_KEYS = ["pkfc-all", "pkfc-gens", "pkfc-front", "pkfc-mult5", "pkfc-ordre"];
// L'appli est autonome depuis le 2026-10-29 : elle ne connaît plus les chemins
// de Vyper. Le serveur local, s'il existe, décide seul où il range la
// sauvegarde ; ici on se contente de l'envoyer.

function collectSave() {
  const data = { app: "pokedex-flashcards", version: 1, date: new Date().toISOString() };
  for (const k of SAVE_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  }
  return data;
}

function applySave(data) {
  if (!data || data.app !== "pokedex-flashcards") throw new Error("Ce fichier n'est pas une progression Pokédex.");
  for (const k of SAVE_KEYS) {
    if (typeof data[k] === "string") localStorage.setItem(k, data[k]);
    else localStorage.removeItem(k);
  }
}

function flash(msg, ok = true) {
  const el = $("#save-msg");
  el.textContent = msg;
  el.classList.toggle("ko", !ok);
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { el.textContent = ""; }, 6000);
}

$("#btn-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(collectSave(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pokedex-progression-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  flash("Fichier téléchargé.");
});

$("#btn-import").addEventListener("click", () => $("#import-file").click());

$("#import-file").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const cards = data["pkfc-all"] ? Object.keys(JSON.parse(data["pkfc-all"]).cards || {}).length : 0;
      if (!confirm(`Remplacer la progression de ce navigateur par celle du fichier (${cards} cartes connues) ?\nLa progression actuelle sera perdue.`)) return;
      applySave(data);
      location.reload();
    } catch (err) {
      flash(err.message || "Fichier illisible.", false);
    }
  };
  reader.readAsText(file);
  e.target.value = ""; // permet de réimporter le même fichier
});

// Écrit la progression dans le dossier Vyper, pour qu'elle parte sur GitHub.
// Ne marche que si la page est ouverte via le serveur local (start-vyper.vbs).
$("#btn-backup").addEventListener("click", async () => {
  try {
    const res = await fetch("/__save-progression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectSave()),
    });
    if (!res.ok) throw new Error(await res.text());
    flash("Progression sauvegardée dans Vyper.");
  } catch (err) {
    flash("Serveur local injoignable — ouvre l'appli via start-vyper.vbs, ou utilise Exporter.", false);
  }
});

$("#btn-reset").addEventListener("click", () => {
  if (!confirm("Remettre à zéro toute la progression ?")) return;
  state = { counter: 0, cards: {} };
  current = null;
  save();
  next();
});
$("#btn-next").addEventListener("click", () => ordreGo(1));

// Tout se pilote au bloc de flèches, pour que la main gauche suffise (demande
// de Rex le 2026-10-26 : Espace obligeait à poser les deux mains). Bas =
// retourner / enchaîner, gauche = raté, droite = réussi.
document.addEventListener("keydown", e => {
  // Rien ne se déclenche pendant qu'on tape dans la recherche du Pokédex :
  // les flèches y servent à déplacer le curseur. (La cible n'est pas toujours
  // un élément — sur document, closest n'existe pas.)
  const cible = e.target;
  if (cible && cible.closest && cible.closest("input, textarea")) return;
  // En mode "dans l'ordre", les flèches déplacent d'un cran au lieu de répondre.
  if (ordre) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); ordreGo(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); ordreGo(-1); }
    return;
  }
  if (e.key === "ArrowDown" || e.key === "Enter") {
    e.preventDefault();
    flip();
  }
  else if (e.key === "ArrowLeft" || e.key === "1") answer(false);
  else if (e.key === "ArrowRight" || e.key === "2") answer(true);
});

save(); // fige la fusion des anciennes progressions
next();
