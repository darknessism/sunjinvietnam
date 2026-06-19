require('dotenv').config();

// Railway containers have no outbound IPv6 route. Without this, DNS may resolve
// smtp.gmail.com to an IPv6 address and SMTP fails with ENETUNREACH/ETIMEDOUT.
require('dns').setDefaultResultOrder('ipv4first');

const express = require('express');
const path    = require('path');

const app = express();
app.use(express.json({ limit: '5mb' }));

// Serve all static HTML/CSS/JS/images from the project root
app.use(express.static(path.join(__dirname)));

// Ensure the careers filter-options table exists and is seeded
require('./db/initCareerTax')().catch(e => console.error('career taxonomy init failed:', e.message));

// Ensure the careers table has the bilingual (English) content columns
require('./db/initCareerI18n')().catch(e => console.error('career i18n init failed:', e.message));

// Ensure the managed page-images table exists
const pageImages = require('./routes/pageImages');
pageImages.initPageImages().catch(e => console.error('page images init failed:', e.message));

// Ensure the managed banner-clips table exists
const banners = require('./routes/banners');
banners.initBanners().catch(e => console.error('banner clips init failed:', e.message));

// Ensure the editable text-content table exists
const textContent = require('./routes/textContent');
textContent.initTextContent().catch(e => console.error('text content init failed:', e.message));

// Ensure the blog "featured" flag column exists
require('./routes/blog').initBlog().catch(e => console.error('blog init failed:', e.message));

// API routes
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/admin',       require('./routes/admin'));
app.use('/api/projects',    require('./routes/projects'));
app.use('/api/blog',        require('./routes/blog'));
app.use('/api/careers',     require('./routes/careers'));
app.use('/api/page-images', pageImages);
app.use('/api/banner-clips', banners);
app.use('/api/text-content', textContent);

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
