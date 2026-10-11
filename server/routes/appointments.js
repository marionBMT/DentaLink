const router = require('express').Router();
const nodemailer = require('nodemailer');
const Appointment = require('../models/Appointment');
const User = require('../models/User'); // Required to fetch admin details
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// Setup Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Helper to format time for emails
const formatTimeFriendly = (timeString) => {
    if (!timeString) return '';
    const [hour, minute] = timeString.split(':');
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; 
    return `${timeString} (${h}:${minute} ${ampm})`;
};

// 1. CREATE APPOINTMENT (Patient)
router.post('/', verifyToken, async (req, res) => {
    try {
        // ADDED dentistName here
        const { serviceType, dentistName, requestedDate, requestedTime } = req.body;
        
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
            dentistName, // ADDED dentistName here
            requestedDate,
            requestedTime
        });

        res.status(201).json(newAppt);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// 2. GET APPOINTMENTS (Smart Route)
router.get('/', verifyToken, async (req, res) => {
    try {
        if (req.user.role === 'admin') {
            // Admin sees all appointments
            const appts = await Appointment.find().populate('patient', 'name email').sort({ createdAt: -1 });
            return res.json(appts);
        } else {
            // UPDATED: Patient ONLY sees appointments that are NOT archived
            const appts = await Appointment.find({ patient: req.user.id, isArchived: false }).sort({ createdAt: -1 });
            return res.json(appts);
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// 3. UPDATE APPOINTMENT (Admin Approves, Rejects, or Counters)
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const updatedAppt = await Appointment.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { returnDocument: 'after' }
        ).populate('patient'); // Populate patient to get their email

        if (!updatedAppt) return res.status(404).json({ message: 'Appointment not found' });

        // If the action was performed by an admin, send an email notification
        if (req.user.role === 'admin' && updatedAppt.patient && updatedAppt.patient.email) {
            const adminUser = await User.findById(req.user.id);
            let subject = '';
            let htmlContent = '';
            
            const commonFooter = `
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                    <p style="margin: 0;"><strong>Admin Contact:</strong> ${adminUser.name} (${adminUser.email})</p>
                    <p style="margin: 5px 0 0 0; font-size: 0.9em; color: #777;">Regards,<br><strong>DentaLink Administration</strong></p>
                </div>
            `;

            if (updatedAppt.status === 'Confirmed') {
                subject = 'DentaLink - Appointment Confirmed!';
                htmlContent = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #28a745;">Appointment Confirmed</h2>
                        <p>Hello <strong>${updatedAppt.patient.name}</strong>,</p>
                        <p>Your appointment for <strong>${updatedAppt.serviceType}</strong> has been officially confirmed by <strong>${adminUser.name}</strong>.</p>
                        <div style="background-color: #f8f9fa; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
                            <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${updatedAppt.requestedDate}</p>
                            <p style="margin: 0 0 10px 0;"><strong>Time:</strong> ${formatTimeFriendly(updatedAppt.requestedTime)}</p>
                            <p style="margin: 0;"><strong>Assigned Dentist:</strong> ${updatedAppt.dentistName}</p>
                        </div>
                        <p>You may now proceed to the clinic at your scheduled time. If you have any immediate concerns, please contact the admin who confirmed your appointment.</p>
                        ${commonFooter}
                    </div>
                `;
            } else if (updatedAppt.status === 'Admin_Counter_Offer') {
                subject = 'DentaLink - New Schedule Suggestion';
                htmlContent = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #ffc107;">Schedule Update Suggested</h2>
                        <p>Hello <strong>${updatedAppt.patient.name}</strong>,</p>
                        <p>An administrator (<strong>${adminUser.name}</strong>) has reviewed your appointment request for <strong>${updatedAppt.serviceType}</strong> with <strong>${updatedAppt.dentistName}</strong> and suggested a new time.</p>
                        <div style="background-color: #f8f9fa; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                            <p style="margin: 0 0 10px 0;"><strong>Suggested Date:</strong> ${updatedAppt.adminSuggestedDate}</p>
                            <p style="margin: 0 0 10px 0;"><strong>Suggested Time:</strong> ${formatTimeFriendly(updatedAppt.adminSuggestedTime)}</p>
                            <p style="margin: 0;"><strong>Admin Remarks:</strong> ${updatedAppt.adminRemarks}</p>
                        </div>
                        <p>Please log in to your DentaLink dashboard to accept this new time, request another option, or cancel the request.</p>
                        ${commonFooter}
                    </div>
                `;
            } else if (updatedAppt.status === 'Rejected') {
                subject = 'DentaLink - Appointment Request Declined';
                htmlContent = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #dc3545;">Appointment Request Declined</h2>
                        <p>Hello <strong>${updatedAppt.patient.name}</strong>,</p>
                        <p>We regret to inform you that your appointment request for <strong>${updatedAppt.serviceType}</strong> with <strong>${updatedAppt.dentistName}</strong> on ${updatedAppt.requestedDate} could not be accommodated at this time.</p>
                        <div style="background-color: #f8f9fa; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
                            <p style="margin: 0;"><strong>Reason:</strong> ${updatedAppt.adminRemarks}</p>
                        </div>
                        <p>If you would like to schedule for a different day, please submit a new request through your dashboard.</p>
                        ${commonFooter}
                    </div>
                `;
            }

            // Only send if a subject was set (meaning one of the above 3 actions occurred)
            if (subject) {
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: updatedAppt.patient.email,
                    subject: subject,
                    html: htmlContent
                };
                // Fire and forget the email so the UI doesn't hang waiting for Google's SMTP
                transporter.sendMail(mailOptions).catch(err => console.error("Email send failed:", err));
            }
        }

        res.json(updatedAppt);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// --- UPDATED: ARCHIVE / RESTORE APPOINTMENT WITH EMAIL NOTIFICATION ---
router.put('/:id/archive', verifyToken, isAdmin, async (req, res) => {
    try {
        const { isArchived, reason, contact } = req.body;
        
        // Fetch the appointment and populate patient data to get their email
        const targetAppt = await Appointment.findById(req.params.id).populate('patient');
        if (!targetAppt) return res.status(404).json({ message: 'Appointment not found' });

        targetAppt.isArchived = isArchived;
        await targetAppt.save();

        // If archiving, send the email
        if (isArchived && reason && contact && targetAppt.patient) {
            const adminUser = await User.findById(req.user.id);
            
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: targetAppt.patient.email,
                subject: 'DentaLink - Appointment Archival Notice',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #d9534f;">Appointment Archival Notice</h2>
                        <p>Hello <strong>${targetAppt.patient.name}</strong>,</p>
                        <p>This is an automated notification to inform you that your DentaLink appointment request for <strong>${targetAppt.serviceType}</strong> on <strong>${targetAppt.requestedDate}</strong> has been archived by an administrator.</p>
                        
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

        res.json({ message: 'Appointment archive status updated successfully' });
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