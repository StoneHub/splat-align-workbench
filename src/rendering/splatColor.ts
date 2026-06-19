import { parsePlyHeader } from '../domain/ply';

type Rgb = [number, number, number];

interface DiagnosticSplatOptions {
  color: Rgb;
  alpha: number;
}

const SH_C0 = 0.28209479177387814;

const encodeColor = (color: Rgb): Rgb => color.map(value => (value - 0.5) / SH_C0) as Rgb;

const encodeOpacity = (alpha: number): number => Math.log(alpha / (1 - alpha));

export function createDiagnosticSplatBuffer(buffer: ArrayBuffer, options: DiagnosticSplatOptions): ArrayBuffer {
  const header = parsePlyHeader(buffer);
  const clone = buffer.slice(0);
  if (header.format !== 'binary_little_endian') return clone;

  const colorIndexes = ['f_dc_0', 'f_dc_1', 'f_dc_2'].map(property => header.properties.indexOf(property));
  const opacityIndex = header.properties.indexOf('opacity');
  if (colorIndexes.some(index => index === -1) || opacityIndex === -1) return clone;

  const view = new DataView(clone);
  const stride = header.properties.length * 4;
  const color = encodeColor(options.color);
  const opacity = encodeOpacity(Math.min(0.99, Math.max(0.01, options.alpha)));

  for (let vertex = 0; vertex < header.vertexCount; vertex += 1) {
    const row = header.headerByteLength + vertex * stride;
    colorIndexes.forEach((index, channel) => view.setFloat32(row + index * 4, color[channel], true));
    view.setFloat32(row + opacityIndex * 4, opacity, true);
  }

  return clone;
}
