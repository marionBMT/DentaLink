const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');

// Setup Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- REGISTER ROUTE ---
router.post('/register', async (req, res) => {
    try {
        const { username, name, email, password } = req.body;
        
        // 1. Check specifically for existing email
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ message: 'Email is already used. Please log in or use another email.' });
        }

        // 2. Check specifically for existing username
        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            return res.status(400).json({ message: 'Username is already taken.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({ username, name, email, password: hashedPassword });

        res.status(201).json({ message: 'Account created successfully', userId: user._id });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// --- STEP 1: LOGIN (Check Password & Send OTP) ---
router.post('/login', async (req, res) => {
    try {
        // Change from email to identifier
        const { identifier, password } = req.body;

        // Search for user by matching identifier to either email OR username
        const user = await User.findOne({ 
            $or: [{ email: identifier }, { username: identifier }] 
        });
        
        if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials.' });

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save to database with 10-minute expiration
        user.otp = otpCode;
        user.otpExpires = Date.now() + 10 * 60 * 1000; 
        await user.save();

        // Send Email (always to the user's registered email)
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'DentaLink - Your Login Security Code',
            text: `Your 6-digit login code is: ${otpCode}\n\nThis code will expire in 10 minutes.`
        });

        res.json({ message: 'OTP sent to email', requireOtp: true, email: user.email });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// --- STEP 2: VERIFY OTP & LOGIN ---
router.post('/verify-otp', async (req, res) => {
    try {
        // Change from email to identifier
        const { identifier, otp } = req.body;

        // Search for user by matching identifier to either email OR username
        const user = await User.findOne({ 
            $or: [{ email: identifier }, { username: identifier }] 
        });
        
        if (!user || user.otp !== otp || user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP code.' });
        }

        // Clear the OTP fields now that it is used
        user.otp = null;
        user.otpExpires = null;
        await user.save();

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' } 
        );

        res.json({ token, role: user.role, name: user.name });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// --- NEW: FORGOT PASSWORD - SEND OTP ---
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) return res.status(404).json({ message: 'User with this email not found.' });

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otpCode;
        user.otpExpires = Date.now() + 10 * 60 * 1000;
        await user.save();

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'DentaLink - Password Reset OTP',
            text: `Your 6-digit password reset code is: ${otpCode}\n\nThis code will expire in 10 minutes.`
        });

        res.json({ message: 'Password reset OTP sent to email' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// --- NEW: FORGOT PASSWORD - VERIFY OTP ---
router.post('/verify-reset-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });

        if (!user || user.otp !== otp || user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP code.' });
        }

        res.json({ message: 'OTP verified successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// --- NEW: FORGOT PASSWORD - RESET PASSWORD ---
router.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: 'User not found.' });

        // 1. Check if the new password matches the current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ message: 'Cannot change password with the current password.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        user.password = hashedPassword;
        user.otp = null; 
        user.otpExpires = null;
        await user.save();

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;