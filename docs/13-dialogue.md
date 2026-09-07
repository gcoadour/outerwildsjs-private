# Dialogues et mémoire entre boucles

`tools/13_dialogue.py` convertit les arbres XML en JSON et les relie aux
personnages. `web/src/dialogue.js` les parcourt et retient ce qui a été vu.

Le texte est du contenu narratif du jeu : la sortie va dans `data/`, non
versionné, et n'est chargée qu'à l'exécution.

## Ce que contiennent réellement les 73 TextAsset

Mon hypothèse de départ — « 73 arbres de dialogue » — était fausse :

| contenu | fichiers |
|---|---|
| texte brut des objets lisibles | **47** |
| arbres de dialogue XML | **26** |

Et **aucune erreur d'analyse** sur les 26 : le XML est propre. Ce qui manquait
à mon premier parseur, c'était une seconde forme.

## Deux formes d'arbre

```
<dialogueTree>
  <branch id="..">          13 fichiers — nœud à options
    <talk>                  réplique
    <options>
      <option goto="..">    choix, saut vers une branche
  <convo id="..">           12 fichiers — nœud simple, sans options
    <talk>
<OWConversation>            1 fichier — variante avec <characters>
```

Ne gérer que `<branch>` ne donnait que 13 arbres sur 26. Avec `<convo>` :
**26 arbres, 72 branches, 72 répliques, 44 options**, et 13 des 14 composants
`Conversation` reliés à leur arbre.

L'attribut `eventbased` (20 occurrences) marque des branches déclenchées par un
événement plutôt que par un choix ; il est extrait mais pas encore exploité.

## La mémoire, qui est le vrai sujet

Dans Outer Wilds, ce qui traverse la boucle n'est pas un état sauvegardé mais
**la connaissance du joueur**. C'est ce qui distingue la boucle d'une simple
mécanique de réinitialisation.

Le portage enregistre donc chaque nœud visité sous la clé `arbre#branche`, dans
un ensemble persistant. Vérifié :

| étape | mémoire |
|---|---|
| départ | 0 |
| ouverture d'une conversation | 1 |
| réouverture de la même | 1 *(déduplication)* |
| découverte d'un autre arbre | 2 |
| suivi d'une option | 3 |

Et surtout, elle **survit à la supernova** comme au **rechargement complet de
la page** — 3 clés retrouvées en stockage persistant après redémarrage.

Le HUD affiche la progression sous la forme `mémoire n/72`.

## Parcours vérifié

Sur l'arbre le plus riche (12 branches, 9 options) : la branche de départ
propose 3 options pointant vers les branches 2, 3 et 4 ; le saut aboutit sur la
bonne branche, qui se termine faute d'option. Les liens `goto` fonctionnent.

## Ce qui manque

- **L'interface est un pavé de texte**, pas la présentation du jeu.
  `DialogueGUI` est la plus grosse classe du build (~580 lignes) : mise en page,
  apparition caractère par caractère, curseur, gestion du crénage.
- **Les branches `eventbased` ne se déclenchent pas** : il n'y a pas de système
  d'événements.
- **La connaissance n'ouvre rien.** Elle est enregistrée mais ne débloque aucune
  option ni aucun dialogue. C'est le pas suivant, et c'est lui qui donnerait son
  sens à la boucle.
- **Les contrôleurs de conversation par personnage** (`CoachConvoController`,
  `CuratorConvoController`, `RocketKidConvoController`…) ne sont pas portés.
