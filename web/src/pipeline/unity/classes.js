// Structures des classes moteur Unity 4.1, decrites en dur.
//
// Le build ne contient aucun type tree (typeCount = 0), donc rien ne decrit ces
// classes dans les fichiers eux-memes. Les dispositions ci-dessous sont celles
// du format serialise Unity 4.x. Chaque lecteur est verifie par tests/ : lire un
// objet doit consommer exactement ses `byteSize` octets, sur les 28 206 objets
// du build. Un decalage d'un seul champ fait echouer le test.

/** PPtr : reference vers un autre objet. En format < 14, path_id tient sur 32 bits. */
export function readPPtr(r, file) {
  const fileId = r.i32();
  const pathId = file && file.version >= 14 ? r.i64() : r.i32();
  return pathId === 0 ? null : { fileId, pathId };
}

export function readVector(r, readItem) {
  const n = r.i32();
  if (n < 0 || n > 100_000_000) throw new RangeError(`taille de vecteur invalide: ${n}`);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = readItem(r);
  return out;
}

export function readGameObject(r, file) {
  const components = readVector(r, (rr) => {
    const first = rr.i32();          // index de classe, inutilise ici
    return { first, component: readPPtr(rr, file) };
  });
  const layer = r.u32();
  const name = r.string();
  const tag = r.u16();
  const isActive = r.bool();
  r.align(4);
  return { m_Component: components, m_Layer: layer, m_Name: name,
           m_Tag: tag, m_IsActive: isActive };
}

export function readTransform(r, file) {
  const gameObject = readPPtr(r, file);
  const rot = r.quaternion();
  const pos = r.vector3();
  const scale = r.vector3();
  const children = readVector(r, (rr) => readPPtr(rr, file));
  const father = readPPtr(r, file);
  return { m_GameObject: gameObject, m_LocalRotation: rot, m_LocalPosition: pos,
           m_LocalScale: scale, m_Children: children, m_Father: father };
}

/** Entete commune a tous les MonoBehaviour ; les champs du script suivent. */
export function readMonoBehaviourHeader(r, file) {
  const gameObject = readPPtr(r, file);
  const enabled = r.u8v();
  r.align(4);
  const script = readPPtr(r, file);
  const name = r.string();
  return { m_GameObject: gameObject, m_Enabled: enabled, m_Script: script, m_Name: name };
}

export function readMonoScript(r) {
  const name = r.string();
  const executionOrder = r.i32();
  const propertiesHash = r.u32();
  const className = r.string();
  const nameSpace = r.string();
  const assemblyName = r.string();
  const isEditorScript = r.bool();
  r.align(4);
  return { m_Name: name, m_ExecutionOrder: executionOrder, m_PropertiesHash: propertiesHash,
           m_ClassName: className, m_Namespace: nameSpace, m_AssemblyName: assemblyName,
           m_IsEditorScript: isEditorScript };
}

export function readTextAsset(r) {
  const name = r.string();
  const n = r.i32();
  const script = r.bytes(n);
  r.align(4);
  const pathName = r.string();
  return { m_Name: name, m_Script: script, m_PathName: pathName };
}

/** Composants dont on n'a besoin que du GameObject porteur. */
export function readComponentHeader(r, file) {
  return { m_GameObject: readPPtr(r, file) };
}

/**
 * AudioClip Unity 4. Sa forme ne tient pas dans un type tree : les octets du son
 * sont tantot dans l'objet, tantot dans le fichier .resS voisin, ou m_AudioData
 * ne porte alors que la taille suivie du decalage.
 *
 * m_Stream ne permet pas de trancher — les 142 clips du build l'ont non nul,
 * alors que 132 portent leurs octets en ligne. On tranche donc sur ce qui reste
 * a lire : si la taille annoncee depasse l'objet, les octets sont dehors. Les
 * clips se suivent dans le .resS, le decalage de l'un valant la fin du precedent.
 */
export function readAudioClip(r, file) {
  const name = r.string();
  const format = r.i32();
  const type = r.i32();
  const is3D = r.bool();
  const useHardware = r.bool();
  r.align(4);
  const stream = r.i32();
  const size = r.i32();
  let offset = 0;
  let inline = null;
  if (size <= r.remaining) {
    inline = r.bytes(size);
    r.align(4);
  } else {
    offset = r.remaining >= 4 ? r.i32() : 0;
  }
  return { m_Name: name, m_Format: format, m_Type: type, m_3D: is3D,
           m_UseHardware: useHardware, m_Stream: stream,
           size, offset, data: inline };
}

export const READERS = {
  GameObject: readGameObject,
  Transform: readTransform,
  MonoScript: readMonoScript,
  TextAsset: readTextAsset,
  MonoBehaviour: readMonoBehaviourHeader,
  AudioClip: readAudioClip,
};
