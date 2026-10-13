require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');

const appointmentRoutes = require('./routes/appointments');

const userRoutes = require('./routes/users');

const app = express();

const corsOptions = {
    origin: [
        'http://localhost:5173', 
        'https://denta-link-pi.vercel.app' 
    ],
    credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/users', userRoutes);

app.use('/api/auth', authRoutes);

app.use('/api/appointments', appointmentRoutes);

app.use('/api/services', require('./routes/services'));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected to DentaLink DB'))
    .catch(err => console.log('Connection error', err.message));

app.get('/', (req, res) => {
    res.send('DentaLink API is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));