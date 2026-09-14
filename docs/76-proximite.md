# Le tableau de bord ne parle que de près, et le tutoriel ne se rejoue pas

Le dénominateur des lois est fermé ([`75`](75-chaleur.md)) : **zéro** loi sans
appelant. Retour à celui des **annonces**, honnête depuis [`69`](69-assise.md) :
124 événements, 21 nommés.

Cette page en lit deux de plus, et les deux disent la même chose sous deux
formes : **le jeu retire ce qui n'a plus lieu d'être affiché.**

## Les voyants d'avarie ne parlent que de près

```
OnEnterShipProximity → HUDDamageDisplay.enabled = true
OnExitShipProximity  → enabled = false, puis TurnOffIcons()
```

`ShipProximityVolume` est une sphère de **treize unités** posée sur le vaisseau.
Le tableau de bord des avaries n'est donc pas un affichage permanent : il ne
parle que quand on est assez près du vaisseau pour **y faire quelque chose**.

C'est une extinction, pas une mise en pause : `TurnOffIcons` éteint tout, le
voyant général compris. Mais le clignotement, lui, continue de battre — revenir
ne le rattrape pas à contretemps.

> Le portage montrait les voyants en permanence. Un tableau de bord qui clignote
> pendant qu'on marche à trois cents unités de son vaisseau ne dit rien : il
> décore.

## Le tutoriel de la sonde est à usage unique

[`75`](75-chaleur.md) a branché les quatre `ProbePromptTrigger` : l'invite vient
parce qu'on **regarde** quelque part. Il manquait ce qui se passe après.

```
OnLaunchProbe:  RemoveScreenPrompt(_launchPrompt)
                FireEvent("DestroyAllProbePromptTriggers")

OnDestroyAllProbePromptTriggers:  Destroy(gameObject)
```

Lancer une sonde depuis une invite **les détruit toutes les quatre** — pas
seulement celle où l'on se trouve. Les quatre invites sont un tutoriel à usage
unique : une fois qu'on a compris, le jeu ne le redit **jamais**.

Le portage, lui, les aurait remontrées à chaque passage.

> Deux lignes d'IL, et c'est toute la différence entre un jeu qui vous fait
> confiance et un jeu qui vous répète la même chose.

## L'écoute est locale, et c'est ce qui la rend lisible

`ProbePromptTrigger` n'écoute `LaunchProbe` **que pendant qu'on est dedans** :
`OnTriggerEnter` ajoute l'écouteur, `OnTriggerExit` le retire. Lancer une sonde
ailleurs ne détruit donc rien.

C'est une précaution qu'on ne devinerait pas — et sans elle, le premier tir
d'essai fait au village effacerait un tutoriel qu'on n'a pas encore vu.

## Le garde-fou de la veille n'avait jamais parlé

[`71`](71-quantique.md) a posé un avertissement : l'extraction du profil
est-elle plus vieille que le pipeline qui l'a faite ? Deux contrôles neufs sont
tombés ici en annonçant zéro là où le build pose un — et l'avertissement ne
s'est pas affiché.

**Deux fautes, et la seconde explique la première.**

D'abord, `--zip` ne servait qu'à remplir un profil **vide** : l'archive n'était
déposée que si la page ne montrait pas déjà une extraction. Relancer avec
l'archive après avoir touché à un extracteur ne refaisait donc rien. `--zip`
veut dire « refais l'extraction » ; il le fait maintenant.

Ensuite — et c'est la vraie leçon — le garde-fou comparait la date du pipeline à
celle du **stockage du profil**, `WebStorage` compris. Or Chromium y touche
`QuotaManager-journal` **à chaque ouverture**. La date était donc toujours
fraîche, et cet avertissement n'a **jamais rien dit** : ni ici, ni le jour où il
a été écrit.

> Un garde-fou qu'on n'a jamais vu parler n'est pas un garde-fou silencieux :
> c'est un garde-fou cassé. Et il avait l'air d'un actif — comme la loi éprouvée
> de [`68`](68-lois.md), comme l'import de [`71`](71-quantique.md), comme le
> motif de [`75`](75-chaleur.md).

Il ne regarde plus que `Default/File System`, l'OPFS et lui seul.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 608** vérifications (+8) |
| sur le build | **388** vérifications (+3) |
| en navigateur, avec le build | **237** contrôles (+4) |
| en navigateur, sans le build | 13 contrôles |
| annonces nommées | 18 → **21** |

## La leçon

> Un affichage qui ne s'éteint jamais n'affiche rien.

Les deux mécaniques de cette page sont des **retraits** : une icône qu'on
éteint en s'éloignant, une invite qu'on détruit après usage. Ce sont les plus
faciles à ne pas porter — rien ne manque à l'écran quand on les oublie, il y a
seulement *trop*.
