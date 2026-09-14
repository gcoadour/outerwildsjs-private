# La boucle : trois nombres écrits de mémoire, deux faux

`web/src/timeloop.js` portait en tête :

> Valeurs relevées dans le build :
>   - durée de boucle : 20 minutes (le jeu final passera à 22) ;
>   - l'onde de choc de la supernova parcourt 30 000 unités en 15 secondes, soit
>     **2 000 u/s** ;
>   - la musique de fin se déclenche à 90 secondes restantes.

Une seule des trois était juste.

## Dix-huit minutes, pas vingt

`TimeLoop` est posé sur `SolarSystemRoot`, et son unique champ sérialisé est
`_loopDurationInMinutes = 18`. Le composant n'était pas extrait : la constante
avait donc été écrite de mémoire — celle du jeu **final**, qui n'est pas cette
alpha. Deux minutes sur vingt, c'est onze pour cent de la boucle, et c'est le
genre d'écart qu'on ne voit jamais en jouant tout en le sentant partout.

`TimeLoop` est maintenant extrait comme singleton, la durée vient du build, et
le repli explicite porte la valeur mesurée plutôt qu'une autre.

## L'onde de choc n'est pas linéaire

`SupernovaVolume.Update`, en entier :

```
t          = (Time.time - _initSupernovaTime) / 15
localScale = Vector3.one * 2 * 30000 * Mathf.Pow(t, 3)
```

Pour une sphère de rayon 0,5, cela donne un rayon de **30 000 · (t/15)³**. La
courbe est cubique, et les deux ne se rejoignent qu'au bout :

| t | linéaire (portage) | build |
|---:|---:|---:|
| 1 s | 2 000 | **9** |
| 5 s | 10 000 | **1 111** |
| 7,5 s | 15 000 | **3 750** |
| 12 s | 24 000 | **15 360** |
| 15 s | 30 000 | 30 000 |

Le portage vous tuait à cent unités du soleil en un vingtième de seconde ; le
build met **2,24 secondes**. Et c'est tout le contraire d'un détail : la vraie
onde laisse quelques secondes d'un calme trompeur, où l'on croit avoir le temps,
puis arrive d'un seul coup. La courbe *est* la sensation.

## Le chronomètre part de l'explosion, pas du déclenchement

`SupernovaVolume` écoute **deux** événements :

```
OnTriggerSupernova : joue _coreCollapse            (Supernova_Start2_Longer)
OnSunExploded      : _initSupernovaTime = now ;
                     joue _energyWave et _solarExplosion
```

Entre les deux, l'étoile s'effondre — `SunExplosionBehavior` la fait fondre vers
son `_endScale` à `deltaTime · 3`, et détone quand son échelle passe **sous**
150. L'instance ne sérialise ni le taux ni l'échelle finale : la durée de
l'effondrement n'est donc pas mesurable depuis la scène, et le portage fait
partir les deux annonces ensemble. C'est dit dans le code plutôt que tu.

## La fin des temps attend que la partie commence

`TimeLoop.Start` :

```
si _startTimeLoopOnReload :                       # la statique nait a VRAI
    FireEvent("StartOfTimeLoop", _loopCount)
    _preventSupernova = !PlayerData.KnowsLaunchCodes()
sinon :
    FireEvent("ResumeSimulation")
_startTimeLoopOnReload = true
```

et `TimeLoop.Update` ne déclenche `TriggerSupernova` que si `!_preventSupernova`.

**Tant qu'on n'a pas appris les codes de lancement, l'étoile n'explose pas.** Le
compte à rebours tourne, la musique de fin se déclenche, mais la fin des temps
attend. C'est exactement le pendant de `PlayerData.IsInvulnerable`
([`docs/81`](81-invulnerable.md)) : le jeu refuse de vous tuer — par les dégâts
là, par le temps ici — tant que vous n'avez pas fait le geste qui commence la
partie. Deux mécaniques, une seule idée, et le portage n'avait ni l'une ni
l'autre.

Le calcul se fait **une fois**, au démarrage de la boucle : apprendre les codes
en cours de route ne rallume pas la fin des temps pour ce tour-ci. Le champ
`preventSupernova` existait dans le portage depuis longtemps — écrit, commenté,
et jamais positionné par personne.

`ResetSimulation` est le seul chemin qui remet `_startTimeLoopOnReload` à faux,
et c'est pour cela que `ResumeSimulation` existe : reprendre une simulation
remise à zéro ne recommence pas une boucle.

## Gardé par

- `tests/09-jeu.mjs` — dix-huit minutes, la courbe cubique en trois points (un
  huitième à mi-chemin, un vingt-septième au tiers, plafonnée au bout), l'onde
  qui met plus d'une seconde à couvrir cent unités, la prévention qui suit les
  codes et **ne change pas en cours de boucle**, et les cinq annonces dans leur
  ordre.
- `tests/05-extract.mjs` — `_loopDurationInMinutes` vaut 18 dans la scène.
- `tools/15_verify.py --profil` — la page tourne sur dix-huit minutes, annonce
  `StartOfTimeLoop` au chargement, et sa prévention s'accorde aux codes du
  profil.
