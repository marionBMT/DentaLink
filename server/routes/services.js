const router = require('express').Router();
const Service = require('../models/Service');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// GET all services (Both patients and admins need to see the list)
router.get('/', verifyToken, async (req, res) => {
    try {
        const services = await Service.find().sort({ createdAt: -1 });
        res.json(services);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// CREATE a new service (Admin only)
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const { name, dentists } = req.body;
        
        // Validation: Prevent duplicate service names
        const existingService = await Service.findOne({ name: name.trim() });
        if (existingService) {
            return res.status(400).json({ message: 'A service with this name already exists.' });
        }

        const newService = await Service.create({ name: name.trim(), dentists: dentists || [] });
        res.status(201).json(newService);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// UPDATE a service (Admin only) - Used for renaming OR assigning/removing dentists
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { name, dentists } = req.body;
        
        // If renaming, ensure the new name isn't already taken by a DIFFERENT service
        if (name) {
            const existingService = await Service.findOne({ name: name.trim(), _id: { $ne: req.params.id } });
            if (existingService) {
                return res.status(400).json({ message: 'A service with this name already exists.' });
            }
        }

        const updatedService = await Service.findByIdAndUpdate(
            req.params.id,
            { name: name ? name.trim() : undefined, dentists },
            { returnDocument: 'after', runValidators: true }
        );

        if (!updatedService) return res.status(404).json({ message: 'Service not found' });
        
        res.json(updatedService);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// DELETE a service (Admin only)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const deletedService = await Service.findByIdAndDelete(req.params.id);
        if (!deletedService) return res.status(404).json({ message: 'Service not found' });
        res.json({ message: 'Service deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

module.exports = router;