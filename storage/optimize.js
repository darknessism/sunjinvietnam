/* Recompress uploaded images to WebP at a sane display size.
 *
 * The site is a photo portfolio, so images dominate both the volume bill and
 * page-load time. A 4000px 3 MB JPEG straight off a camera is served into a
 * layout that never shows it wider than ~1600px.
 *
 * sharp is loaded lazily and optionally: if it is missing or fails to load on
 * the host, uploads simply store the original bytes exactly as before rather
 * than failing. Nothing here is on the critical path for serving.
 */
let sharp = null, sharpTried = false;
function getSharp() {
    if (!sharpTried) {
        sharpTried = true;
        try { sharp = require('sharp'); }
        catch (e) { console.warn('sharp unavailable — images stored unoptimised:', e.message); }
    }
    return sharp;
}

const MAX_EDGE = parseInt(process.env.IMAGE_MAX_EDGE || '1600', 10);
const QUALITY  = parseInt(process.env.IMAGE_QUALITY  || '78', 10);

// GIFs are skipped: they are usually animated, and converting animation adds
// risk for no real benefit here. SVG is vector and already small.
const CONVERTIBLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

function isConvertible(mime) {
    return CONVERTIBLE.has(String(mime || '').toLowerCase());
}

/**
 * Returns { buffer, mime, width, height } when recompression is worthwhile,
 * or null to keep the original (unsupported type, sharp missing, decode
 * failure, or the result wasn't actually smaller).
 */
async function optimize(buffer, mime) {
    const s = getSharp();
    if (!s || !isConvertible(mime)) return null;

    try {
        const img  = s(buffer, { failOn: 'none' });
        const meta = await img.metadata();
        if (!meta.width || !meta.height) return null;
        if (meta.pages > 1) return null;            // animated WebP/AVIF — leave alone

        const tooBig = meta.width > MAX_EDGE || meta.height > MAX_EDGE;
        const out = await img
            .rotate()                                // honour EXIF orientation before stripping it
            .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: QUALITY })
            .toBuffer({ resolveWithObject: true });

        // Never trade bytes for nothing: if it didn't shrink and wasn't
        // oversized, the original is already the better file.
        if (!tooBig && out.data.length >= buffer.length) return null;

        return { buffer: out.data, mime: 'image/webp', width: out.info.width, height: out.info.height };
    } catch (e) {
        console.warn('image optimise failed, keeping original:', e.message);
        return null;
    }
}

module.exports = { optimize, isConvertible, MAX_EDGE, QUALITY, available: () => !!getSharp() };
