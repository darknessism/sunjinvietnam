const express = require('express');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

router.post('/login', (req, res) => {
    const { password } = req.body || {};
    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
});

module.exports = router;
