// Lecture binaire des formats Unity. Volontairement sans dependance : ce module
// tourne tel quel dans un Web Worker et sous Node pour les tests.

const DEC_UTF8 = new TextDecoder("utf-8");

export class BinaryReader {
  /**
   * @param {Uint8Array} u8   octets a lire
   * @param {number} pos      position de depart
   * @param {boolean} le      petit-boutiste (les fichiers Unity du build le sont)
   */
  constructor(u8, pos = 0, le = true) {
    this.u8 = u8;
    this.view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.pos = pos;
    this.le = le;
  }

  get length() { return this.u8.length; }
  get remaining() { return this.u8.length - this.pos; }
  seek(p) { this.pos = p; return this; }

  /** Verifie qu'il reste assez d'octets, sinon leve une erreur situee. */
  need(n) {
    if (this.pos + n > this.u8.length) {
      throw new RangeError(`lecture hors limites: ${n} octets a ${this.pos}/${this.u8.length}`);
    }
  }

  u8v() { this.need(1); return this.u8[this.pos++]; }
  i8() { this.need(1); return this.view.getInt8(this.pos++); }
  bool() { return this.u8v() !== 0; }
  u16() { this.need(2); const v = this.view.getUint16(this.pos, this.le); this.pos += 2; return v; }
  i16() { this.need(2); const v = this.view.getInt16(this.pos, this.le); this.pos += 2; return v; }
  u32() { this.need(4); const v = this.view.getUint32(this.pos, this.le); this.pos += 4; return v; }
  i32() { this.need(4); const v = this.view.getInt32(this.pos, this.le); this.pos += 4; return v; }
  f32() { this.need(4); const v = this.view.getFloat32(this.pos, this.le); this.pos += 4; return v; }
  f64() { this.need(8); const v = this.view.getFloat64(this.pos, this.le); this.pos += 8; return v; }

  /** Entiers 64 bits ramenes en Number : les path_id du build tiennent largement. */
  i64() {
    this.need(8);
    const v = this.view.getBigInt64(this.pos, this.le);
    this.pos += 8;
    return Number(v);
  }
  u64() {
    this.need(8);
    const v = this.view.getBigUint64(this.pos, this.le);
    this.pos += 8;
    return Number(v);
  }

  bytes(n) { this.need(n); const b = this.u8.subarray(this.pos, this.pos + n); this.pos += n; return b; }

  /**
   * Aligne la position sur un multiple de n (4 par defaut).
   *
   * L'alignement est borne a la fin du tampon : Unity aligne *entre* les champs
   * mais le `byteSize` d'un objet n'inclut pas le remplissage final. Sans cette
   * borne, lire un GameObject consomme 1 octet de plus que l'objet n'en compte,
   * et un MonoScript 3 de plus.
   */
  align(n = 4) {
    const r = this.pos % n;
    if (r) this.pos = Math.min(this.pos + n - r, this.u8.length);
    return this;
  }

  /** Chaine terminee par un octet nul (entetes de fichier). */
  cstring(max = 4096) {
    const start = this.pos;
    let end = start;
    while (end < this.u8.length && this.u8[end] !== 0 && end - start < max) end++;
    const s = DEC_UTF8.decode(this.u8.subarray(start, end));
    this.pos = end < this.u8.length ? end + 1 : end;
    return s;
  }

  /** Chaine Unity : longueur sur 4 octets, puis les octets, puis alignement. */
  string() {
    const n = this.i32();
    if (n < 0 || this.pos + n > this.u8.length) {
      throw new RangeError(`longueur de chaine invalide (${n}) a ${this.pos - 4}`);
    }
    const s = DEC_UTF8.decode(this.u8.subarray(this.pos, this.pos + n));
    this.pos += n;
    this.align(4);
    return s;
  }

  /** Tableau de flottants, lu d'un bloc quand l'alignement le permet. */
  f32Array(n) {
    this.need(n * 4);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.view.getFloat32(this.pos + i * 4, this.le);
    this.pos += n * 4;
    return out;
  }

  vector2() { return { x: this.f32(), y: this.f32() }; }
  vector3() { return { x: this.f32(), y: this.f32(), z: this.f32() }; }
  vector4() { return { x: this.f32(), y: this.f32(), z: this.f32(), w: this.f32() }; }
  quaternion() { return { x: this.f32(), y: this.f32(), z: this.f32(), w: this.f32() }; }
  color() { return { r: this.f32(), g: this.f32(), b: this.f32(), a: this.f32() }; }
}
