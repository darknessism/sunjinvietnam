require('dotenv').config();
const express = require('express');
const path    = require('path');

const app = express();
app.use(express.json({ limit: '5mb' }));

// Serve all static HTML/CSS/JS/images from the project root
app.use(express.static(path.join(__dirname)));

// API routes
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/admin',   require('./routes/admin'));
app.use('/api/projects',require('./routes/projects'));
app.use('/api/blog',    require('./routes/blog'));
app.use('/api/careers', require('./routes/careers'));

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
