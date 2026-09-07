// Boucle temporelle.
//
// Valeurs relevees dans le build :
//   - duree de boucle : 20 minutes (le jeu final passera a 22) ;
//   - l'onde de choc de la supernova parcourt 30 000 unites en 15 secondes,
//     soit 2 000 u/s ;
//   - la musique de fin se declenche a 90 secondes restantes.
//
// L'implementation est la mienne ; seules les constantes viennent du jeu.

export const LOOP_MINUTES = 20;
export const SHOCKWAVE_SPEED = 30000 / 15;   // u/s
export const END_MUSIC_AT = 90;              // secondes restantes

export class TimeLoop {
  constructor(minutes = LOOP_MINUTES) {
    this.duration = minutes * 60;
    this.timeScale = 1;          // accelere la boucle pour les verifications
    this.loopCount = 0;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.supernovaAt = null;     // instant du declenchement, en temps de boucle
    this.dead = false;
    this.deathCause = null;
  }

  restart() {
    this.loopCount += 1;
    this.reset();
  }

  get secondsRemaining() { return Math.max(0, this.duration - this.elapsed); }
  get fraction() { return Math.min(1, this.elapsed / this.duration); }
  get supernova() { return this.supernovaAt !== null; }
  get endMusic() { return this.secondsRemaining < END_MUSIC_AT; }

  /** Rayon atteint par l'onde de choc depuis le centre de l'etoile. */
  get shockwaveRadius() {
    if (!this.supernova) return 0;
    return (this.elapsed - this.supernovaAt) * SHOCKWAVE_SPEED;
  }

  /**
   * @param sunDistance distance du joueur au centre de l'etoile
   * @returns "supernova" au moment ou l'onde rattrape le joueur, sinon null
   */
  update(dt, sunDistance) {
    if (this.dead) return null;
    this.elapsed += dt * this.timeScale;

    if (!this.supernova && this.elapsed >= this.duration) {
      this.supernovaAt = this.elapsed;
    }
    if (this.supernova && sunDistance != null &&
        this.shockwaveRadius >= sunDistance) {
      this.dead = true;
      this.deathCause = "supernova";
      return "supernova";
    }
    return null;
  }

  kill(cause) {
    if (this.dead) return;
    this.dead = true;
    this.deathCause = cause;
  }

  /** mm:ss, ou l'etat de supernova. */
  get label() {
    if (this.supernova) {
      return `SUPERNOVA — onde a ${Math.round(this.shockwaveRadius)} u`;
    }
    const s = Math.floor(this.secondsRemaining);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
}
