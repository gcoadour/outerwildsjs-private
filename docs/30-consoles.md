# Consoles et objets de bord

Quatre systèmes que le portage n'avait jamais regardés, un exemplaire de chacun
dans la scène.

## L'ordinateur de bord n'est pas ce que je croyais

J'avais annoncé `ShipComputer` comme « la console par laquelle le jeu choisit une
cible de pilote automatique ». **C'est faux.** Ce n'est pas un sélecteur de
destination mais le **registre des lieux** : on fait défiler sept notices à
gauche et à droite, et celles des endroits déjà explorés s'ouvrent sur leur
description. Les autres affichent `<   UNEXPLORED   >` et `---------`.

C'est donc l'exact pendant de la mémoire d'exploration que le portage tenait
déjà — `PlayerData.HasExploredPlanet`, la même que celle qui remplit la carte.

Et les textes sont du contenu de jeu que rien ne remplaçait :

| lieu | extrait |
|---|---|
| Soleil | *UNSTABLE — Accelerated nuclear fusion detected in core.* |
| Brittle Hollow | *EXTREMELY UNSTABLE: Crust weakened by heavy volcanic bombardment.* |
| Dark Bramble | *Source of last known transmission from Trailblazer 1 — Least explored of all planets.* |
| Giant's Deep | *Core: dense liquid (unverified: no expedition data).* |
| Hourglass Twins | *Binary planets locked in a stable orbit.* |
| Comète | *Closest distance to Sun: 395m — Farthest: 22km.* |
| Timber Hearth | *The cradle of our species.* |

Le jeu annonce la supernova dans un terminal que rien n'oblige à consulter, et
prévient que la croûte de Brittle Hollow est en train de céder. Ces sept notices
étaient dans le build depuis le début.

Le portage ouvre le terminal depuis le poste de pilotage — le vaisseau n'ayant
pas d'intérieur ici, il n'y a pas de console à viser.

## La lampe

Portée **80**, bornée par le secteur quand il en impose une. Le détail qui compte
est qu'elle **s'éteint d'elle-même** : le jeu appelle `TurnOff` à l'entrée dans
le vaisseau, la carte, une conversation, un point d'accroche ou le mode caméra
satellite. Le portage reproduit les quatre premiers.

Son invite ne s'affiche que si elle est éteinte, qu'on porte la combinaison, et
qu'on est dans le noir — une zone sombre, ou la face nuit du corps.

## La guimauve

`_cookTime` vaut 5 et la formule est

```
_toastLevel += chaleur / (cookTime × 100) × dt
```

À chaleur 100, il faut donc exactement cinq secondes pour arriver à 1 — vérifié :
0,2 par seconde. Elle n'est mangeable qu'à partir de **0,6**, et sa couleur
fonce en soustrayant le niveau à chaque composante, jusqu'au noir.

Son invite est la **seule du jeu posée au-dessus** du centre de l'écran
(`GetScreenCenterPos() − (0, 50)`), là où toutes les autres sont dessous.

## Ce qui reste de ces systèmes

- **`RemoteFlightConsole`** et **`SatelliteSnapshotController`** supposent une
  caméra déportée — piloter le vaisseau depuis l'observatoire, regarder par le
  satellite. Leurs invites sont au catalogue, la caméra ne l'est pas.
- **`ZeroGTrainingManager`** : l'entraînement en apesanteur. Son invite
  « Training » puis « Training Complete: All Systems Online » est extraite, mais
  le parcours qu'elle accompagne — une série de cibles à atteindre — n'a pas de
  données dans la scène au-delà du gestionnaire lui-même.
- La **chaleur du feu de camp** n'est pas simulée : la guimauve grille sur
  commande, pas par proximité d'un `HeatSource`.
