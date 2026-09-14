# Quatre lois de commande qui ne commandaient rien

Quatre des vingt-six méthodes sans appelant de [`docs/90`](90-methodes.md)
tenaient des règles de **commande** — ce que le joueur fait et ce que le jeu en
fait. Chacune était juste ; aucune n'était branchée.

## La sensibilité de vol ne faisait rien

Le menu du build pose **deux** sensibilités, `lookSensitivity` et
`flightSensitivity`, chacune entière de 1 à 10, neutre à 5, en anneau
([`docs/65`](65-onde.md)). Le portage affichait les deux, sauvegardait les deux,
et n'appliquait que la première :

```js
lookFactor()   { return invert * lookSensitivity / 5; }   // appliquee
flightFactor() { return flightSensitivity / 5; }          // appelee par personne
```

On pouvait donc régler la sensibilité de vol de 1 à 10 et ne rien sentir. Elle
s'applique désormais **aux commandes du vaisseau**, et l'inversion est passée
dans `flightFactor` plutôt que laissée à l'appelant : le menu ne pose qu'un
`invertY`, il vaut pour les deux, et les garder côte à côte est ce qui les rend
comparables.

## Le mur de combinaison lisait le champ plutôt que de poser la question

`suitBarrierPush` testait `equipment.suit` en ligne ; `Equipment.barrierSolid()`
répond exactement à cette question — *le mur est-il solide ici ?* — et personne
ne la lui posait. Deux sources pour une règle, dont une écrite à côté.

Le contrôle navigateur en a fait les frais tout de suite : il passait un objet
nu `{ suit: false }` là où il faut maintenant un `Equipment`. C'est un bon
symptôme — une règle qui a une seule source refuse les faux témoins.

## Un mort accordait encore sa vitesse

`Resources.canThrust` rend `fuel > 0 && !dead`. Le portage testait
`resources.fuel > 0`. La différence ne se voit qu'à un moment précis : mort, sac
encore plein, on pouvait toujours s'accorder à la vitesse d'un référentiel visé.

## L'invulnérabilité se lisait par-dessus son accesseur

`PlayerData.isInvulnerable` était écrit, testé, et le moteur lisait le champ
`pdata.invulnerable` directement — ou plutôt la *valeur de retour* de
`startOfTimeLoop`, ce qui revenait au même tant que les deux ne divergeaient
pas. Ils sont maintenant lus par le même chemin.

## Ce qui reste, et pourquoi c'est intéressant

Vingt-deux méthodes sans appelant après ce lot. Deux d'entre elles,
`.padAxis` et `.padButton`, disent quelque chose de précis :
`web/src/gamepad.js` tient **sa propre** table de traduction bouton → touche,
écrite d'après `docs/61`, quand `input.js` porte déjà la liaison `pad` de chaque
canal. Deux sources pour une manette — la même forme de dette que le mur de
combinaison, à une échelle plus grande, et qui demande un lot à elle seule.

## Gardé par

- `tests/09-jeu.mjs` — `settings.js` n'avait **aucun** test : les deux facteurs
  au neutre, la sensibilité de vol qui double sans toucher au regard,
  l'inversion qui porte sur les deux, et l'anneau qui ramène 10 à 1.
- `tools/15_verify.py --profil` — régler la sensibilité de vol dans la page
  change bien le facteur de vol, et le mur réclame la combinaison en
  interrogeant un vrai `Equipment`.
