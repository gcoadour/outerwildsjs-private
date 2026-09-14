# Quatre lois qui n'étaient qu'importées

[`71`](71-quantique.md) a affûté `lois.mjs` : **un import n'est pas un appel**.
Six lois qui figuraient dans une ligne d'`import` de `main.js` et nulle part
ailleurs se sont révélées mortes. Trois ont été branchées là — le marqueur de
sonde. Voici les trois autres, plus une qui n'était même pas éprouvée.

## La poussière de vitesse

`MotionDust` ne sème **rien** sous trente unités par seconde. En dessous,
l'espace reste vide, et c'est ce qui donne son prix à la vitesse : on ne
*voit* qu'on va vite qu'à partir d'un seuil.

Au-delà, deux choses bougent en sens inverse :

```
débit     clamp(v × 0,1, 1, 100)      ↗ avec la vitesse
durée     clamp(8 − v × 0,1, 0,7, 8)  ↘ avec la vitesse
```

Plus on va vite, **plus il y a de traits, et plus ils sont courts**. Et le
système regarde la direction du mouvement : les traits sont alignés sur le
déplacement, pas semés au hasard.

> **Une rampe que le jeu ne parcourt jamais.** `alpha = clamp(v × 0,01, 0, 0,2)`
> atteint son plafond dès vingt unités par seconde ; le seuil, lui, en coupe
> trente. Entre les deux lois, l'alpha ne prend donc que **deux** valeurs, 0 et
> 0,2. La rampe existe dans le code du build et n'est jamais utilisée. C'est le
> build qui le dit, et l'invariant garde les deux valeurs plutôt qu'une
> interpolation qui n'arrive pas.

## On ne grille pas de loin

`RoastPromptEvent` coupe le grillage dès qu'on s'éloigne de plus de **quatre
unités** du feu. Sans cela on part la guimauve à la main et on la regarde cuire
en marchant — ce que le portage laissait faire.

Les huit invites du build portent la distance, et l'invariant garde qu'elles la
portent **toutes à la même valeur**.

## La toile qui tourne

`GazeWebAnimator` fait tourner deux anneaux **en sens inverse**, au **cube** des
fractions :

```
extérieur  = +300 × regard³ + 300 × charge³
intérieur  = −600 × charge³
```

Le cube est ce qui compte. À mi-regard, la toile tourne à **un huitième** de sa
vitesse finale, pas à la moitié : elle est presque immobile au début et emportée
à la fin. C'est cette accélération qui fait qu'on *sent* la charge monter —
l'interrupteur du regard ([`50`](50-regard.md)) n'avait aucune invite ni touche,
et la toile est tout ce qui dit ce qui se passe.

Une fois la charge pleine, `webAlpha` l'efface en deux secondes, linéairement,
et le composant s'éteint. Le build ne la remontre jamais.

Les deux anneaux sont désignés par pointeur, et leurs objets portent des noms
propres — `innerWeb`, `outerWeb` — ce qui suffit à les retrouver dans le glTF.

## La tempête de sable, qui n'a pas de forme à elle

`SandstormVolume` n'a **pas de collider**. `volumeOf` rend vide, et le portage
aurait pu en conclure qu'elle n'a pas de forme.

Sa forme est celle de ses **enfants** : quatre capsules qui se chevauchent le
long de l'entonnoir de sable entre les jumelles, de 31,6 à 21,4 de rayon et de
440 à 298 de haut.

C'est exactement ce pour quoi `CompoundTriggerVolume` existe :

```
entrée dans un enfant   si le collider n'est pas suivi → OnEntry, puis +1
sortie d'un enfant      −1 ; si le compte tombe à zéro → OnExit
```

**Quatre formes, une entrée, une sortie.** Sans ce compte, passer d'un cylindre
au suivant émettrait une sortie puis une entrée, et l'écran clignoterait à
chaque chevauchement.

`ScreenEffectController` tient `_sandstormCount` — un **compte**, pas un
booléen — et joue ses particules tant qu'il est positif. Le portage n'avait ni
le compte ni les particules.

> `sandstormVolumes` était la seule loi du dépôt **même pas éprouvée**. Elle
> l'est maintenant, et elle a amené avec elle `CompoundTrigger`, écrite pour
> elle et jamais appelée non plus.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 524** vérifications (+42) |
| sur le build | 371 vérifications |
| en navigateur, avec le build | **212** contrôles (+11) |
| en navigateur, sans le build | 13 contrôles |
| lois sans appelant | **29 → 23** |

## La leçon

> Une loi éprouvée a l'air vivante ([`68`](68-lois.md)). Une loi **importée** a
> l'air branchée. Ce sont deux mensonges différents, et le second est le plus
> dur à voir : il laisse une trace dans le fichier qui aurait dû l'appeler.
