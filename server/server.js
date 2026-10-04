require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');

const appointmentRoutes = require('./routes/appointments');

const userRoutes = require('./routes/users');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/users', userRoutes);

app.use('/api/auth', authRoutes);

app.use('/api/appointments', appointmentRoutes);

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected to DentaLink DB'))
    .catch(err => console.log('Connection error', err.message));

app.get('/', (req, res) => {
    res.send('DentaLink API is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));