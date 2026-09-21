# Le trou blanc éjecte en ligne droite, et le champ de débris est une laisse

`WhiteHoleVolume` porte trois champs sérialisés, et le portage les avait lus
tous les trois — en se trompant sur les trois.

| champ | ce que le portage en a fait | ce que le build en fait |
|---|---|---|
| `_radius` 50 | un rayon d'éjection, × 1,2 | la distance exacte de sortie, et la sphère qui doit être **libre** |
| `_exitConeAngle` 60 | le demi-angle d'un cône aléatoire, pour **tout** | le **double** du plafond d'un cône réservé aux **débris**, avec un **plancher** de 15° |
| `_debrisRadius` 750 | le rayon d'une sphère où les débris se dispersent | la longueur maximale d'une **laisse**, tirée par morceau |

## 1. Le joueur, le vaisseau et la sonde sortent droit devant

`BlackHoleVolume` a quatre méthodes d'engloutissement — `Vanish`,
`VanishPlayer`, `VanishShip`, `VanishProbe` — et les trois dernières mènent
toutes au même endroit :

```
WhiteHoleVolume.ForceWarp(body)
    Vector3 p = transform.position + transform.forward * _radius;
    ... pousse de cote ce qui traine dans les dix unites de p ...
    body.SetPosition(p);
    body.SetVelocity(_whiteHoleBody.GetVelocity()
                     + transform.forward.normalized * 20f);
```

**Déterministe.** Droit devant le trou blanc, à exactement son rayon, à vingt
unités par seconde, plus la vitesse propre du trou blanc. On ressort toujours au
même endroit et dans la même direction — ce qui est la moitié de ce qui rend le
passage lisible.

Le portage tirait une direction au hasard dans un cône de soixante degrés autour
d'une **verticale du monde**, à 1,2 fois le rayon, à trente unités par seconde.
Trois nombres et un axe, tous faux.

`ReceiveWarpedPlayer` ajoute une chose que `ForceWarp` ne fait pas : il **fait
pivoter le corps** pour que l'avant de la caméra s'aligne sur l'avant du trou
blanc (`Quaternion.FromToRotation`). On sort en regardant dans la direction où
l'on part. Et `ReceiveWarpedShip` se garde d'un double appel dans la même image
(`_lastShipWarpTime + deltaTime`).

## 2. Le cône existe, et il n'est pas celui-là

```
GetRandomExitTrajectory()
    float angle = Random.Range(15f, _exitConeAngle * 0.5f);
    float spin  = Random.Range(0f, 360f);
    Vector3 axe = Quaternion.AngleAxis(spin, transform.forward) * transform.up;
    return (Quaternion.AngleAxis(angle, axe) * transform.forward).normalized;
```

Deux pièges dans une ligne :

- **la moitié.** Un champ nommé `_exitConeAngle` valant 60 donne un cône dont le
  demi-angle plafonne à **30** ;
- **le plancher.** L'angle part de **15** : rien ne sort dans l'axe.

Et l'inclinaison se fait autour du **haut du trou blanc tourné autour de son
avant**, pas autour d'un axe du monde. Sans son orientation, il n'y a pas de
« devant » à suivre — c'est pourquoi `WhiteHoleVolume` entre dans
`WANT_ROTATION`, aux côtés de `SpawnPoint` et `ShipBody`.

Cette trajectoire ne sert **qu'aux débris**. Le joueur, le vaisseau et la sonde
passent par `ForceWarp`, qui ne l'appelle pas.

## 3. Le champ de débris n'est pas un nuage, c'est une sortie

Le portage dispersait les morceaux uniformément dans une sphère de 750, un
toutes les deux secondes, et disait honnêtement : *« Ce qui n'en vient pas : la
cadence, que le nom `_growQueue` ne chiffre pas. »*

Elle y est. `AddToGrowQueue` et `FixedUpdate` donnent la séquence entière :

```
1. englouti    renderer et collider detruits ; DebrisLeash.Init(trou blanc,
               _debrisRadius * Random.Range(0.2f, 1f)) ;
               localScale = Vector3.one * 0.1f ; position et vitesse du trou blanc
2. en file     au plus UNE sortie par seconde (_lastCheckTime + 1f), et seulement si
               Physics.CheckSphere(position, _radius) est vide — sinon
               « White hole exit blocked at <t> »
3. il grandit  localScale *= 1.05f PAR PAS DE PHYSIQUE, jusqu'a >= 1
4. il part     velocity = trou blanc + GetRandomExitTrajectory() * 20f
5. il reste    DebrisLeash freine au-dela de 80 % de sa laisse
```

Quelques nombres qui en découlent :

- `ln(10) / ln(1,05) = 47,2`, donc **quarante-huit** pas pour atteindre 1 —
  **0,96 s** à cinquante hertz. Un morceau met presque une seconde à reprendre
  sa taille, sous les yeux du joueur ;
- une laisse tirée entre **150 et 750** par morceau, et reproductible ici parce
  qu'elle vient du nom du fragment ;
- une cadence d'**un par seconde**, et non de un par deux secondes — mais
  **conditionnelle** : tant qu'un morceau occupe la bouche, rien ne sort. La
  croûte de Brittle Hollow met donc à ressortir un temps qui dépend de
  l'encombrement, pas un temps fixe.

### La laisse

```
DebrisLeash.FixedUpdate()
    float d = (attached.GetPosition() - anchor.GetPosition()).magnitude;
    float k = Mathf.Clamp01((d - 0.8f * _leashLength)
                            / (_leashLength - 0.8f * _leashLength));
    Vector3 dv = k * k * -anchor.GetRelativeVelocity(attached) * Time.fixedDeltaTime;
    attached.AddVelocityChange(dv);
```

Rien ne freine dans les quatre cinquièmes de la laisse ; au-delà, un freinage
**quadratique** de la vitesse relative, plein au bout. Ce n'est pas une corde qui
casse, c'est un élastique qui se tend — et c'est ce qui donne au champ de débris
sa forme : dense près du trou blanc, effiloché au bord.

## Ce que cela dit de la méthode

Trois champs sérialisés, trois lectures plausibles, trois erreurs. Et la source
de l'erreur est la même à chaque fois : **le nom du champ a été pris pour sa
loi**. `_exitConeAngle` s'appelle un angle de cône, donc c'en était un ;
`_debrisRadius` s'appelle un rayon, donc c'en était un ; `_radius` bornait un
volume, donc on l'a élargi de 20 % pour ne pas sortir dedans.

> Un champ sérialisé ne dit pas ce qu'on en fait. Il faut lire la méthode qui
> le lit — et, quand aucune ne le lit, le dire aussi : c'est le cas de
> `_exitConeAngle` pour tout ce qui n'est pas un débris.
