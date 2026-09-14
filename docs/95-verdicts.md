# Trois verdicts : brancher, marquer, ou supprimer

[`docs/90`](90-methodes.md) avait trouvé trente-cinq méthodes sans appelant.
Quatre lots plus tard il en reste **quatorze**, et ce document dit comment on a
tranché — parce que le comment importe plus que le chiffre.

Pour chacune, une seule question : **qu'est-ce que le build en fait ?**

## Brancher — la règle existe et le geste manquait

C'est le cas le plus fréquent et le plus heureux. Trois lots en sont sortis :
la sphère de l'observatoire ([`91`](91-remise-a-zero.md)), la tour de lancement
([`92`](92-tour.md)), les règles de commande ([`93`](93-commandes.md)) et les
deux tables de la manette ([`94`](94-manette.md)). Chaque fois, chercher ce qui
devrait appeler la loi a fait découvrir une mécanique entière que personne
n'avait vue manquer.

## Marquer — le build répond, et sa réponse est « rien »

`Probe.scan` porte `ProbeScanner` : ce qui entre dans une sphère de trente
unités, et le plus proche. La scène pose **zéro** `ProbeScanner` et **zéro**
`PointOfInterest`. La mécanique est écrite d'après l'IL, elle est éprouvée, et
il n'y a rien à quoi l'appliquer dans cette alpha. C'est exactement le cas
`// @vide` ([`docs/74`](74-etalons.md)), et le marqueur exige sa raison :

```js
// @vide la scene ne pose ni ProbeScanner ni PointOfInterest : zero instance
scan(points) { … }
```

Les deux marqueurs, `@mesure` et `@vide`, ne fonctionnaient que sur des
`export`. Les faire fonctionner sur les méthodes était nécessaire dès lors que
le compte les voyait : les exiger sous forme d'export aurait poussé à exporter
pour faire taire un chiffre.

## Supprimer — deux sources pour une règle

Trois méthodes n'étaient pas du travail en attente : c'étaient des doublons, et
le doublon est pire que l'absence parce qu'il a l'air d'un mécanisme.

**`Flashlight.promptVisible`** posait **quatre** conditions pour afficher
l'invite de lampe. `Flashlight.CheckPromptStatus` en pose **sept**, et
`flashlightPromptVisible` les porte toutes depuis [`docs/67`](67-annonces.md).
Garder les deux, c'était garder une règle fausse à côté de la vraie.

**`TimeLoop.endMusic`** comparait le temps restant à un `END_MUSIC_AT` local. La
vraie loi vit dans `reactaudio.js`, avec sa propre configuration et ses deux
fondus. Deux sources pour un seuil — et le module en gardait sa propre copie.

**`Marshmallow.burnt`** rendait `toast >= 1`. Le build n'en fait **rien** :
`Marshmallow.Update` se contente d'arrêter d'assombrir, la couleur étant
`initColor − toastLevel` bornée à zéro. Le portage bornait déjà dans `update` ;
le getter doublait le plafond, il ne portait pas de règle.

## Une lecture qui a parlé

`cloudCount` et `cloudsAttached` — « combien le build en décrit » et « combien
on en a rattachés » — étaient deux lectures écrites pour être **comparées**, et
personne ne les comparait. Les mettre face à face dans le navigateur a tout de
suite dit quelque chose : le build en décrit vingt-quatre, et il s'en rattache
**zéro** au village.

Ce n'est pas un défaut : le rattachement se fait par position sur le lot de
géométrie qui porte la voûte, et le parcours de contrôle ne le charge pas. Ce
que le contrôle garde n'est donc pas « vingt-quatre » mais **« zéro ou
vingt-quatre, jamais entre les deux »** : un rattachement partiel voudrait dire
que la tolérance d'une unité dérive, et c'est cela qu'on veut voir tout de
suite. Un invariant garde une mesure, pas un souhait.

## Ce qui reste

Quatorze méthodes, et elles se rangent toutes dans la première famille : des
gestes qui manquent. `enterTelescope` / `exitTelescope` attendent que la lunette
passe par le point d'accrochage ; `startFlash` attend l'éclair de brouillard
d'un passage ; `die` attend que la mort passe par l'état du joueur plutôt que
par son drapeau ; `wipe` attend une commande d'effacement. Chacune est un lot,
et chacune ouvrira probablement plus grand qu'elle.
