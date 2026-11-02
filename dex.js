// ===== Panneau Pokédex (à droite) — indépendant des flashcards, sauf dexShow() appelé quand une carte est retournée =====
(() => {
  const dex = document.getElementById("dex");
  const list = document.getElementById("dex-list");
  const search = document.getElementById("dex-search");
  const toggle = document.getElementById("dex-toggle");
  const IMG = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Grille de 5 colonnes : les multiples de 5 tombent donc toujours dans la
  // colonne de droite, ce qui donne un repère visuel pour les mémoriser par 5.
  const PAR_RANGEE = 5;

  // Même ordre que la carte principale : image, puis nom, puis numéro.
  list.innerHTML = POKEMON.map(([id, name]) =>
    `<div class="dex-item" data-id="${id}">
      <img src="${IMG(id)}" alt="" loading="lazy" draggable="false">
      <div class="dex-name">${name}</div>
      <div class="dex-num">N° ${id}</div>
    </div>`).join("");

  function goTo(id) {
    const item = list.children[id - 1];
    // .dex-list est en position:relative → offsetTop est relatif à la liste.
    // Saut immédiat : sur 200 rangées d'écart, une animation serait interminable.
    if (item) list.scrollTo({ top: item.offsetTop, behavior: "instant" });
  }

  // Place la rangée du Pokémon juste en dessous de celle d'avant, pour garder
  // un peu de contexte au-dessus sans le perdre de vue.
  function goToRangee(id) {
    const rangee = Math.floor((id - 1) / PAR_RANGEE);
    goTo(Math.max(rangee - 1, 0) * PAR_RANGEE + 1);
  }

  // Surligne le Pokémon et l'amène à l'écran ; appelé par app.js au retournement.
  let shown = null;
  window.dexShow = id => {
    shown = id;
    list.querySelector(".current")?.classList.remove("current");
    list.children[id - 1]?.classList.add("current");
    goToRangee(id);
  };

  search.addEventListener("keydown", e => {
    e.stopPropagation(); // ne pas déclencher les raccourcis des flashcards
    if (e.key !== "Enter") return;
    const q = search.value.trim();
    let id = /^\d+$/.test(q) ? Math.min(Math.max(+q, 1), POKEMON.length) : null;
    if (!id && q) {
      const n = norm(q);
      const hit = POKEMON.find(p => norm(p[1]).startsWith(n)) || POKEMON.find(p => norm(p[1]).includes(n));
      if (hit) id = hit[0];
    }
    if (id) goToRangee(id);
    search.value = "";
  });

  // Masquage : on cache images et noms, on garde les numéros — eux ne révèlent
  // rien, donc le Pokédex devient une grille d'entraînement au lieu d'un corrigé
  // posé à côté de la carte.
  // `persister` est faux quand c'est l'appli qui remasque à chaque nouvelle
  // carte : seul un clic de Rex vaut préférence enregistrée.
  function setMasque(masque, persister = true) {
    list.classList.toggle("masque", masque);
    toggle.classList.toggle("active", !masque); // orange = images et noms affichés
    toggle.title = masque
      ? "Numéros seuls — cliquer pour réafficher images et noms"
      : "Images et noms affichés — cliquer pour ne garder que les numéros";
    if (persister) {
      try { localStorage.setItem("pkfc-dex-masque", masque ? "1" : "0"); } catch {}
    }
    // Pas besoin de se recaler : les rangées font la même hauteur dans les deux modes.
  }

  // Appelé par app.js à chaque nouvelle carte. Rex peut rouvrir quand il veut
  // pendant la carte ; la suivante remasque.
  window.dexMasquer = () => {
    if (!list.classList.contains("masque")) setMasque(true, false);
  };

  // Appelé au retournement : la réponse se dévoile aussi dans la grille.
  window.dexDemasquer = () => {
    if (list.classList.contains("masque")) setMasque(false, false);
  };
  // Masqué par défaut, pour la même raison : un Pokédex plein d'images à côté
  // d'une carte qui demande le numéro, c'est le corrigé ouvert sur la table.
  let masque = true;
  try { masque = localStorage.getItem("pkfc-dex-masque") !== "0"; } catch {}
  setMasque(masque);
  toggle.addEventListener("click", () => {
    setMasque(!list.classList.contains("masque"));
    toggle.blur();
  });
})();
