require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('Connected to DB for seeding...');
  
  const emailToUse = 'marionbusinezz@gmail.com';
  
  // Check if you already made an account with this email
  let adminUser = await User.findOne({ email: emailToUse });
  
  if (adminUser) {
    // If it exists, force it to be an admin
    adminUser.role = 'admin';
    await adminUser.save();
    console.log(`Upgraded existing account ${emailToUse} to Admin!`);
  } else {
    // If it doesn't exist, create it from scratch
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await User.create({
      name: 'Marion (Head Admin)',
      email: emailToUse,
      password: hashedPassword,
      role: 'admin'
    });
    console.log(`Admin account created: ${emailToUse} / admin123`);
  }

  process.exit();
}).catch(err => {
  console.log('Error:', err.message);
  process.exit(1);
});