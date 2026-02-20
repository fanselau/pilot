/**
 * picocolors wrapper that respects NO_COLOR environment variable.
 *
 * When NO_COLOR is set, all color functions become identity functions.
 * Named exports only — import { dim, bold, green } from './colors.js'
 */

import pc from 'picocolors';

type ColorFn = (str: string) => string;

const identity: ColorFn = (str: string) => str;

function makeColorFn(colorFn: ColorFn): ColorFn {
  return process.env.NO_COLOR !== undefined ? identity : colorFn;
}

const dim: ColorFn = makeColorFn(pc.dim);
const bold: ColorFn = makeColorFn(pc.bold);
const green: ColorFn = makeColorFn(pc.green);
const red: ColorFn = makeColorFn(pc.red);
const yellow: ColorFn = makeColorFn(pc.yellow);
const cyan: ColorFn = makeColorFn(pc.cyan);
const blue: ColorFn = makeColorFn(pc.blue);
const magenta: ColorFn = makeColorFn(pc.magenta);
const gray: ColorFn = makeColorFn(pc.gray);

export { dim, bold, green, red, yellow, cyan, blue, magenta, gray };
