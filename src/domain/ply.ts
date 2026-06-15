export interface PlyHeader {
  format: 'binary_little_endian' | 'binary_big_endian' | 'ascii';
  vertexCount: number;
  properties: string[];
  comments: string[];
  headerByteLength: number;
  headerText: string;
}

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
  if (!Number.isFinite(vertexCount)) throw new Error('Invalid vertex count');

  const properties = lines
    .filter(line => line.startsWith('property '))
    .map(line => line.split(/\s+/).at(-1) as string);
  const comments = lines
    .filter(line => line.startsWith('comment '))
    .map(line => line.slice('comment '.length));

  return { format, vertexCount, properties, comments, headerByteLength, headerText };
}
