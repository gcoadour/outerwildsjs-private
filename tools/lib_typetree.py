"""Generation de type trees a partir des assemblies managees.

Le build est *stripped* : les fichiers .assets ne contiennent aucun type tree.
Les valeurs de champs des MonoBehaviour sont donc illisibles telles quelles.
On regenere les type trees depuis Assembly-CSharp.dll via le backend AssetRipper,
exactement comme le fait AssetRipper lui-meme.
"""
import glob
import os
from TypeTreeGeneratorAPI import TypeTreeGenerator

# assemblies contenant du code de jeu, par ordre de priorite de recherche
GAME_ASSEMBLIES = ["Assembly-CSharp", "Assembly-CSharp-firstpass",
                   "Assembly-UnityScript", "Assembly-UnityScript-firstpass",
                   "DecalSystem.Runtime"]


class TreeCache:
    def __init__(self, managed_dir, unity_version):
        self.gen = TypeTreeGenerator(unity_version, generator="AssetRipper")
        for dll in sorted(glob.glob(os.path.join(managed_dir, "*.dll"))):
            with open(dll, "rb") as fh:
                self.gen.load_dll(fh.read())
        # index nom court -> (assembly, nom complet) issu des definitions connues
        self.known = {}
        for dll, full in self.gen.get_monobehaviour_definitions():
            asm = dll[:-4] if dll.endswith(".dll") else dll
            self.known.setdefault(full.split(".")[-1], (asm, full))
        self._cache = {}

    @staticmethod
    def _to_dicts(nodes):
        return [{"m_Level": n.m_Level, "m_Type": n.m_Type,
                 "m_Name": n.m_Name, "m_MetaFlag": n.m_MetaFlag} for n in nodes]

    def _lookup(self, cls):
        # 1) via les definitions listees (gere les classes dans un namespace)
        if cls in self.known:
            try:
                return self.gen.get_nodes(*self.known[cls])
            except Exception:
                pass
        # 2) fallback : essai direct dans chaque assembly de jeu.
        #    Beaucoup de classes derivant d'une base intermediaire ne sont pas
        #    listees par get_monobehaviour_definitions mais restent resolvables.
        for asm in GAME_ASSEMBLIES:
            try:
                return self.gen.get_nodes(asm, cls)
            except Exception:
                continue
        return None

    def get(self, cls):
        """Type tree (liste de dicts) pour une classe, ou None."""
        if cls not in self._cache:
            nodes = self._lookup(cls)
            self._cache[cls] = self._to_dicts(nodes) if nodes else None
        return self._cache[cls]

    @property
    def stats(self):
        found = sum(1 for v in self._cache.values() if v)
        return found, len(self._cache)
