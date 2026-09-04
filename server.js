require('dotenv').config();

// Railway containers have no outbound IPv6 route. Without this, DNS may resolve
// smtp.gmail.com to an IPv6 address and SMTP fails with ENETUNREACH/ETIMEDOUT.
require('dns').setDefaultResultOrder('ipv4first');

const express   = require('express');
const path      = require('path');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Railway terminates TLS at its edge and forwards X-Forwarded-For. Without
// this, every request appears to come from the proxy, so per-IP rate limiting
// would bucket the whole internet together.
app.set('trust proxy', 1);

// Security headers. CSP is deliberately OFF: the pages load Tailwind's CDN
// (which needs unsafe-eval), Google Fonts, Pexels images and several social
// embeds, so a policy needs to be written and tested against every page
// before it can be turned on without breaking the site.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    // Images and video are served to the same origin, but keep this permissive
    // so embeds and previews elsewhere continue to work.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(express.json({ limit: '5mb' }));

// The static root is the project root, which also contains the server's own
// source. Block the server-side paths before serve-static can hand them out:
// without this, /db/schema.sql, /package.json and /routes/*.js are all public.
// (.env is already withheld by serve-static's default dotfile handling.)
const PRIVATE_DIRS  = ['db', 'routes', 'middleware', 'storage', 'node_modules', 'backups'];
const PRIVATE_FILES = ['server.js', 'package.json', 'package-lock.json'];
const PRIVATE_EXTS  = ['.sql', '.md', '.csv'];

app.use((req, res, next) => {
    // decodeURIComponent so an encoded separator can't slip past the checks;
    // a malformed escape sequence is itself reason enough to refuse.
    let p;
    try { p = decodeURIComponent(req.path).toLowerCase(); }
    catch { return res.status(400).end(); }

    // A backslash can act as a separator on some stacks; refuse rather than reason about it.
    if (p.indexOf(String.fromCharCode(92)) !== -1) return res.status(404).end();

    const seg = p.split('/').filter(Boolean);
    // Dotfiles (.env, .git/...): serve-static already withholds these, but the
    // SPA catch-all below would answer 200 with index.html. 404 is the honest answer.
    if (seg.some(x => x.startsWith('.')))              return res.status(404).end();
    if (seg.length && PRIVATE_DIRS.includes(seg[0]))   return res.status(404).end();
    if (seg.length === 1 && PRIVATE_FILES.includes(seg[0])) return res.status(404).end();
    if (PRIVATE_EXTS.some(e => p.endsWith(e)))         return res.status(404).end();
    next();
});

// Serve all static HTML/CSS/JS/images from the project root.
// HTML must revalidate so content edits appear immediately; the fingerprint-free
// assets under /images change rarely, so they get a day of caching with
// revalidation rather than being re-fetched on every page view.
app.use(express.static(path.join(__dirname), {
    setHeaders(res, filePath) {
        // Normalise separators first so this behaves the same on Windows dev
        // machines as it does in the Linux container.
        const rel = filePath.split(path.sep).join('/').toLowerCase();
        if (rel.endsWith('.html') || rel.endsWith('.htm')) res.setHeader('Cache-Control', 'no-cache');
        else if (rel.includes('/images/')) res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        else res.setHeader('Cache-Control', 'public, max-age=3600');
    },
}));

// Ensure the careers filter-options table exists and is seeded
require('./db/initCareerTax')().catch(e => console.error('career taxonomy init failed:', e.message));

// Ensure the careers table has the bilingual (English) content columns
require('./db/initCareerI18n')().catch(e => console.error('career i18n init failed:', e.message));

// Ensure the project_details table has the bilingual (English) content columns
require('./db/initProjectI18n')().catch(e => console.error('project i18n init failed:', e.message));

// Ensure the blog_content table has the bilingual (English) content columns
require('./db/initBlogI18n')().catch(e => console.error('blog i18n init failed:', e.message));

// Ensure the managed page-images table exists
const pageImages = require('./routes/pageImages');
pageImages.initPageImages().catch(e => console.error('page images init failed:', e.message));

// Ensure the managed banner-clips table exists
const banners = require('./routes/banners');
banners.initBanners().catch(e => console.error('banner clips init failed:', e.message));

// Ensure the editable text-content table exists
const textContent = require('./routes/textContent');
textContent.initTextContent().catch(e => console.error('text content init failed:', e.message));

// Ensure the generic uploaded-media table exists
const media = require('./routes/media');
media.initMedia().catch(e => console.error('media init failed:', e.message));

// Ensure the staff (About-page people) table exists
const staff = require('./routes/staff');
staff.initStaff().catch(e => console.error('staff init failed:', e.message));

// Ensure the blog "featured" flag column exists
require('./routes/blog').initBlog().catch(e => console.error('blog init failed:', e.message));

// One-shot blob -> volume migration. Set MIGRATE_BLOBS=1 on the Railway service
// to run it at boot (the Volume is only mounted inside the container, so the
// copy has to happen there), then remove the variable once it reports done.
// MIGRATE_BLOBS=1 copies bytes to the volume and leaves the blobs in place as a
// safety net; MIGRATE_BLOBS=purge copies and then clears the copied blobs.
if (process.env.MIGRATE_BLOBS) {
    const purge = process.env.MIGRATE_BLOBS === 'purge';
    require('./db/migrateBlobsToDisk').copyAll({ purge })
        .then(() => console.log('✅ blob -> volume migration pass complete'))
        .catch(e => console.error('blob migration failed:', e.message));
}

// One-shot image recompression pass (WebP at display size). Set
// OPTIMIZE_IMAGES=1 on the Railway service to run it at boot, after the blob
// migration has finished, then remove the variable.
if (process.env.OPTIMIZE_IMAGES === '1') {
    require('./db/optimizeImages').optimizeAll()
        .then(() => console.log('image optimisation pass complete'))
        .catch(e => console.error('image optimisation failed:', e.message));
}

// API routes
// One shared admin password means a brute-force attempt is the realistic
// threat against this app; cap it hard. Successful logins are not counted.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// The public application form sends mail and accepts an attachment, so it is
// the other endpoint worth metering.
const applyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many applications from this address. Please try again later.' },
});

app.use('/api/auth/login',   loginLimiter);
app.use('/api/careers/apply', applyLimiter);

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/admin',       require('./routes/admin'));
app.use('/api/projects',    require('./routes/projects'));
app.use('/api/blog',        require('./routes/blog'));
app.use('/api/careers',     require('./routes/careers'));
app.use('/api/page-images', pageImages);
app.use('/api/banner-clips', banners);
app.use('/api/text-content', textContent);
app.use('/api/media',        media);
app.use('/api/staff',        staff);

// Unmatched API paths must not fall through to HTML — a client parsing JSON
// should get JSON.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Fallback for everything else. Every internal link in the site uses an
// explicit .html filename, so reaching here means the URL really is wrong:
// answer 404 (not 200) so search engines stop indexing these as real pages,
// while still rendering the site rather than a bare error.
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// Global error handler. Upload problems and other deliberate 4xx errors carry a
// message meant for the user; anything else is an internal fault and must not
// have its details (SQL text, file paths) echoed back to the caller.
app.use((err, req, res, next) => {
    console.error(err);
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File is too large.' });
    }
    const status = err && (err.status || err.statusCode);
    if (status && status >= 400 && status < 500) {
        return res.status(status).json({ error: err.message || 'Bad request' });
    }
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SUNJIN server running on port ${PORT}`));
