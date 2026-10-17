/** Fel som visas för klienten: HTTP-status, kod och en svensk text. Andra fel visas aldrig. */
export class MotorFel extends Error {
  constructor(readonly status: number, readonly kod: string, text: string) { super(text); this.name = 'MotorFel'; }
}
