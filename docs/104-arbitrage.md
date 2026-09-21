# L'ambiance ne s'additionne pas, elle s'arbitre — et trois règles inventées

[`84`](84-ambiance.md) avait ouvert les zones d'ambiance et corrigé deux erreurs
de lecture. Il en avait laissé trois, et les trois se ressemblent : là où le
build n'avait pas encore été lu, le portage avait **écrit une règle plausible**
et l'avait gardée sous un test. Le quatrième dénominateur
([`103`](103-refait.md)) a nommé les classes à lire — `AudioVolume` 0/3,
`DayNightAudioVolume` 0/4 —, et `AudioDetector` était derrière elles.

| ce que le portage tenait | ce que le build fait |
|---|---|
| les couches jouent **ensemble** | la couche 0 **concourt** avec toutes les autres |
| à égalité, **la plus petite** zone gagne | à égalité, elles jouent **toutes** |
| changer de zone : on **libère** la couche d'abord | fondu **enchaîné**, les deux à la fois |
| le fondu est linéaire — **un choix du portage** | il est linéaire, et c'est une **mesure** |
| `_dayWindow` : *« signification non établie »* | la **largeur en degrés** de l'arc de jour |

## 1. La couche 0 n'est pas une couche

`AudioDetector` tient, par couche, une liste triée par priorité croissante ;
`GetHighestPriority(couche)` est donc la priorité du **dernier** élément, et
vaut −1 quand la couche est vide — `Awake` pose la couche 0 dès le départ, ce
qui rend ce −1 atteignable pour elle seule.

```
UpdateActivation()
    bool couche0 = false;
    if (GetHighestPriority(0) < _highestNonZeroPriority) DeactivateLayer(0);
    else { ActivateLayer(0); couche0 = true; }
    foreach (couche l != 0)
        if (!couche0 || GetHighestPriority(l) >= GetHighestPriority(0))
             ActivateLayer(l);
        else DeactivateLayer(l);
```

`_highestNonZeroPriority` dit mal ce qu'il est : ce n'est pas « la plus haute
priorité non nulle », c'est **le maximum sur les couches non nulles**. La
couche 0 joue donc contre le meilleur de toutes les autres réunies :

- elle gagne → elle joue, et **toute couche moins bien classée qu'elle se
  tait** ;
- elle perd → elle se tait, et **toutes les autres jouent**.

C'est la loi qui donne aux intérieurs leur silence. Le sas du vaisseau est à
100 : rien ne l'approche, tout se tait dès qu'on y entre. Le musée est à 2, et
il éteint le village — mais il est couvert à son tour par le fluide des
profondeurs (couche 1, priorité 3), qui rend du même coup la parole à la
musique. Le portage faisait sonner les trois ensemble.

## 2. À égalité, tout joue

```
ActivateLayer(l)
    for (int i = liste.Count - 1; i >= 0; i--) {
        if (liste[i].GetPriority() != GetHighestPriority(l)) break;
        if (liste[i].IsActive()) break;
        liste[i].Activate();
    }
```

Il remonte la liste **tant que la priorité égale la plus haute**. Cinq zones de
la couche 1 sont à 0 ; celles qui se recouvrent sonnent donc ensemble.

Le portage départageait par la taille, et [`84`](84-ambiance.md) le disait
franchement : *« c'est un choix du portage — le build ne départage pas les
égalités, il garde simplement la première arrivée »*. La deuxième moitié de la
phrase était fausse aussi, et c'est ce qui rend le cas intéressant : **on avait
pris soin de nommer l'invention, sans avoir vérifié ce qu'elle remplaçait.**

## 3. Le fondu : une durée, pas un rythme

`OWAudioSource` tient les quatre méthodes, et la forme y était depuis toujours :

```
FadeTo(cible, duree, pause)
    if (!source.isPlaying) source.Play();
    _initFadeVolume = _localVolume;          // DE LA OU L'ON EST
    _targetFadeVolume = cible; _fadeDuration = duree;
    _initFadeTime = Time.time; _fadingOut = false;
UpdateLocalFade()
    float t = _fadeDuration > 0
            ? Mathf.Clamp01((Time.time - _initFadeTime) / _fadeDuration) : 1;
    _localVolume = _initFadeVolume + (_target - _initFadeVolume) * t;
    if (_localVolume <= 0 && _fadingOut)
        { if (_pauseOnFadeOut) source.Pause(); else source.Stop(); }
```

Linéaire, donc — ce n'était pas un choix, c'était une mesure qu'on n'avait pas
faite. Et **le piège est dans `FadeTo`** : la durée est remise à neuf à chaque
appel, depuis la valeur courante. Un fondu interrompu à mi-chemin puis inversé
ne reprend pas le même rythme ; il se redonne les deux secondes entières pour
la moitié qui reste.

Le portage avançait `gain += dt / duree`, un rythme constant. Sur un aller-
retour de seuil — ce qu'on fait tout le temps en longeant une grotte — il
redescendait deux fois trop vite. Le test le mesure à l'endroit exact où les
deux lois divergent : à mi-montée, une seconde de sortie donne **0,25** et non
zéro.

Même idiome que `FadeLight.Update`, déjà porté ailleurs dans le moteur : deux
fondus qui se chevauchent partent de là où l'on en était. Le build n'en a
qu'un.

## 4. Deux champs sérialisés que rien ne lisait

Ils étaient extraits depuis [`84`](84-ambiance.md), et jamais lus. Ils ne sont
pas du confort : ils décident de ce qu'on entend **en revenant** quelque part.

| champ | qui le porte | ce qu'il fait |
|---|---|---|
| `_randomizePlayhead` | `WindyAmbience`, `VillageAmbience_Day` | la boucle repart d'un point tiré au hasard |
| `_pauseOnFadeOut` | `VillageMusic`, et elle seule | la musique se met en **pause** au lieu de s'arrêter |

`FadeIn` ne remet à zéro que si la source **ne joue pas** : une zone reprise en
plein fondu de sortie continue d'où elle en était. Et `RandomizePlayhead` pose
`time` sans rien demander — elle défait donc une pause. Aucun volume ne porte
les deux drapeaux, mais la loi n'a pas à inventer une précédence qu'elle n'a
pas.

## 5. `_dayWindow` vaut 200, et 200 veut dire quelque chose

```
IsDay()
    float a = Vector3.Angle(_planetTransform.position - _dayPointTransform.position,
                            _dayPointTransform.position - soleil.position);
    return a < _dayWindow * 0.5f;
```

Le premier vecteur descend du point vers le centre de la planète, le second
suit le rayon de lumière. Face au soleil ils sont colinéaires (angle 0) ; à
l'opposé ils sont opposés (180). Le terminateur géométrique tombe donc à 90, et
le seuil, lui, est à `_dayWindow / 2` = **100**.

`_dayWindow` est la **largeur de l'arc de jour, en degrés**, centrée sur le
point subsolaire : 200 là où la géométrie en donnerait 180. Le jour se lève dix
degrés trop tôt et se couche dix degrés trop tard, ce qui laisse l'ambiance de
jour couvrir l'aube et le crépuscule au lieu de basculer au ras du terminateur.

`_usePlayerPosition` décide d'où l'on regarde : le joueur (`WindyAmbience`) ou
le volume lui-même (les deux zones du village). Une ambiance posée au village
bascule donc **à l'heure du village**, et non à celle de l'auditeur.

Le portage préférait son propre signal de nuit, tiré de la hauteur du soleil.
Il n'était pas absurde ; il n'était simplement pas celui du build, et il
manquait les dix degrés.

## 6. L'aube est un fondu enchaîné, pas un relais

Un `DayNightAudioVolume` porte **deux** sources — `_owAudioSrc` et
`_nightSource` — et `UpdatePlayState` les fond **en sens inverse au même
moment**. Deux clips sonnent donc ensemble pendant la bascule.

Un mélangeur rangé par couche ne pouvait pas dire ça : il descendait d'abord à
zéro, ce qui creusait un trou de deux secondes dans l'ambiance du village à
chaque aube. Le mélangeur est maintenant rangé **par source**, ce que
l'arbitrage réclamait de toute façon pour les ex aequo.

Et `VillageMusic` est un volume jour/nuit **sans clip de nuit** : la nuit, elle
fond vers zéro et ne monte rien. Elle se tait — puis, parce qu'elle est la
seule du build à porter `_pauseOnFadeOut`, elle reprend **à la même note** au
lever du jour. Cinq secondes de fondu, là où tout le reste en met deux.

## Ce qui n'est pas refait, et pourquoi on le dit

`AddAudioVolume` et `RemoveAudioVolume` entretiennent la liste triée et
`_highestNonZeroPriority`, et n'appellent `UpdateActivation` que lorsque la tête
d'une couche **bouge** — les autres chemins ne peuvent rien changer à l'image,
et cela se vérifie ligne à ligne. Ce portage évalue donc `UpdateActivation` à
neuf à chaque pas : même résultat, sans état.

Sans état, et c'est une différence assumée. `RemoveAudioVolume` ne recalcule
`_highestNonZeroPriority` que si le volume retiré était **actif** ; un volume
muet — parce que la couche 0 le couvrait — peut donc laisser derrière lui un
maximum périmé jusqu'au prochain `UpdateActivation`. C'est un défaut du build,
il dépend de l'**ordre** des entrées et des sorties, et aucune fonction pure ne
peut le porter.

> Un dénominateur qui compte les méthodes d'une classe lue ne dit pas seulement
> ce qui manque. Il dit où le portage a **écrit à la place de lire** — et ces
> endroits-là ne se signalent pas tout seuls, puisqu'ils sont couverts par un
> test qui bénit l'invention.
