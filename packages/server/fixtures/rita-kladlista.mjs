// Ritar påhittade klädlistor som PNG, för testerna av fotoläsningen och för ett handtest mot Anthropic.
// Allt är påhittat: bilnummer, datum och platshållare i stället för namn. Kör: node packages/server/fixtures/rita-kladlista.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HAR = dirname(fileURLToPath(import.meta.url));

// Bitmappstypsnitt 5x7, en rad per hexvärde (övre raden först).
const TECKEN = {
  0: '0E 11 13 15 19 11 0E', 1: '04 0C 04 04 04 04 0E', 2: '0E 11 01 02 04 08 1F', 3: '1F 02 04 02 01 11 0E', 4: '02 06 0A 12 1F 02 02',
  5: '1F 10 1E 01 01 11 0E', 6: '06 08 10 1E 11 11 0E', 7: '1F 01 02 04 08 08 08', 8: '0E 11 11 0E 11 11 0E', 9: '0E 11 11 0F 01 02 0C',
  '-': '00 00 00 1F 00 00 00', '/': '01 01 02 04 08 10 10', ' ': '00 00 00 00 00 00 00',
  A: '0E 11 11 1F 11 11 11', B: '1E 11 11 1E 11 11 1E', C: '0E 11 10 10 10 11 0E', D: '1E 11 11 11 11 11 1E', E: '1F 10 10 1E 10 10 1F',
  F: '1F 10 10 1E 10 10 10', G: '0E 11 10 17 11 11 0F', H: '11 11 11 1F 11 11 11', I: '0E 04 04 04 04 04 0E', J: '07 02 02 02 02 12 0C',
  K: '11 12 14 18 14 12 11', L: '10 10 10 10 10 10 1F', M: '11 1B 15 15 11 11 11', N: '11 11 19 15 13 11 11', O: '0E 11 11 11 11 11 0E',
  P: '1E 11 11 1E 10 10 10', R: '1E 11 11 1E 14 12 11', S: '0F 10 10 0E 01 01 1E', T: '1F 04 04 04 04 04 04', U: '11 11 11 11 11 11 0E',
  V: '11 11 11 11 11 0A 04', X: '11 11 0A 04 0A 11 11', Y: '11 11 0A 04 04 04 04',
  Ä: '0A 00 0E 11 1F 11 11', Ö: '0A 00 0E 11 11 11 0E', Å: '04 0A 0E 11 1F 11 11', É: '02 04 1F 10 1E 10 1F',
};

function bild(bredd, hojd) {
  const px = new Uint8Array(bredd * hojd).fill(255);
  return {
    bredd, hojd, px,
    rekt(x, y, b, h, f = 0) { for (let j = y; j < y + h; j++) for (let i = x; i < x + b; i++) if (i >= 0 && j >= 0 && i < bredd && j < hojd) px[j * bredd + i] = f; },
    text(s, x, y, skala = 3) {
      for (const [n, c] of [...String(s).toUpperCase()].entries()) {
        const rader = (TECKEN[c] ?? TECKEN[' ']).split(' ').map(h => parseInt(h, 16));
        rader.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r & (16 >> i)) this.rekt(x + n * 6 * skala + i * skala, y + j * skala, skala, skala); });
      }
    },
  };
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function del(typ, data) {
  const ut = Buffer.alloc(12 + data.length);
  ut.writeUInt32BE(data.length, 0); ut.write(typ, 4, 'ascii'); data.copy(ut, 8);
  ut.writeUInt32BE(crc32(ut.subarray(4, 8 + data.length)), 8 + data.length);
  return ut;
}
function png(b) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(b.bredd, 0); ihdr.writeUInt32BE(b.hojd, 4); ihdr[8] = 8; ihdr[9] = 0; // 8 bitar gråskala
  const rader = Buffer.alloc((b.bredd + 1) * b.hojd);
  for (let y = 0; y < b.hojd; y++) Buffer.from(b.px.subarray(y * b.bredd, (y + 1) * b.bredd)).copy(rader, y * (b.bredd + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), del('IHDR', ihdr), del('IDAT', deflateSync(rader)), del('IEND', Buffer.alloc(0))]);
}

/** En blankett: rubrik, kolumner och rader. */
function blankett(fil, rubrik, kolumner, rader) {
  const radH = 56, x0 = 30, y0 = 110;
  const bredd = x0 * 2 + kolumner.reduce((s, k) => s + k.b, 0), hojd = y0 + radH * (rader.length + 3) + 40;
  const b = bild(bredd, hojd);
  b.text(rubrik, x0, 30, 4);
  let x = x0;
  for (const k of kolumner) {
    b.text(k.namn, x + 10, y0 + 18, 3);
    rader.forEach((r, i) => b.text(r[k.nyckel] ?? '', x + 10, y0 + radH * (i + 1) + 18, 3));
    x += k.b;
  }
  const antal = rader.length + 3;
  for (let i = 0; i <= antal; i++) b.rekt(x0, y0 + i * radH, bredd - 2 * x0, 2);
  x = x0;
  for (const k of [...kolumner, null]) { b.rekt(x, y0, 2, antal * radH + 2); if (k) x += k.b; }
  writeFileSync(join(HAR, fil), png(b));
}

const PLAGG = [['jacka', 'JACKA', 130], ['sommarjacka', 'SOMMAR', 130], ['vast', 'VÄST', 100], ['troja', 'TRÖJA', 120], ['skjorta', 'SKJORTA', 150], ['pike', 'PIKÉ', 100], ['mossa', 'MÖSSA', 120]];
const plagg = PLAGG.map(([nyckel, namn, b]) => ({ nyckel, namn, b }));

blankett('kladlista-ny.png', 'KLÄDLISTA 2026-10', [
  { nyckel: 'datum', namn: 'DATUM', b: 220 }, { nyckel: 'bil', namn: 'BIL', b: 100 }, { nyckel: 'utb', namn: 'UTB', b: 90 }, ...plagg, { nyckel: 'utl', namn: 'UTL', b: 90 },
], [
  { datum: '2026-10-02', bil: '101', utb: 'JA', jacka: '1', troja: '1', skjorta: '1', utl: 'XY' },
  { datum: '2026-10-05', bil: '102', mossa: '2', utl: 'XY' },
  { datum: '2026-10-09', bil: '999', pike: '1', utl: 'XY' },
  { datum: '2026-09-30', bil: '101', vast: '1', utl: 'XY' },
]);

blankett('kladlista-gammal.png', 'KLÄDLISTA 2026-10', [
  { nyckel: 'datum', namn: 'DATUM', b: 220 }, { nyckel: 'forare', namn: 'FÖRARE', b: 230 }, { nyckel: 'akare', namn: 'ÅKARE', b: 230 },
  { nyckel: 'bil', namn: 'BIL', b: 100 }, { nyckel: 'utb', namn: 'UTB', b: 90 }, ...plagg, { nyckel: 'utl', namn: 'UTL', b: 90 },
], [
  { datum: '2026-10-03', forare: 'TESTFÖRARE A', akare: 'TESTÅKERI A', bil: '103', utb: 'JA', jacka: '1', troja: '1', skjorta: '2', utl: 'XY' },
  { datum: '2026-10-07', forare: 'TESTFÖRARE B', akare: 'TESTÅKERI B', bil: '104', sommarjacka: '1', utl: 'XY' },
]);
console.log('Klädlistorna är ritade.');
