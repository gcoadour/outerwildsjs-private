# Deux tables pour une manette, et rien qui les oblige à s'accorder

Le portage décrit la manette à **deux** endroits :

| fichier | ce qu'il porte | en numéros de |
|---|---|---|
| `input.js` | la liaison `pad` de chaque canal — `{ button: 8 }`, `{ axis: 9 }` | **Unity** |
| `gamepad.js` | `PAD_BUTTONS` : bouton → code clavier, plus le nom du build | **navigateur** |

Les deux viennent du même `InputManager` ([`docs/61`](61-commandes.md)), écrites
à la main, et rien ne les obligeait à rester d'accord. Ce n'est pas une crainte
théorique : **quatre lignes sur six étaient fausses** la première fois que cette
table a été écrite — B interagissait là où le build annule, X allumait la lampe
là où le build interagit, Y ouvrait la lunette là où le build prend la vue
arrière, LB ouvrait l'ordinateur de bord là où le build vise un référentiel.

Et `PAD_BUTTONS` portait déjà, pour chaque entrée, le nom du canal :

```js
4: { code: "Mouse0", build: "LeftBumper", canal: "Lock On" },
```

Ce champ `canal` **n'était lu par personne**. C'était un commentaire déguisé en
donnée — la forme la plus discrète de dette qu'on puisse écrire, parce qu'elle a
l'air d'un mécanisme.

## Ce que la confrontation demande

`Commandes.padButton` et `Commandes.padAxis` étaient elles aussi écrites,
éprouvées, et appelées par personne ([`docs/93`](93-commandes.md)). Elles sont
exactement ce qu'il faut pour poser la question :

```
pour chaque entree de PAD_BUTTONS qui nomme un canal :
    numero Unity = cmds.padButton(canal)
    numero navigateur attendu = UNITY_VERS_NAVIGATEUR.boutons[numero Unity]
    il doit valoir le numero de l'entree
```

Deux cas particuliers, et tous deux sont des mesures :

**La lampe n'est pas un bouton.** Pour Unity, `Flashlight` est l'**axe 6** — la
croix directionnelle — que le navigateur éclate en quatre boutons. Un canal lié
à un axe `dpad` couvre donc légitimement deux numéros de bouton, et c'est la
seule ligne de la table dans ce cas.

**Les gâchettes non plus.** `Move Up` et `Move Down` sont les axes 9 et 8 pour
Unity, les boutons à valeur 7 et 6 pour le navigateur. C'est précisément la
ligne que le portage avait faussée en montant au bouton A — celui du saut.

## Le résultat

Les deux tables s'accordent, et elles le disent : un désaccord s'écrit dans la
console au démarrage, et `window.__padAccord` le porte pour les contrôles. Un
canal déplacé dans `input.js` se voit à la seconde suivante au lieu de se sentir
à la manette, trois lots plus tard.

Vingt méthodes sans appelant après ce lot, contre vingt-deux avant.

## Gardé par

- `tests/09-jeu.mjs` — les deux tables s'accordent, **déplacer un canal fait un
  désaccord qui nomme le canal et le bouton attendu**, et la lampe passe bien
  par la croix directionnelle.
- `tools/15_verify.py --profil` — dans la page, `window.__padAccord` est vide.
