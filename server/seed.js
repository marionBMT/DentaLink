require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('Connected to DB for seeding...');
  
  const emailToUse = 'marionbusinezz@gmail.com';
  
  await User.deleteOne({ email: emailToUse });
  
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await User.create({
    username: 'admin_marion', 
    name: 'Marion (Head Admin)',
    email: emailToUse,
    password: hashedPassword,
    role: 'admin'
  });
  
  console.log(`Admin account recreated successfully: admin_marion / ${emailToUse} / admin123`);

  process.exit();
}).catch(err => {
  console.log('Error:', err.message);
  process.exit(1);
});