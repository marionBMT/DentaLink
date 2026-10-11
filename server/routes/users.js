const router = require('express').Router();
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Get all users (Admin)
router.get('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Create user (Admin)
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const { username, name, email, password, role } = req.body;
        
        const existingEmail = await User.findOne({ email });
        if (existingEmail) return res.status(400).json({ message: 'Email is already used.' });

        const existingUsername = await User.findOne({ username });
        if (existingUsername) return res.status(400).json({ message: 'Username is already taken.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ username, name, email, password: hashedPassword, role });
        
        res.status(201).json(newUser);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get current user profile
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update current user profile
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const { name, contactNumber, address } = req.body;
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { name, contactNumber, address },
            { returnDocument: 'after', runValidators: true }
        ).select('-password');
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Archive / Restore user (Admin)
router.put('/:id/archive', verifyToken, isAdmin, async (req, res) => {
    try {
        const { isArchived, reason, contact } = req.body;
        
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: 'User not found' });

        targetUser.isArchived = isArchived;
        await targetUser.save();

        if (isArchived && reason && contact) {
            const adminUser = await User.findById(req.user.id);
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: targetUser.email,
                subject: 'DentaLink - Account Archival Notice',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #d9534f;">Account Archival Notice</h2>
                        <p>Hello <strong>${targetUser.name}</strong>,</p>
                        <p>This is an automated notification to inform you that your DentaLink account (Username: <strong>${targetUser.username}</strong>) has been archived by an administrator.</p>
                        
                        <div style="background-color: #f8f9fa; border-left: 4px solid #f0ad4e; padding: 15px; margin: 20px 0;">
                            <p style="margin: 0 0 10px 0;"><strong>Archived By:</strong> ${adminUser.name} (${adminUser.email})</p>
                            <p style="margin: 0 0 10px 0;"><strong>Reason:</strong> ${reason}</p>
                            <p style="margin: 0;"><strong>Admin Contact:</strong> ${contact}</p>
                        </div>
                        
                        <p>If you believe this was a mistake or need further clarification, please reach out using the admin contact provided above.</p>
                        <p>Regards,<br><strong>DentaLink Administration</strong></p>
                    </div>
                `
            };
            await transporter.sendMail(mailOptions);
        }

        res.json({ message: 'User archive status updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Delete user (Admin)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;