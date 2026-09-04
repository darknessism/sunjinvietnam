require('dotenv').config();

// Railway containers have no outbound IPv6 route. Without this, DNS may resolve
// smtp.gmail.com to an IPv6 address and SMTP fails with ENETUNREACH/ETIMEDOUT.
require('dns').setDefaultResultOrder('ipv4first');

const express = require('express');
const path    = require('path');

const app = express();
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

// Serve all static HTML/CSS/JS/images from the project root
app.use(express.static(path.join(__dirname)));

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

// Fallback: serve index.html for any unmatched route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SUNJIN server running on port ${PORT}`));
