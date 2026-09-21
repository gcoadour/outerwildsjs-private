# Le sac dorsal a deux verrous, et le portage n'en avait aucun

`PlayerJetpackController` porte quatorze méthodes. Le portage en nommait zéro :
il avait les trois **constantes** de poussée — 7 loin de tout, 12 en vertical
près d'une surface, 5 de côté ([`37`](37-corrections.md)) — et il les appliquait
sans condition. Le build, lui, ferme deux verrous avant d'en arriver là.

## 1. Sauter ne décolle pas

C'est le plus visible des deux, et c'est une loi de **contrôle**, pas de
physique.

```
OnBecomeGrounded()    { _isHorizontalThrustEnabled = false; _isGrounded = true; }
OnBecomeUngrounded()  { _isGrounded = false;
                        _translationAtJump = (thrustX, thrustUp - thrustDown, thrustZ); }
```

Poser le pied **coupe** la poussée horizontale. Quitter le sol retient la
commande **du moment du décollage**. Et en l'air, `ReadTranslationalInput` ne la
rouvre qu'à trois conditions, dont une seule suffit :

```
if (!_isGrounded) {
    if ((input.magnitude > 0.5f && Vector3.Angle(_translationAtJump, input) > 60f)
        || Mathf.Abs(input.y) > 0f
        || _isRotationalThrustEnabled)
        _isHorizontalThrustEnabled = true;
}
```

- on **change de cap** de plus de soixante degrés, commande pleine (au-dessus
  d'un demi) ;
- on appuie sur **monter** ou **descendre**, quoi qu'il arrive par ailleurs ;
- la poussée de **rotation** est déjà engagée.

Autrement dit : courir puis sauter ne vous propulse pas. Il faut un **geste de
plus** — lâcher la direction et en prendre une autre, ou pousser vers le haut.
C'est ce qui fait qu'on ne s'envole pas par accident en marchant, et c'est aussi
pourquoi un décollage se sent comme une décision.

Le portage poussait latéralement dans tous les cas : chez lui, courir et sauter
**était** un décollage.

### Où le verrou s'applique

Pas dans le lecteur de commande, qui rend son vecteur entier — mais un cran plus
loin, dans la classe de base :

```
ThrusterController.FixedUpdate()
    _translationalInput = ReadTranslationalInput();   // met a jour le drapeau
    if (!_isHorizontalThrustEnabled) {
        _translationalInput.x = 0f;
        _translationalInput.z = 0f;                   // y, jamais
    }
```

Deux conséquences qui comptent :

- **seuls x et z tombent.** La poussée verticale passe toujours, verrou ou non
  — ce qui est cohérent avec le fait qu'elle soit l'une des trois clés ;
- **l'ordre compte.** Le drapeau est mis à jour par la lecture, et testé juste
  après : l'image qui ouvre le verrou est **déjà** celle qui pousse. Le premier
  test écrit ici attendait le contraire, et c'est l'IL qui a tranché.

## 2. La panne sèche a une hystérésis

```
if (GetFuelFraction() <= 0f && !_isFuelDepleted) {
    _autopilot.Abort();
    _isFuelDepleted = true;
} else if (_isFuelDepleted && GetFuelFraction() > 0.05f) {
    _isFuelDepleted = false;
}
```

et, en tête de `ReadTranslationalInput` :

```
if (_isFuelDepleted) return Vector3.zero;
```

Trois choses que le portage n'avait pas :

- **rien ne pousse** quand le réservoir est vide — pas « moins », rien ;
- **cinq pour cent** pour repartir. Une goutte ne suffit pas : tomber en panne
  vous coûte le temps de refaire un vingtième du plein ;
- **le pilote automatique abandonne** à l'instant de la panne. Sans cela, on se
  laissait guider vers une cible sans avoir de quoi freiner en arrivant.

## Ce qui ne se porte pas, et pourquoi

Le même `ReadTranslationalInput` porte un troisième mécanisme :

```
if (_autopilot.IsMatchingVelocity()) {
    if (!_allowAutopilotOverride) { if (input.magnitude < 0.1f) _allowAutopilotOverride = true; }
    else if (input.magnitude > 0.7f) _autopilot.Abort();
}
```

C'est un garde-fou contre l'annulation par inadvertance : tant qu'on n'a pas
**relâché** (sous 0,1), pousser n'abandonne pas l'accord de vitesse ; une fois
relâché, une poussée franche (au-dessus de 0,7) l'abandonne.

Il ne se porte pas ici, et la raison n'est pas un renoncement : dans ce portage,
l'accord de vitesse est **instantané** — `matchedVelocity` pose la vitesse et
rend la main — là où le build y va par la poussée, sur plusieurs secondes.
`IsMatchingVelocity()` n'a donc pas d'état à garder. Le commentaire de `main.js`
le disait déjà ; il le dit maintenant avec sa conséquence.

## Ce que cela ajoute au compte

Deux lois, huit invariants, et un ordre de test corrigé par l'IL. Et une leçon
de méthode, qui vaut pour la suite : ces trois lignes du build vivent dans une
classe dont le recensement dit depuis toujours qu'elle est **lue**
(`@lit PlayerJetpackController`). Un compte de classes ne voit pas qu'une classe
lue peut l'être à moitié.

> C'est la quatrième fois que ce dépôt bute sur la même limite —
> [`66`](66-allumage.md) l'a dit du recensement, [`68`](68-lois.md) des
> événements, [`90`](90-methodes.md) des méthodes exportées. Le prochain
> dénominateur, quand il faudra l'ouvrir, sera celui-là : **ce que le build fait
> dans une classe qu'on lit, et qu'on n'en refait pas**.
