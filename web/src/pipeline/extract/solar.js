// Systeme solaire consolide : par corps, position monde, rayons, gravite,
// rotation propre et orbite. C'est la source de verite du moteur.
// Portage de tools/07_solar_system.py.

import { round } from "./context.js";

// Classes portant l'information physique d'un corps.
const BODY_CLASSES = ["GravityWell", "PlanetoidSector", "SphereOceanFluidVolume",
                      "SimpleFluidVolume",
                      "FogVolume", "WhiteHoleVolume", "QuantumOrbit", "RotateTransform",
                      "OWRigidbody", "AlignWithTargetBody", "InitialMotion"];
const FLUID_CLASSES = ["SphereOceanFluidVolume", "SimpleFluidVolume"];
const CONSTANT_CLASSES = ["ThrusterModel", "PlayerCharacterController"];

export function extractSolarSystem(ctx) {
  const comps = new Map();          // gid -> { classe -> champs }
  const rbOwner = new Map();        // path_id d'un OWRigidbody -> nom du GameObject

  for (const { obj, cls } of ctx.behaviours(BODY_CLASSES)) {
    const gid = ctx.ownerId(obj);
    if (cls === "OWRigidbody") {
      const nm = ctx.name(gid);
      if (nm) rbOwner.set(obj.pathId, nm);
    }
    const fields = ctx.scriptFields(obj);
    if (!fields) continue;
    if (!comps.has(gid)) comps.set(gid, {});
    comps.get(gid)[cls] = fields;
  }

  // Le parent d'un GameObject, via son Transform.
  const parentOf = new Map();
  for (const [gid, t] of ctx.transformOf) {
    if (!t.m_Father) continue;
    const p = ctx.env.deref(t.m_Father, ctx.env.get(ctx.sceneFile));
    const pt = p && ctx.env.read(p);
    if (pt && pt.m_GameObject) parentOf.set(gid, pt.m_GameObject.pathId);
  }

  // Un GravityWell est un ENFANT du corps : le corps est le premier ancetre
  // portant un OWRigidbody, et c'est lui qui porte l'InitialMotion donc l'orbite.
  const owningBody = (gid) => {
    let cur = gid;
    for (let i = 0; cur && i < 32; i++) {
      if (comps.get(cur) && comps.get(cur).OWRigidbody) return cur;
      cur = parentOf.get(cur) || 0;
    }
    return gid;
  };

  const bodies = [];
  for (const [gid, cs] of comps) {
    if (!cs.GravityWell && !cs.PlanetoidSector) continue;
    const go = ctx.gameObjects.get(gid);
    if (!go || !ctx.transformOf.has(gid)) continue;
    const [pos, rot, scl] = ctx.world(gid);
    const gw = cs.GravityWell || null;
    const ps = cs.PlanetoidSector || {};
    const rt = cs.RotateTransform || null;
    const ownerGid = owningBody(gid);
    const owner = ctx.gameObjects.get(ownerGid);
    const im = (comps.get(ownerGid) || {}).InitialMotion || null;

    bodies.push({
      name: go.m_Name,
      position: pos.map((v) => round(v, 3)),
      rotation: rot.map((v) => round(v, 6)),
      scale: scl.map((v) => round(v, 4)),
      // Modele GravityWell. cutoffRadius est un rayon INTERNE (coeur sans
      // gravite), pas une portee maximale : le champ n'a pas de coupure
      // externe. falloffType : 0=lineaire, 1=inverse du carre, 2=constant.
      gravity: gw ? {
        surfaceAcceleration: gw._surfaceAcceleration,
        upperSurfaceRadius: gw._upperSurfaceRadius,
        lowerSurfaceRadius: gw._lowerSurfaceRadius,
        cutoffRadius: gw._cutoffRadius,
        alignmentRadius: gw._alignmentRadius,
        falloffType: gw._falloffType,
        forceScaleFactor: gw._forceScaleFactor,
        setMass: gw._setMass,
      } : null,
      horizonRadius: ps._horizonRadius ?? null,
      spin: rt ? { axis: ctx.plain(rt._localAxis), degreesPerSecond: rt._degreesPerSecond } : null,
      hasRigidbody: !!cs.OWRigidbody,
      bodyName: owner ? owner.m_Name : null,
      bodyPosition: ctx.transformOf.has(ownerGid)
        ? ctx.world(ownerGid)[0].map((v) => round(v, 3)) : null,
      // Orbite : InitialMotion donne une vitesse initiale, il n'y a pas de
      // rotation de pivot. Voir docs/04-gravite.md.
      orbit: im ? {
        primary: im._primaryBody ? (rbOwner.get(im._primaryBody.pathId) || null) : null,
        orbitAngle: im._orbitAngle,
        impulseScalar: im._orbitImpulseScalar,
        initLinearDirection: ctx.plain(im._initLinearDirection),
        initLinearSpeed: im._initLinearSpeed,
        spinAxis: ctx.plain(im._rotationAxis),
        spinSpeed: im._initAngularSpeed,
      } : null,
    });
  }

  // Volumes de fluide. Ils etaient lus — SphereOceanFluidVolume figure dans
  // BODY_CLASSES depuis toujours — puis jetes, parce que la boucle ci-dessus
  // n'ecrit un corps que s'il porte un GravityWell ou un PlanetoidSector.
  // Giant's Deep n'avait donc pas d'ocean. Ils sortent maintenant a part : ce
  // n'est pas un corps, c'est un milieu.
  const fluids = [];
  for (const [gid, cs] of comps) {
    for (const cls of FLUID_CLASSES) {
      const f = cs[cls];
      if (!f) continue;
      let radius = null;
      for (const [k, v] of Object.entries(f)) {
        if (typeof v === "number" && v > 0 && /radius/i.test(k)) { radius = v; break; }
      }
      const vol = radius === null ? ctx.volumeOf(gid) : null;
      if (radius === null && vol) radius = vol.radius;
      if (!radius) continue;
      const drag = Object.entries(f).find(([k, v]) =>
        typeof v === "number" && /drag/i.test(k));
      fluids.push({
        name: ctx.name(gid), kind: cls,
        position: ctx.world(gid)[0].map((v) => round(v, 3)),
        radius: round(radius, 3),
        drag: drag ? drag[1] : null,
      });
    }
  }

  const dist = (p) => Math.hypot(p[0] || 0, p[1] || 0, p[2] || 0);
  bodies.sort((a, b) => dist(a.position) - dist(b.position));

  const constants = {};
  for (const { obj, cls } of ctx.behaviours(CONSTANT_CLASSES)) {
    const f = ctx.scriptFields(obj);
    if (f) constants[cls] = ctx.plain(f);
  }

  return { unity: ctx.env.get(ctx.sceneFile).unityVersion,
           source: ctx.sceneFile, bodies, fluids, constants };
}
