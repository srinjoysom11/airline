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
app.set('view engine', 'ejs');

// User Schema
const userSchema = new mongoose.Schema({
    loginId: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
    },
    contactNo: {
        type: String,
        required: true,
        unique: true
    },
    emailId: {
        type: String,
        required: true,
        unique: true
    }
});

// Admin Schema
const AdminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    license: { type: String, required: true }
});

// Flight Schema
const flightSchema = new mongoose.Schema({
    flightName: String,
    departureTime: Date,
    departingFrom: String,
    destination: String,
    arrivalTime: Date,
    capacity: Number
});

// Create models using mongoose
const User = mongoose.model('User', userSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const Flight = mongoose.model('Flight', flightSchema);

// Seed data
const seedData = async () => {
    try {
        await Admin.deleteMany({});
        await User.deleteMany({});

        const admin = new Admin({
            username: 'SnehDadhania',
            password: 'abc123',
            license: 'xyz123'
        });

        await admin.save();
        console.log('Admin has been successfully stored in the database.');
    } catch (error) {
        console.error('Error storing admin:', error);
    }
};

seedData();

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.get('/admin', (req, res) => {
    res.render('entry');
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    try {
        const { loginId, password, contactNo, emailId, license } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ loginId, password: hashedPassword, contactNo, emailId, license });
        await newUser.save();
        res.redirect('/login');
    } catch (err) {
        res.send('Error registering user.');
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    try {
        const { loginId, password } = req.body;
        const foundUser = await User.findOne({ loginId });
        if (foundUser) {
            const validPassword = await bcrypt.compare(password, foundUser.password);
            if (validPassword) {
                res.redirect('/search');
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

app.get('/admin/login', (req, res) => {
    res.render('adminlogin');
});

app.post('/admin/login', async (req, res) => {
    try {
        const { username, password, license } = req.body;
        const foundAdmin = await Admin.findOne({ username, license });
        if (foundAdmin) {
            const validPassword = password === foundAdmin.password;
            if (validPassword) {
                res.redirect('/dashboard');
            } else {
                res.send('Invalid password.');
            }
        } else {
            res.send('Admin not found.');
        }
    } catch (err) {
        res.send('Error logging in.');
    }
});

app.get('/dashboard', (req, res) => {
    res.render('dashboard');
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
    res.render('search');
});

app.post('/search-flights', async (req, res) => {
    try {
        const { departingFrom, destination, date } = req.body;

        // Find direct flights
        const directFlights = await Flight.find({
            departingFrom,
            destination,
            departureTime: {
                $gte: new Date(date),
                $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1))
            }
        });

        // Find connecting flights
        const connectingFlights = await Flight.aggregate([
            {
                $match: {
                    departingFrom,
                    departureTime: {
                        $gte: new Date(date),
                        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1))
                    }
                }
            },
            {
                $lookup: {
                    from: 'flights',
                    let: { firstLegDestination: '$destination', firstLegArrivalTime: '$arrivalTime' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$departingFrom', '$$firstLegDestination'] },
                                        { $eq: ['$destination', destination] },
                                        { $gt: ['$departureTime', '$$firstLegArrivalTime'] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'secondLeg'
                }
            },
            {
                $unwind: '$secondLeg'
            },
            {
                $project: {
                    flightName: 1,
                    departureTime: 1,
                    destination: 1,
                    arrivalTime: 1,
                    capacity: 1,
                    firstLeg: '$$ROOT',
                    secondLeg: '$secondLeg'
                }
            }
        ]);

        res.json([...directFlights, ...connectingFlights]);
    } catch (err) {
        console.error(err);
        res.send('Error searching for flights.');
    }
});

app.post('/book-flight', async (req, res) => {
    try {
        const { name, phone, flightId, connectingFlightId } = req.body;

        // Find the flight by ID
        const flight = await Flight.findById(flightId);
        let connectingFlight = null;

        if (connectingFlightId) {
            connectingFlight = await Flight.findById(connectingFlightId);
            if (!connectingFlight) {
                return res.status(404).json({ success: false, message: 'Connecting flight not found.' });
            }
        }

        if (!flight) {
            return res.status(404).json({ success: false, message: 'Flight not found.' });
        }

        // Check if there is available capacity
        if (flight.capacity <= 0 || (connectingFlight && connectingFlight.capacity <= 0)) {
            return res.status(400).json({ success: false, message: 'Flight is fully booked.' });
        }

        // Decrease the capacity by 1
        flight.capacity--;
        await flight.save();

        if (connectingFlight) {
            connectingFlight.capacity--;
            await connectingFlight.save();
        }

        // If capacity becomes zero, delete the flight
        if (flight.capacity === 0) {
            await Flight.findByIdAndDelete(flightId);
        }

        if (connectingFlight && connectingFlight.capacity === 0) {
            await Flight.findByIdAndDelete(connectingFlightId);
        }

        // Return success response with flight and booking details
        res.json({
            success: true,
            flight: {
                flightName: flight.flightName,
                departureTime: flight.departureTime,
                arrivalTime: flight.arrivalTime
            },
            connectingFlight: connectingFlight ? {
                flightName: connectingFlight.flightName,
                departureTime: connectingFlight.departureTime,
                arrivalTime: connectingFlight.arrivalTime
            } : null,
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
    res.render('booking');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});