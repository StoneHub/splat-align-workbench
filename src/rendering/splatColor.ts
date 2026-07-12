import { parsePlyHeader, requireCompleteVertexData, requireFloat32VertexLayout } from '../domain/ply';

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
  if (header.format !== 'binary_little_endian') return buffer.slice(0);
  requireFloat32VertexLayout(header);
  requireCompleteVertexData(header, buffer);

  const find = (name: string) => header.vertexProperties.find(property => property.name === name);
  const colors = ['f_dc_0', 'f_dc_1', 'f_dc_2'].map(find);
  const opacityProperty = find('opacity');
  const clone = buffer.slice(0);
  if (colors.some(property => !property) || !opacityProperty) return clone;

  const view = new DataView(clone);
  const stride = header.vertexStride;
  const color = encodeColor(options.color);
  const opacity = encodeOpacity(Math.min(0.99, Math.max(0.01, options.alpha)));

  for (let vertex = 0; vertex < header.vertexCount; vertex += 1) {
    const row = header.headerByteLength + vertex * stride;
    colors.forEach((property, channel) => view.setFloat32(row + property!.byteOffset, color[channel], true));
    view.setFloat32(row + opacityProperty.byteOffset, opacity, true);
  }

  return clone;
}
