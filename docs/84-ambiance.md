# Les zones sonores n'ont pas de forme non plus — et la correction qui l'a caché

[`docs/83`](83-seuils.md) a montré que `EntrywayTrigger` n'est pas une
contenance mais un **seuil**. Le même jour, une relecture de l'extraction audio
a montré que ce dépôt avait déjà rencontré le problème — et l'avait résolu de
travers, avec un test pour le bénir.

## La paraphrase

Six des dix-sept zones d'ambiance n'ont **aucun collider** :

| zone | corps | couche | priorité | portes |
|---|---|---:|---:|---:|
| `CaveVolume01` | Twin01 | 1 | 1 | 4 |
| `CaveVolume02` | Twin01 | 1 | 1 | 2 |
| `CaveVolume` | Timber Hearth | 0 | 2 | 1 |
| `MuseumVolume` | Timber Hearth | 0 | 2 | 1 |
| `MusicVolume` | Twin01 (cité enterrée) | 2 | 0 | 5 |
| `Hatch` | vaisseau | 0 | 100 | 1 |

Le commentaire de l'extracteur le disait déjà, et bien :

> la forme n'est pas sur l'objet du volume mais sur ses ENFANTS, qui portent les
> `EntrywayTrigger` auxquels il s'abonne. Six volumes sur dix-sept n'avaient
> donc aucune portée.

Le code, lui, faisait autre chose que ce que le commentaire décrivait :

```js
function volumeSousEnfants(gid) {
  for (const ptr of t.m_Children) {
    const v = ctx.volumeOf(cgid);
    if (v) return v;          // la PREMIERE boite trouvee
  }
}
```

La première boîte d'enfant, servie comme contenance. Pour `CaveVolume01`, la
grotte aux quatre portes de la première jumelle devenait **une** porte de onze
mètres : on n'entendait l'ambiance de la grotte qu'en se tenant dans une seule
de ses embrasures, et les trois autres entrées ne faisaient rien du tout.

Et rien ne le gardait. Aucun test n'interrogeait la forme des zones : le seul
filtre du moteur était `z.volume && z.file`, qui acceptait sans broncher une
forme fabriquée. C'est l'angle mort symétrique de celui de
[`docs/49`](49-queue.md) — là un invariant gardait une conclusion, ici une
conclusion n'avait besoin d'aucun invariant pour tenir, parce qu'elle était
écrite dans un commentaire juste au-dessus d'un code qui faisait autre chose.
**Un commentaire exact posé sur un code approximatif est plus difficile à voir
qu'un commentaire faux.**

## Ce que la mesure dit

Une zone d'ambiance est un `OWEffectVolume` comme une zone sans soleil :
`Awake` rend son propre collider déclencheur **et** s'abonne à tous les
`EntrywayTrigger` de sa descendance. Les deux chemins mènent au même
`AudioDetector.AddAudioVolume` — qui, soit dit en passant, journalise une erreur
si la même zone lui arrive deux fois (« *what the hell did you do!?* ») : le
build suppose qu'une zone n'a pas les deux à la fois, et c'est bien le cas ici.

L'extraction n'invente donc plus de forme. Elle émet ce que l'objet porte —
collider ou rien — plus le **corps porteur**, qui manquait : les positions
extraites sont celles de la scène au repos, et une boîte de porte de dix mètres
s'échappe en une fraction de seconde si on ne la ramène pas là où sa planète se
trouve ([`docs/46`](46-migration-lots.md)). Le moteur joint ensuite les seuils
par la **hiérarchie**, et par le corps : il y a deux `MusicVolume` dans la
scène, l'un sur la lune quantique avec sa sphère de cent, l'autre sous la cité
enterrée avec ses cinq portes, et le nom seul les confondrait.

Sur les dix-huit seuils de la scène, quatorze servent une zone sonore — les huit
des grottes et du musée servent **aussi** leur `SunlessZone`, puisque les deux
composants sont posés sur le même objet. Une grotte, dans cette alpha, c'est un
objet sans forme qui porte une ambiance, une extinction de lumière, et des
portes.

## L'égalité de priorité, maintenant que des zones n'ont plus de rayon

> **Ce paragraphe était faux, et [`104`](104-arbitrage.md) l'a défait.** Il est
> gardé ici parce que l'erreur est instructive : on avait pris soin de nommer
> l'invention, sans avoir vérifié ce qu'elle remplaçait. `AudioDetector` ne
> départage pas les égalités parce qu'il n'a pas à le faire — **à égalité,
> elles jouent toutes**. Et la couche 0 n'est pas une couche comme les autres :
> elle concourt avec toutes les autres réunies, et les couvre quand elle gagne.

Le portage départage deux priorités égales par la taille : « une pièce est plus
précise qu'une atmosphère ». Une zone sans collider n'a pas de taille ; elle
prend désormais celle de sa plus petite porte. C'est un choix du portage, dit
ici comme tel — le build ne départage pas les égalités, il garde la première
arrivée, ce qui dépend de l'ordre des `OnTriggerEnter` et ne se reproduit pas.

## Gardé par

- `tests/09-jeu.mjs` — la jointure par nom **et par corps** (les deux
  `MusicVolume`), une zone sans forme mais avec portes qui est gardée, et la
  présence qui monte par une porte et retombe par une **autre**, cinquante
  mètres plus loin : ce qu'une contenance posée sur une seule boîte ne pouvait
  pas décrire.
- `tests/05-extract.mjs` — dix-sept zones, six sans forme nommément, quatorze
  seuils joints, les quatre portes de `CaveVolume01` et les cinq de la cité.
- `tools/15_verify.py --profil` — zones montées et jointes dans la page ; debout
  au village, ce sont l'ambiance et la musique du village qui sonnent, et
  **aucune ambiance de grotte**.
