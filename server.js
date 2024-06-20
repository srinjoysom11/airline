const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/userDB', { useNewUrlParser: true, useUnifiedTopology: true });

// User Schema
const userSchema = new mongoose.Schema({
    loginId: String,
    password: String,
    contactNo: String,
    emailId: String,
    license: String
});

const User = mongoose.model('User', userSchema);

// Flight Schema
const flightSchema = new mongoose.Schema({
    flightName: String,
    departureTime: Date,
    departingFrom: String,
    destination: String,
    arrivalTime: Date,
    capacity: Number
});

const Flight = mongoose.model('Flight', flightSchema);

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'entry.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.post('/register', async (req, res) => {
    try {
        const { loginId, password, contactNo, emailId, license } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ loginId, password: hashedPassword, contactNo, emailId, license });
        await newUser.save();
        res.redirect('/');
    } catch (err) {
        res.send('Error registering user.');
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', async (req, res) => {
    try {
        const { loginId, password, license } = req.body;
        const foundUser = await User.findOne({ loginId, license });
        if (foundUser) {
            const validPassword = await bcrypt.compare(password, foundUser.password);
            if (validPassword) {
                res.redirect('/dashboard');
            } else {
                res.send('Invalid password.');
            }
        } else {
            res.send('User not found.');
        }
    } catch (err) {
        res.send('Error logging in.');
    }
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.post('/add-flight', async (req, res) => {
    try {
        const { flightName, departureTime, departingFrom, destination, arrivalTime, capacity } = req.body;
        const newFlight = new Flight({
            flightName,
            departureTime,
            departingFrom,
            destination,
            arrivalTime,
            capacity
        });
        await newFlight.save();
        res.redirect('/dashboard');
    } catch (err) {
        res.send('Error adding flight.');
    }
});
app.get('/search', (req, res) => {
    res.sendFile(path.join(__dirname, 'search.html'));
});

app.post('/search-flights', async (req, res) => {
    try {
        const { departingFrom, destination, date } = req.body;
        const flights = await Flight.find({ departingFrom, destination, departureTime: { $gte: new Date(date), $lt: new Date(date).setDate(new Date(date).getDate() + 1) } });
        res.json(flights);
    } catch (err) {
        res.send('Error searching for flights.');
    }
});
app.post('/book-flight', async (req, res) => {
    try {const { name, phone, flightId } = req.body;

    // Find the flight by ID
    const flight = await Flight.findById(flightId);

    if (!flight) {
        return res.status(404).json({ success: false, message: 'Flight not found.' });
    }

    // Check if there is available capacity
    if (flight.capacity <= 0) {
        return res.status(400).json({ success: false, message: 'Flight is fully booked.' });
    }

    // Decrease the capacity by 1
    flight.capacity--;

    // Save the updated flight details
    await flight.save();

    // If capacity becomes zero, delete the flight
    if (flight.capacity === 0) {
        await Flight.findByIdAndDelete(flightId);
    }

    // Return success response with flight and booking details
    res.json({
        success: true,
        flight: {
            flightName: flight.flightName,
            departureTime: flight.departureTime,
            arrivalTime: flight.arrivalTime
        },
        name,
        phone
    });

} catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error booking flight.' });
}
});
// Serve booking success page
app.get('/booking', (req, res) => {
    res.sendFile(path.join(__dirname, 'booking.html'));
});


app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
