# Le pilote automatique n'a pas de phases, il a une méthode — et quatre messages mal aiguillés

`autopilot.js` n'avait **aucun test**, et ses quatre phases étaient une
reconstruction de bon sens :

```js
if (d <= arrival) { /* on ANNULE la vitesse */ }
const braking = (speed * speed) / (2 * this.ship.thrust);
if (d < braking + arrival) this.phase = "approche";   // on pousse a rebours
```

Le build n'a pas de machine à phases. Il a **une** méthode,
`ReadTranslationalInput`, appelée à chaque pas de physique, qui rend une
**direction de poussée** — et les quatre drapeaux ne sont que ce qu'elle a
décidé en chemin.

## 1. Le vecteur dont tout dépend, et son sens

```
OWRigidbody.GetRelativeVelocity(frame)
    return frame.GetVelocity() - this.GetVelocity();
```

Ce n'est **pas** « notre vitesse vue du référentiel », c'est son opposé : le Δv
qu'il reste à **ajouter**. Tout le reste de la méthode en découle — l'entrée de
poussée rendue est ce vecteur normalisé, pas son contraire. Se tromper de sens
ici donne un pilote qui fuit sa destination, et chaque signe de la méthode
bascule avec lui.

## 2. L'égalisation est un asservissement, pas une pose

```
float maxDv = GetMaxTranslationalThrust() * fixedDeltaTime;
float frac = 1f;
if (rel.magnitude < maxDv) frac = rel.magnitude / maxDv;
float reste = rel.magnitude - maxDv * frac;
if (reste < 0.01f) { ...événement... enabled = false; }
return InverseTransformDirection(rel.normalized * frac);
```

Au plus **une image de poussée maximale**, mise à l'échelle pour ne pas
dépasser — donc jamais de survitesse, et `reste` tombe exactement à zéro. C'est
fini sous **un centième d'unité par seconde**, pas sous une unité.

Accorder cent unités par seconde à cinquante d'accélération prend donc **deux
secondes**, et le portage le faisait en **zéro**. Il le disait, d'ailleurs :

> *« Le build laisse le pilote automatique y aller par la poussée ; le portage
> n'a pas son asservissement, et pose la vitesse. La différence se voit sur une
> seconde, pas sur le résultat. »*

Une seconde de jeu est précisément ce que ce portage cherche. La loi est
écrite ; le raccourci est supprimé, aux **trois** endroits qui l'appelaient —
la vue d'atterrissage, le sac dorsal, et le pilote lui-même.

## 3. La distance de freinage compte la gravité

```
float decel = accReferentiel + gravite + GetMaxTranslationalThrust();
float d = Pow(Abs(vAppro), 2) / (2f * decel);
if (d > distance - frame.GetAutopilotArrivalDistance()) {
    OnFireRetroRockets();
    InitMatchVelocity(frame);
    return Vector3.zero;
}
```

Deux choses que le portage n'avait pas :

- **la gravité et l'accélération du référentiel** entrent dans la décélération.
  La composante de gravité le long de l'axe d'approche est comptée **changée de
  signe** : tomber vers la cible retranche de la décélération, donc **allonge**
  le freinage. Approcher d'un corps lourd en freinant seulement sur la poussée,
  c'est freiner trop tard ;
- **on ne freine pas en poussant à rebours.** Au moment où la distance de
  freinage dépasse ce qui reste, le build tire ses rétro-fusées et **passe à
  l'égalisation** — c'est la même loi qui ralentit et qui accorde, et
  `_isFlyingToDestination` reste vrai pendant ce temps.

## 4. L'ordre des décisions est la loi

```
1. vAppro < -1            -> on s'éloigne : réalignement, poussée le long de rel
2. freinage > reste       -> rétro-fusées, puis ÉGALISATION
3. |travers| > poussée/10 -> réalignement ; et si vAppro > 10, poussée axiale COUPÉE
4. sinon                  -> approche : travers × |proj|/2, et axial inversé si
                             l'on ferme déjà
```

Le troisième cas est celui qu'on n'écrirait pas de soi-même : quand la dérive
de travers dépasse le dixième de la poussée **et** qu'on ferme à plus de dix
unités par seconde, tout va dans la correction latérale et rien dans l'axe. Le
pilote préfère arriver droit que vite.

## 5. `ReadRotationalInput` rend `Vector3.zero`

Deux instructions d'IL. Le pilote automatique **ne tourne rien** : l'orientation
du vaisseau pendant le voyage ne vient pas de lui. Une piste qui se ferme à la
lecture, comme `RadiationDetector.TotalLight` ([`103`](103-refait.md)) — et
savoir qu'elle ne vient **pas** de là vaut d'être écrit.

## 6. Les quatre messages étaient mal aiguillés

```
AutopilotGUI.Update()
    if (IsMatchingVelocity())
        if (IsFlyingToDestination()) "stage 3: firing retro-rockets"
        else                         "matching target velocity"
    else if (IsLiningUpDestination())    "stage 1: aligning flight path"
    else if (IsApproachingDestination()) "stage 2: accelerating towards destination"
```

Le catalogue du portage était juste — les quatre textes, leurs couleurs, leurs
durées. L'**aiguillage** ne l'était pas :

| clé du portage | ce qu'elle affichait | ce que le build y met |
|---|---|---|
| `alignement` | stage 1 | `_isLiningUpDestination` ✓ |
| `vol` | stage 2 | `_isApproachingDestination` — **rien ne la posait jamais** |
| `approche` | stage 3 | l'égalisation **pendant** un vol, pas une phase d'approche |
| `egalisation` | matching target velocity | l'égalisation **sans** destination ✓ |

Deux conséquences : le message le plus fréquent du vol (« stage 2 ») n'était
affiché nulle part, et « stage 3: firing retro-rockets » s'affichait pendant
qu'on accélérait encore.

> Un catalogue juste et un aiguillage faux se relisent comme du travail fini.
> C'est le genre d'erreur qu'aucun des trois premiers dénominateurs ne voit :
> les chaînes sont là, les clés sont là, et personne ne demande si la bonne clé
> sort au bon moment.

## Gardé par

- `tests/09-jeu.mjs` — le module n'en avait aucun. Le sens de
  `GetRelativeVelocity`, la composante signée, les deux régimes de
  l'asservissement (à fond puis la fraction utile), les trois cas de la
  distance de freinage, les **quatre branches dans l'ordre**, le zéro de
  `ReadRotationalInput`, la table des messages avec la priorité de
  l'égalisation — et deux trajets bout à bout : cent unités par seconde
  accordées en **cent pas de physique**, cinquante en cinquante.
