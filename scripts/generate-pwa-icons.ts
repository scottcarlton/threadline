import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const SVG_PATH = resolve('static/favicon.svg');
const OUT_DIR = resolve('static/icons');
const BACKGROUND = '#fafafa';

const targets = [
	{ name: 'icon-192.png', size: 192, padding: 0 },
	{ name: 'icon-512.png', size: 512, padding: 0 },
	{ name: 'icon-512-maskable.png', size: 512, padding: 0.1 },
	{ name: 'apple-touch-icon.png', size: 180, padding: 0 }
];

async function main() {
	await mkdir(OUT_DIR, { recursive: true });
	for (const { name, size, padding } of targets) {
		const innerSize = Math.round(size * (1 - padding * 2));
		const buffer = await sharp(SVG_PATH).resize(innerSize, innerSize).png().toBuffer();
		const offset = Math.round((size - innerSize) / 2);
		await sharp({
			create: {
				width: size,
				height: size,
				channels: 4,
				background: BACKGROUND
			}
		})
			.composite([{ input: buffer, top: offset, left: offset }])
			.png()
			.toFile(resolve(OUT_DIR, name));
		console.log(`wrote ${name}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
