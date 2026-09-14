# Les deux derniers seuils : la chambre en apesanteur et la station météo

[`docs/83`](83-seuils.md) et [`docs/84`](84-ambiance.md) ont branché quinze des
dix-huit `EntrywayTrigger` de la scène. Il en restait trois, et ils gardaient
deux mécaniques que le portage **écartait explicitement**, chacune avec un
commentaire qui disait pourquoi — et chacune à tort.

## La chambre en apesanteur du village

`web/src/volumes.js` :

> Un des quatre (`ZeroGZone/ZeroGChamber`) prend sa forme de ses déclencheurs
> d'entrée (`_useEntrywayTriggers`) et non d'un collider : il n'a donc pas de
> volume, et c'est vrai du build, pas un défaut d'extraction.

Tout est exact. Et trois lignes plus bas :

```js
export function zeroGAt(fields, worldPoint, shiftOf = null) {
  for (const f of fields) {
    if (!f.volume) continue;        // <- la chambre sort ici
```

Le constat était juste, la conséquence n'en avait pas été tirée : la chambre où
l'on s'entraîne à l'apesanteur, au village, **ne donnait aucune apesanteur**.
C'est la même forme d'erreur que [`docs/84`](84-ambiance.md) — un commentaire
exact posé sur un code qui fait autre chose — et c'est la deuxième fois en deux
lots qu'elle se présente. Elle a maintenant un nom : il faut lire le commentaire
*contre* le code, pas avec lui.

## Le champ de la station météo

`web/src/gravity.js` écartait de même tout champ directionnel sans collider :

> Sans volume lisible, sans intensité lisible, le champ est ÉCARTÉ plutôt que
> deviné.

C'est une bonne règle — sauf pour le seul champ du build qui déclare
`_useEntrywayTriggers` : `Field_WeatherStation`, sur Brittle Hollow, avec ses
**deux** portes. Il n'a pas de collider parce qu'il n'en a pas besoin : on y
entre par une porte et on en sort par l'autre. La règle « pas de forme, pas de
champ » le rangeait avec les champs mal extraits, alors qu'il est parfaitement
extrait — il n'a simplement pas la forme qu'on lui cherchait.

`strongestDirectional` accepte désormais un champ marqué `present` par
l'appelant, sans test de forme. La distinction est importante : le moteur
interroge son champ dominant en un **point** quelconque, et une présence est
propre à un **observateur**. Marquer le champ pour l'image, plutôt que
d'interroger sa forme, est la seule façon de faire tenir les deux ensemble.

## Ce que cela ferme

Dix-huit seuils sur dix-huit ont maintenant un lecteur :

| seuils | ce qu'ils commandent | depuis |
|---:|---|---|
| 8 | cinq `SunlessZone` (ambiance globale éteinte) | [`83`](83-seuils.md) |
| 8 | les zones sonores posées sur les mêmes objets | [`84`](84-ambiance.md) |
| 5 | la musique de la cité enterrée | [`84`](84-ambiance.md) |
| 1 | l'ambiance de la trappe du vaisseau | [`84`](84-ambiance.md) |
| 1 | la `DarkZone` (invite de lampe) | [`83`](83-seuils.md) |
| 1 | la chambre en apesanteur | ici |
| 2 | le champ de la station météo | ici |

(les huit premiers comptent deux fois : `SunlessZone` et `AudioVolume` sont
posés sur le même objet et partagent ses portes.)

## Le piège du fichier, une fois de plus

Ajouter `champsParSeuils` à `window.__lots` a suffi à empêcher la page de
démarrer : l'objet est construit à la ligne 731, la constante déclarée à la
ligne 758. **Zone morte temporelle**, encore
([`docs/73`](73-passages.md), [`docs/77`](77-sons.md), et la note de
`main.js` qui en comptait déjà trois). Un getter règle le cas, et
`tools/15_verify.py --repli` l'a attrapé en douze secondes — c'est exactement ce
pour quoi ce contrôle existe : il est le seul à exécuter `boot()` sans les
289 Mo.

## Gardé par

- `tests/09-jeu.mjs` — la chambre franchie par sa porte, et sa priorité qui
  couvre un volume ordinaire.
- `tests/05-extract.mjs` — la chambre a une porte et elle est sur Timber Hearth ;
  `Field_WeatherStation` est le seul champ directionnel par seuils, et il n'a pas
  de forme.
- `tools/15_verify.py --profil` — quatre champs d'apesanteur montés dont un sans
  forme avec sa porte, un champ directionnel par seuils avec ses deux portes, et
  — debout au village de Timber Hearth — la station météo de Brittle Hollow qui
  n'est pas présente.
