# Outils du joueur et sources de savoir

Suite de `docs/23-connaissance.md` : le mécanisme de déblocage existait, mais un
seul savoir était gagnable. `web/src/tools.js`.

## L'audit des cinq savoirs

En cherchant **qui écrit** chaque drapeau de `PlayerData`, le résultat est
sévère et instructif :

| savoir | source dans le code | instances en scène |
|---|---|---|
| `KnowsHowProbesWork` | `ProbeLauncher`, `ProbePromptController` | **1** — vivant |
| `KnowsHowShipProbesWork` | `ProbePromptController_Old` | **0** — code mort |
| `HasCompletedTraining` | *lu par `CoachConvoController`, jamais écrit* | — |
| `KnowsTargeting` | *référencé nulle part hors `PlayerData`* | — |
| `KnowsHowTelescopeWorks` | *rien ne l'accorde* | objet présent (1) |

**Un seul des cinq a une source vivante.** Les autres sont soit du code mort
— le suffixe `_Old` ne trompe pas — soit des drapeaux déclarés et jamais
câblés. C'est une alpha en cours de construction, et il aurait été malhonnête
d'inventer des sources pour combler le vide.

## Une erreur de ma part, corrigée

J'accordais les codes de lancement en approchant du vaisseau. C'était faux.
`LaunchTerminal` **écoute** l'événement `LearnLaunchCodes` pour se déverrouiller ;
c'est `CuratorConvoController` qui l'émet. Ce sont donc les **conversations** qui
donnent les codes, et le vaisseau reste au sol tant qu'on n'a pas parlé à la
bonne personne.

## Les outils

Dans la scène, `Telescope` et `ProbeLauncher` sont portés par la **caméra du
joueur**, pas posés dans le monde : ce sont des instruments qu'on utilise, pas
des lieux à visiter.

**Télescope** (touche `T`) — champ de vision de **60° à 10°** en **2 secondes**,
valeurs du build, soit un grossissement de ×6.

**Lanceur de sonde** (touche `F`) — la sonde suit le champ gravitationnel
dominant, comme le joueur.

## Vérifié

| contrôle | résultat |
|---|---|
| champ de vision au repos | 1,047 rad (60°) |
| après 2,6 s de télescope | 0,255 rad, zoom 0,91, ×6 |
| retour au repos | champ élargi à nouveau |
| sonde | 1 lancée, 1 en vol |
| codes via le conservateur | accordés ; via le vaisseau : non |
| total | **3/6 savoirs**, 0 erreur |

## Nuance de fidélité

Relier l'usage du télescope à `KnowsHowTelescopeWorks` est **mon ajout**. Le
drapeau existe dans `PlayerData` et n'est écrit nulle part dans le build. Le
lien est plausible — c'est manifestement ce qu'il attendait — mais il n'est pas
extrait, et le distinguer importe.

En revanche, l'attribution par le lanceur de sonde et par les conversations est
fidèle : le build le fait.

## Ce qui manque

- **`HasCompletedTraining` et `KnowsTargeting` restent sans source**, faute de
  zone d'entraînement et de système de ciblage dans le build.
- Les sondes n'ont **ni rendu ni retour d'information** : elles volent, on ne
  les voit pas. `_probePrefab` n'est pas porté.
- Le télescope ne fait que zoomer : pas de superposition, pas de repérage de
  signaux.
