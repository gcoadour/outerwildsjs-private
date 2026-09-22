# La trappe n'a pas de charnière, le saut était muet, et l'alarme battait tout le temps

Trois classes du bas de la liste de `refait.mjs`, et chacune cachait quelque
chose qu'on entend ou qu'on voit.

## 1. `HatchController` : on ouvre, on entre, elle claque

```
OnPressInteract()   OpenHatch();
OpenHatch()         _hatchObject.SetActive(false);
                    audio.PlayOneShot(_openHatchClip);
CloseHatch()        _hatchObject.SetActive(true);
                    _interactVolume.ResetInteraction();
                    audio.PlayOneShot(_closeHatchClip);
OnEntry(c)          if (c.tag == "PlayerDetector") {
                        CloseHatch(); _isPlayerInShip = true;
                        FireEvent("EnterShip"); }
OnExit(c)           if (c.tag == "PlayerDetector") {
                        _isPlayerInShip = false;
                        FireEvent("ExitShip"); }
```

**`_hatchObject` est `Hatch_Collider`.** Ouvrir la trappe ne joue aucune
animation : ça **désactive un collider**. La trappe est une barrière physique,
et l'ouvrir la retire — voilà pourquoi il n'y a ni charnière, ni durée, ni
interpolation à chercher.

**Elle se referme toute seule, et pas où l'on croit.** `CloseHatch` est appelé
par `OnEntry` — *quand le joueur est entré*. On ouvre, on entre, elle claque
derrière soi. `OnExit` ne fait qu'annoncer : **sortir laisse la trappe grande
ouverte** jusqu'à ce qu'on rentre.

Et `CloseHatch` est appelé **sans condition** : franchir le seuil sans avoir
ouvert rejoue quand même le clip de fermeture. On s'en serait spontanément
gardé ; le build ne s'en garde pas, et c'est audible.

**C'est elle qui annonce `EnterShip` / `ExitShip`**, pas le poste de pilotage.
On est « dans le vaisseau » dès qu'on a passé la trappe, assis ou debout.

### Ce que l'extraction ne sortait pas

`HatchController` ne correspondait à aucun motif de `WANT_VOLUME` : son rayon
de déclenchement, qui est celui du collider de `HatchControls`, restait dans la
scène. Sans lui, il n'y a pas de « quand » — c'est le même trou que
`PlanetoidSector` ([`82`](82-secteur-majeur.md)), et il se bouche de la même
façon.

## 2. `PlayerMovementAudio.OnJump` : le saut était muet

```
OnJump()   audio.pitch = 1f;
           int i = Random.Range(0, 3);
           audio.PlayOneShot(_jumpN);        // sans volume
```

Deux règles s'y **renversent** par rapport au pas :

| | pas | saut |
|---|---|---|
| hauteur | `Random.Range(1 - 0,4 ; 1 + 0,4)` | **1**, remise à plat |
| volume | `_footstepVolume` = 0,5 | **plein** |
| clips | 6 marche, 6 course | **3** |

Un pas se désaccorde et sort à demi-volume ; un saut ne se désaccorde pas et
sort entier. Le portage n'avait aucun son de saut : `tryJump` rendait déjà vrai
quand le saut partait, et personne ne le recueillait.

`Awake` s'abonne à `CharacterMovementModel.OnJump` : c'est le **saut**, pas le
décollage du sac dorsal.

## 3. `MasterAlarm` : une sirène, et une lumière qui bat

```
TurnOnAlarm()    _isAlarmOn = true;
                 audio.enabled = true; audio.Play();
                 GetComponent<PulsingLight>().Enable();
TurnOffAlarm()   _isAlarmOn = false;
                 audio.Stop(); audio.enabled = false;
                 GetComponent<PulsingLight>().Disable();
```

Le seuil — trente pour cent de coque — était porté ([`52`](52-casque.md)). Le
reste ne l'était pas.

**La source est éteinte, pas seulement arrêtée.** `audio.enabled = false` après
le `Stop`, rallumée avant le `Play` : c'est une **boucle**, et on la débranche.
Une sirène qui tient tant que la coque est basse n'est pas un bip.

**Et l'alarme allume une lumière.** Le `PulsingLight` de l'objet « MasterAlarm »
porte `_pulseRate = 8` — le plus rapide des quinze du build, quatre fois la
balise la plus nerveuse. La cabine bat au rouge.

> `PulsingLight.Enable` / `Disable` coupent **deux** choses : le composant *et*
> `light.enabled`. Une lumière pulsante n'est donc pas forcément allumée. Le
> portage les animait toutes les quinze sans condition, et celle de l'alarme
> battait donc en permanence — un vaisseau neuf clignotait comme un vaisseau
> mourant.

## Gardé par

- `tests/09-jeu.mjs` — la trappe : elle naît fermée, l'appui l'ouvre et retire
  le collider, un second appui ne fait rien, **entrer la referme et annonce
  `EnterShip`**, sortir n'annonce que `ExitShip` et ne la rouvre pas, rester du
  même côté ne franchit rien, et entrer sans avoir ouvert rejoue quand même la
  fermeture. Le saut : hauteur 1, plein volume, sa propre famille de clips.
