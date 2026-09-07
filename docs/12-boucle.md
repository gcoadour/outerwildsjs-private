# Boucle temporelle

C'est le cœur du jeu, et c'est de la logique pure : aucun nouvel export
d'assets n'a été nécessaire.

## La durée n'est pas celle du jeu final

Le build porte `_loopDurationInMinutes = 20`. **La boucle de l'alpha fait
20 minutes**, là où le jeu commercialisé passera à 22. C'est le genre d'écart
qu'on ne peut pas deviner, seulement lire.

Autres constantes relevées :

| valeur | source |
|---|---|
| onde de choc : 30 000 u en 15 s, soit **2 000 u/s** | `SunSphereOfDeathBehavior` |
| musique de fin à **90 s** restantes | `EndOfTimeMusicController` |

## L'API d'origine

Une classe statique `TimeLoop` expose la fraction de boucle, les secondes
restantes et écoulées, le compteur de boucles, un drapeau empêchant la
supernova, et le redémarrage. Un message global `StartOfTimeLoop` porte le
numéro de boucle.

Cette fraction irrigue tout le jeu — la progression du soleil, la croissance de
Dark Bramble (`BrambleManager`), l'animation de corruption, les étoiles
lointaines. C'est l'horloge commune.

## Ce qui est porté

`web/src/timeloop.js` implémente le compte à rebours, le déclenchement de la
supernova, la propagation de l'onde de choc à 2 000 u/s, la mort quand elle
rattrape le joueur, et le redémarrage avec incrément du compteur.

L'implémentation est la mienne ; seules les constantes viennent du jeu.

La progression alimente aussi le shader du soleil : l'étoile rougit, s'agite et
enfle à mesure que la boucle avance, puis explose.

### Vérification

Boucle accélérée 3 000 fois, quatre cycles complets enchaînés en 10 secondes,
**0 erreur** :

```
restant=   0  frac=1.00  supernova=oui  mort=oui (supernova)  boucle=0
restant=1200  frac=0.00  supernova=non  mort=non              boucle=1
restant=   0  frac=1.00  supernova=oui  mort=oui (supernova)  boucle=1
restant= 450  frac=0.63  supernova=non  mort=non              boucle=2
```

Les ressources se réinitialisent (oxygène revenu à 400), le joueur repart de
son point d'apparition, le vaisseau est débarqué.

Le rayon d'onde affiché (300 000 u) est un artefact de l'accélération extrême :
à 3 000×, l'onde avance énormément entre deux images. À vitesse normale elle
progresse continûment et atteint les planètes extérieures en 15 secondes.

## Ce qui manque

- **La mémoire entre boucles**, qui est tout l'intérêt du jeu. Seul le compteur
  survit. La persistance des connaissances suppose le système de dialogue et
  `PlayerData`, non portés.
- **La séquence de flashback.** `Flashback` porte ses constantes (délai de 2 s,
  durée d'image initiale 0,6 s décroissant par 0,9 jusqu'à 0,06 s, fondu au
  blanc de 0,8 s) mais l'effet n'est pas implémenté.
- **Le spectacle de la supernova.** L'étoile enfle et rougit, mais les
  comportements dédiés (`SunExplosionBehavior`, `ShrinkSunBehavior`,
  `SunSurfaceProgressionBehavior`, `SunCoronaProgressBehavior`) ne sont pas
  portés, et la vérification n'a validé que la machine à états, pas le rendu.
- **Les autres causes de mort.** Seules l'asphyxie et la supernova tuent.
  `DeathType` en énumère davantage, et `PlayerDeathHandler` n'est pas porté.
- **`GetPreventSupernova()`**, qui permet de suspendre la fin des temps.
