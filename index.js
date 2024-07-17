const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ycbv1lf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const userCollection = client.db('tkashDB').collection('users');
    const moneyCollection = client.db('tkashDB').collection('sendMoney');
// jwt
    const authenticateToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];
    
      if (!token) {
        return res.sendStatus(401); // Unauthorized
      }
    
      jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
          return res.sendStatus(403); // Forbidden
        }
        req.user = user;
        next();
      });
    };

    // Registration endpoint
    app.post('/users', async (req, res) => {
      const user = req.body;

      // Hash the PIN
      const hashedPin = await bcrypt.hash(user.pin, 10);
      user.pin = hashedPin; // Store hashed PIN

      // Don't let a user insert if they already exist
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }

      // Set role to 'user'
      user.role = 'user';
      
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // Login endpoint
    app.post('/login', async (req, res) => {
      const { identifier, pin } = req.body; // identifier can be email or mobile number
      const query = { $or: [{ email: identifier }, { mobile: identifier }] };
      const user = await userCollection.findOne(query);

      if (!user) {
        return res.status(401).send({ message: 'Invalid credentials' });
      }

      // Compare PIN
      const isMatch = await bcrypt.compare(pin, user.pin);
      if (!isMatch) {
        return res.status(401).send({ message: 'Invalid credentials' });
      }

      // Create and send JWT
      const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '365d' });
      res.send({ token });
    });

    app.get('/user-info',authenticateToken, async (req, res) => {
      const token = req.headers.authorization.split(' ')[1];
      if (!token) {
        return res.status(401).send({ message: 'Unauthorized' });
      }
    
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;
    
        const user = await userCollection.findOne({ _id: new ObjectId(userId) }, { projection: { pin: 0 } });
        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }
    
        res.send(user);
      } catch (err) {
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // send money
    app.post('/sendMoney', async (req, res) => {
      const { senderAccount, receiverAccount, amount, pin } = req.body;
      const token = req.headers.authorization.split(' ')[1]; // Assuming the token is sent in the Authorization header
    
      try {
        // Verify the token and get the user's ID from it
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;
    
        // Find the user by ID
        const user = await userCollection.findOne({ _id: new ObjectId(userId) });
    
        // If user is not found, send an error response
        if (!user) {
          return res.status(401).send({ message: 'Invalid credentials' });
        }
    
        // Compare PIN
        const isMatch = await bcrypt.compare(pin, user.pin);
        if (!isMatch) {
          return res.status(401).send({ message: 'Invalid credentials' });
        }
    
        // Validate amount
        if (amount < 50) {
          return res.status(400).send({ message: 'Send at least 50' });
        }
    
        // Increment amount if greater than 100 and prepare message
        let finalAmount = amount;
        let message = 'Send money successfully';
        if (amount > 100) {
          finalAmount += 5;
          message += ' with an extra charge of 5 Taka for amounts over 100 Taka.';
        }
    
        // Insert the send money details into the moneyCollection
        const sendMoneyDetails = {
          senderAccount,
          receiverAccount,
          amount: finalAmount,
          timestamp: new Date(),
        };
        const result = await moneyCollection.insertOne(sendMoneyDetails);
    
        res.send({ ...result, message });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });
    
    
    
    // 


    


    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Optionally, you can close the client when done
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('t-kash server is running fast');
});

app.listen(port, () => {
  console.log(`t-kash app listening on port ${port}`);
});
