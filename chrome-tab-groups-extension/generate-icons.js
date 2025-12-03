const fs = require('fs');
const zlib = require('zlib');

// Create a simple PNG icon with a solid color and simple design
function createPNG(size) {
  const width = size;
  const height = size;

  // Create raw pixel data (RGBA format)
  const rawData = Buffer.alloc(height * (1 + width * 4));

  // Colors
  const blue = { r: 26, g: 115, b: 232, a: 255 };    // #1a73e8
  const white = { r: 255, g: 255, b: 255, a: 255 };
  const red = { r: 220, g: 53, b: 69, a: 255 };      // #dc3545

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawData[rowStart] = 0; // Filter byte (none)

    for (let x = 0; x < width; x++) {
      const pixelStart = rowStart + 1 + x * 4;

      // Calculate distance from center for circle
      const cx = width / 2;
      const cy = height / 2;
      const radius = width * 0.45;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      let color = { r: 0, g: 0, b: 0, a: 0 }; // Transparent

      if (dist <= radius) {
        // Main blue circle
        color = blue;

        // Tab bars (white rectangles)
        const barHeight = height * 0.12;
        const barWidth = width * 0.56;
        const barLeft = width * 0.22;
        const barRight = barLeft + barWidth;

        const bar1Top = height * 0.27;
        const bar2Top = height * 0.44;
        const bar3Top = height * 0.61;

        const inBar1 = x >= barLeft && x <= barRight && y >= bar1Top && y <= bar1Top + barHeight;
        const inBar2 = x >= barLeft && x <= barRight && y >= bar2Top && y <= bar2Top + barHeight;
        const inBar3 = x >= barLeft && x <= barRight && y >= bar3Top && y <= bar3Top + barHeight;

        if (inBar1 || inBar2 || inBar3) {
          color = white;
          // Add some transparency for lower bars
          if (inBar2) color = { ...white, a: 204 };
          if (inBar3) color = { ...white, a: 153 };
        }

        // Red X circle in bottom right
        const xCx = width * 0.75;
        const xCy = height * 0.75;
        const xRadius = width * 0.19;
        const xDist = Math.sqrt((x - xCx) ** 2 + (y - xCy) ** 2);

        if (xDist <= xRadius) {
          color = red;

          // Draw X mark
          const relX = x - xCx;
          const relY = y - xCy;
          const lineWidth = width * 0.03;
          const lineLength = xRadius * 0.6;

          // Check if on the X lines
          const onLine1 = Math.abs(relX - relY) < lineWidth && Math.abs(relX) < lineLength;
          const onLine2 = Math.abs(relX + relY) < lineWidth && Math.abs(relX) < lineLength;

          if (onLine1 || onLine2) {
            color = white;
          }
        }
      }

      rawData[pixelStart] = color.r;
      rawData[pixelStart + 1] = color.g;
      rawData[pixelStart + 2] = color.b;
      rawData[pixelStart + 3] = color.a;
    }
  }

  // Compress the raw data
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  // Build PNG file
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // Bit depth
  ihdr[9] = 6;  // Color type (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = makeCrcTable();

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xEDB88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
}

// Generate icons in different sizes
const sizes = [16, 32, 48, 128];

sizes.forEach(size => {
  const png = createPNG(size);
  const filename = `icons/icon${size}.png`;
  fs.writeFileSync(filename, png);
  console.log(`Created ${filename}`);
});

console.log('All icons generated successfully!');
