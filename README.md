# Pokédex Flashcards

Entraînement à reconnaître les 1025 Pokémon, dans les deux sens (numéro ↔ nom).
Application statique : cinq fichiers, aucun serveur, aucune dépendance.

👉 **[Ouvrir l'application](https://rexmxxrayder.github.io/Pokedex/)**

## Ce que ça fait

- **Système de Leitner à 7 niveaux** — Normal, Super, Hyper, Méga, Giga, Ultra, Ultime.
  Une bonne réponse fait monter d'un palier, une mauvaise renvoie en Normal.
  L'espacement se compte en nombre de cartes répondues, jamais en secondes.
- **Choix de la question** : image, nom, numéro — au moins un visible, un caché.
- **Filtres** : par génération, et sur les seuls multiples de 5.
- **Mode « Dans l'ordre »** : un Pokémon au hasard, puis les flèches pour avancer
  ou reculer d'un cran, afin de travailler la suite du Pokédex.
- **Test par génération** : toutes les cartes dans un ordre aléatoire, verdict
  binaire, sans toucher à la progression.
- **Pokédex en grille de 5** : un multiple de 5 tombe toujours dans la colonne
  de droite, ce qui donne un repère visuel par paquets de cinq.

## Où vit la progression

Dans le **localStorage du navigateur**, et nulle part ailleurs. Elle ne suit donc
pas d'un navigateur ou d'un appareil à l'autre. Pour la transporter :

1. **Exporter** sur l'appareil d'origine → un fichier `.json`.
2. Se l'envoyer (mail, cloud, câble).
3. **Importer** sur l'autre appareil.

Le bouton « Sauvegarder dans Vyper » ne fonctionne que sur l'installation locale,
derrière un petit serveur ; en ligne il affiche un message et renvoie vers Exporter.

## Raccourcis clavier

| Touche | Effet |
|---|---|
| ↓ | retourner la carte |
| ← | je ne savais pas |
| → | je savais |

En mode « Dans l'ordre », ↓ et → avancent d'un cran, ← recule.

## Sur téléphone

Les réglages sont repliés derrière le bouton ⚙️ pour laisser la carte et les
boutons de réponse dans un même écran.

## Licence et crédits

Code personnel, réutilisable librement. Les illustrations officielles sont
chargées depuis [PokeAPI/sprites](https://github.com/PokeAPI/sprites) ;
Pokémon est une marque de Nintendo / Creatures / GAME FREAK, sans aucun lien
avec ce projet.
