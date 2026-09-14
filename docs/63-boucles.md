# Ce qui boucle, et ce qui ne boucle pas

`geometry.js` faisait, depuis toujours, une seule chose de toutes les
animations :

```js
for (const g of res.animationGroups || []) { g.stop(); if (!g.name.startsWith("~")) g.play(true); }
```

`play(true)` : **en boucle**, sans exception. Le build ne fait pas ça, et il
suffisait de lire les seize clips pour le voir.

## Deux familles, deux règles

| | clips | comment on sait |
|---|---|---|
| legacy (`m_AnimationType == 1`) | 7 | le `m_WrapMode` du clip |
| Mecanim (`m_AnimationType == 2`) | 9 | `m_LoopBlend`, dans l'en-tête du muscle |

Pour un clip **legacy**, Unity résout en deux étages : si le clip est en
`Default`, c'est le `m_WrapMode` du composant `Animation` qui tranche ; si
celui-là est aussi en `Default`, Unity retombe sur **`Once`**. Les dix-neuf
composants `Animation` du build sont tous en `Default`, donc c'est le clip qui
décide seul :

| | wrap | |
|---|---|---|
| `Take 001` ×3, `PlayHarmonica` | 2 (Loop) | les trois PNJ qui jouent, lisent les étoiles, jouent de l'harmonica |
| `idle`, `PullOut`, `PutBack`, `Therm` | **1 (Once)** | |

Pour un clip **Mecanim**, le `m_WrapMode` ne veut rien dire — il vaut `Default`
sur les neuf — et la réponse est dans `m_MuscleClip.m_LoopBlend`, vrai partout :
ce sont des inactivités, elles bouclent.

**Treize bouclent, quatre s'arrêtent.** Le portage en bouclait seize.

## Les quatre qui s'arrêtent sont tous au même endroit

```
SolarSystemRoot / Player_Body / PlayerCamera / MarshmallowStick
    idle   PullOut   PutBack   Therm
```

Le **bâton à guimauve**, celui qu'on tient à la main. `PullOut` le sort,
`PutBack` le range, `Therm` est le thermomètre, `idle` l'attente. Jouées en
boucle, les deux premières feraient sortir et rentrer le bâton sans fin.

Et c'est là que la mesure devient intéressante : **aucune des quatre n'arrive
jusqu'au glTF.** L'export part des corps célestes (`findRoots`), et
`MarshmallowStick` pend sous la caméra du joueur, qui n'en est pas un. Les 34
clips que le portage exporte bouclent donc tous — légitimement.

> Le portage a donc **raison par accident** aujourd'hui, et le mécanisme n'en
> est pas moins nécessaire : le jour où le bâton sera exporté, il sortira avec
> son marqueur, et il jouera une fois.

Ce que cette page ajoute au portage n'est donc pas un changement visible : c'est
une règle correcte là où il y avait une hypothèse, et **deux mesures qui se
tiennent par la main** —

| | où | ce qu'il compte |
|---|---|---|
| `tests/05-extract.mjs` | côté build | 7 legacy / 9 Mecanim, et les **quatre** en `Once`, nommés |
| `tests/08-animation.mjs` | côté glTF | **zéro** clip sans boucle exporté |

Le second est un zéro **mesuré** et non calculé — la distinction que
[`51`](51-tour.md) avait payée. Le jour où le bâton sera porté, les deux
chiffres bougeront ensemble, et si un seul bouge, un test le dira.

## Le marqueur

Le glTF n'a pas de champ « boucle ». Le portage avait déjà une convention pour
ce genre de chose — le préfixe `~` des états Mecanim que le contrôleur ne
démarre pas — et elle sert une seconde fois :

```
Objet|Clip      l'état par défaut, en boucle
~Objet|Clip     un état que rien ne démarre
!Objet|Clip     un clip qui ne boucle pas
~!Objet|Clip    les deux
```

`extras.loop` porte la même information dans le fichier, pour qui l'ouvre. Le
nom est la voie sûre — Babylon le rend toujours — et `extras` la voie lisible ;
un test vérifie que les deux disent la même chose.

## Ce que cela laisse ouvert

`MarshmallowStick` est **un objet tenu en main, animé, que le portage n'a pas**.
Il rejoint la liste de [`08`](08-reste-a-faire.md) — non plus comme « ce que
l'alpha n'a pas », mais comme ce que le portage n'exporte pas encore, avec son
chemin exact et ses quatre clips nommés.

C'est le genre d'entrée qu'on préfère : une chose absente **dont on connaît
l'adresse**.
