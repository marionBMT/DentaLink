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
        const { name, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'Email already in use.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, password: hashedPassword });

        res.status(201).json({ message: 'Account created successfully', userId: user._id });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// --- STEP 1: LOGIN (Check Password & Send OTP) ---
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ message: 'Invalid email or password.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid email or password.' });

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save to database with 10-minute expiration
        user.otp = otpCode;
        user.otpExpires = Date.now() + 10 * 60 * 1000; 
        await user.save();

        // Send Email
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
        const { email, otp } = req.body;

        const user = await User.findOne({ email });
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

module.exports = router;