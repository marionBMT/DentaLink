const router = require('express').Router();
const Appointment = require('../models/Appointment');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// 1. CREATE APPOINTMENT (Patient)
router.post('/', verifyToken, async (req, res) => {
    try {
        const { serviceType, requestedDate, requestedTime } = req.body;
        
        // Prevent multiple pending requests (spam protection)
        const existingPending = await Appointment.findOne({ 
            patient: req.user.id, 
            status: 'Pending_Admin_Approval' 
        });
        
        if (existingPending) {
            return res.status(400).json({ message: 'You already have a pending request.' });
        }

        const newAppt = await Appointment.create({
            patient: req.user.id,
            serviceType,
            requestedDate,
            requestedTime
        });

        res.status(201).json(newAppt);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// 2. GET APPOINTMENTS (Smart Route: Admin sees all, Patient sees only theirs)
router.get('/', verifyToken, async (req, res) => {
    try {
        if (req.user.role === 'admin') {
            // Populate fetches the actual patient name/email instead of just the ID
            const appts = await Appointment.find().populate('patient', 'name email').sort({ createdAt: -1 });
            return res.json(appts);
        } else {
            const appts = await Appointment.find({ patient: req.user.id }).sort({ createdAt: -1 });
            return res.json(appts);
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// 3. UPDATE APPOINTMENT (Admin Approves, Rejects, or Counters)
router.put('/:id', verifyToken, async (req, res) => {
    try {
        // req.body will contain the new status, and optionally adminSuggestedDate/Time
        const updatedAppt = await Appointment.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true }
        );
        res.json(updatedAppt);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// 4. DELETE APPOINTMENT
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        await Appointment.findByIdAndDelete(req.params.id);
        res.json({ message: 'Appointment deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

module.exports = router;