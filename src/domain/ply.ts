export interface PlyHeader {
  format: 'binary_little_endian' | 'binary_big_endian' | 'ascii';
  vertexCount: number;
  properties: string[];
  vertexProperties: PlyProperty[];
  vertexStride: number;
  elements: PlyElement[];
  comments: string[];
  headerByteLength: number;
  headerText: string;
}

export type PlyScalarType =
  | 'char' | 'uchar' | 'int8' | 'uint8'
  | 'short' | 'ushort' | 'int16' | 'uint16'
  | 'int' | 'uint' | 'int32' | 'uint32'
  | 'float' | 'float32' | 'double' | 'float64';

export interface PlyProperty {
  name: string;
  type: PlyScalarType;
  byteOffset: number;
  byteLength: number;
}

export interface PlyElement {
  name: string;
  count: number;
}

const scalarByteLengths: Record<PlyScalarType, number> = {
  char: 1, uchar: 1, int8: 1, uint8: 1,
  short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4,
  float: 4, float32: 4, double: 8, float64: 8
};

const findHeaderEnd = (bytes: Uint8Array): number => {
  const markers = [new TextEncoder().encode('end_header\n'), new TextEncoder().encode('end_header\r\n')];
  for (const marker of markers) {
    for (let i = 0; i <= bytes.length - marker.length; i += 1) {
      if (marker.every((value, offset) => bytes[i + offset] === value)) {
        return i + marker.length;
      }
    }
  }
  return -1;
};

export function parsePlyHeader(buffer: ArrayBuffer): PlyHeader {
  const bytes = new Uint8Array(buffer);
  const headerByteLength = findHeaderEnd(bytes);
  if (headerByteLength === -1) throw new Error('PLY header missing end_header');

  const headerText = new TextDecoder('ascii').decode(bytes.slice(0, headerByteLength));
  const lines = headerText.trimEnd().split(/\r?\n/);
  if (lines[0] !== 'ply') throw new Error('Not a PLY file');

  const formatLine = lines.find(line => line.startsWith('format '));
  const vertexLine = lines.find(line => line.startsWith('element vertex '));
  if (!formatLine || !vertexLine) throw new Error('PLY header missing format or vertex element');

  const format = formatLine.split(/\s+/)[1] as PlyHeader['format'];
  if (!['binary_little_endian', 'binary_big_endian', 'ascii'].includes(format)) {
    throw new Error(`Unsupported PLY format: ${format}`);
  }

  const vertexCount = Number(vertexLine.split(/\s+/)[2]);
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 0) throw new Error('Invalid vertex count');

  const vertexProperties: PlyProperty[] = [];
  const elements: PlyElement[] = [];
  let currentElement: string | null = null;
  let vertexStride = 0;
  for (const line of lines) {
    if (line.startsWith('element ')) {
      const [, name, countText] = line.split(/\s+/);
      const count = Number(countText);
      if (!name || !Number.isSafeInteger(count) || count < 0) throw new Error(`Invalid PLY element: ${line}`);
      currentElement = name;
      elements.push({ name, count });
      continue;
    }
    if (!line.startsWith('property ') || currentElement !== 'vertex') continue;
    const tokens = line.split(/\s+/);
    if (tokens[1] === 'list') {
      throw new Error('Vertex list properties are not supported');
    }
    const type = tokens[1] as PlyScalarType;
    const name = tokens[2];
    const byteLength = scalarByteLengths[type];
    if (!name || !byteLength) throw new Error(`Unsupported vertex property: ${line}`);
    vertexProperties.push({ name, type, byteOffset: vertexStride, byteLength });
    vertexStride += byteLength;
  }
  const properties = vertexProperties.map(property => property.name);
  if (vertexProperties.length === 0) throw new Error('PLY vertex element has no properties');
  const comments = lines
    .filter(line => line.startsWith('comment '))
    .map(line => line.slice('comment '.length));

  return { format, vertexCount, properties, vertexProperties, vertexStride, elements, comments, headerByteLength, headerText };
}

export function requireFloat32VertexLayout(header: PlyHeader): void {
  const unsupported = header.vertexProperties.find(property => property.type !== 'float' && property.type !== 'float32');
  if (unsupported) {
    throw new Error(`MVP splat processing requires float32 vertex properties; ${unsupported.name} is ${unsupported.type}`);
  }
}

export function requireCompleteVertexData(header: PlyHeader, buffer: ArrayBuffer): void {
  const bodyBytes = header.vertexCount * header.vertexStride;
  if (!Number.isSafeInteger(bodyBytes) || header.headerByteLength + bodyBytes > buffer.byteLength) {
    throw new Error('PLY vertex data is truncated');
  }
}
