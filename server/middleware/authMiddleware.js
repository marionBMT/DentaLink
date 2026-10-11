const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Import the User model

async function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // --- NEW: CHECK IF USER WAS ARCHIVED MID-SESSION ---
        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        
        if (user.isArchived) {
            // Send a specific flag 'forceLogout' so the frontend knows to kick them out
            return res.status(403).json({ message: 'Account is archived.', forceLogout: true });
        }

        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ message: 'Invalid or expired token.' });
    }
}

function isAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    next();
}

module.exports = { verifyToken, isAdmin };