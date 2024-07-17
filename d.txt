const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
const app = express();
require('dotenv').config()
const stripe= require('stripe')(process.env.STRIPE_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ycbv1lf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    const userCollection = client.db('fitDB').collection('users')
    const trainerCollection = client.db('fitDB').collection('trainers')
    const confirmedTrainerCollection =client.db('fitDB').collection('confirmedTrainers') 
    const bookedTrainerCollection = client.db('fitDB').collection('bookedTrainers')
    const paymentCollection = client.db('fitDB').collection('payments')
    const newsLetterCollection = client.db('fitDB').collection('news')
    const feedbackCollection = client.db('fitDB').collection('feedback')
    const reviewCollection = client.db('fitDB').collection('review')
    const newClassCollection = client.db('fitDB').collection('newClass')
    const forumCollection = client.db('fitDB').collection('forum')

    // jwt api
    app.post('/jwt', async(req,res)=>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {expiresIn: '365d'}) 
      res.send({token})
    })
     // middleware
     const verifyToken=(req,res,next)=>{
      console.log('inside',req.headers.authorization)
      if (!req.headers.authorization) {
        return res.status(401).send({message:'forbidden access'})
        
      }
      const token = req.headers.authorization.split(' ')[1];
     
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded)=>{
        if (err) {
          return res.status(401).send({message: 'forbidden access'})
          
        }
        req.decoded= decoded;
        next()

      })

    }
    // verify admin after verify token
    const verifyAdmin = async (req,res,next)=>{
      const email = req.decoded.email;
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role==='admin';
      if(!isAdmin){
        return res.status(403).send({message: 'forbidden access'})
      }
      next()
    }

// user
    app.get('/users', verifyToken,verifyAdmin,  async(req,res)=>{
     
      const result = await userCollection.find().toArray();
      res.send(result) 
    })
    app.get('/users/:email', verifyToken,  async(req,res)=>{
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result) 
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
    
      // Don't let a user insert in db if it already exists
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
    
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }
    
      // Set role to 'member'
      user.role = 'member';
    
      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    
    // admin
    app.patch('/users/admin/:id',verifyToken,verifyAdmin, async (req,res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateDoc = {
        $set:{
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result)
    }) 
    app.get('/users/admin/:email', verifyToken, async(req,res)=>{
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({message: 'unauthorized access'})
        
      }
      const query = {email: email};
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role=== 'admin';
        
      }
      res.send({ admin})

    })

    // trainers
    app.get('/trainers', verifyToken,verifyAdmin, async(req,res)=>{
      const result = await trainerCollection.find().toArray();
      res.send(result)
  })

  app.post('/trainers', async(req,res)=>{
    const item = req.body;
    const query = {email: item.email}
      const existingItem = await trainerCollection.findOne(query);
      if(existingItem){
        return res.send({message: 'user already requested', insertedId: null})
      }
    const result = await trainerCollection.insertOne(item)
    res.send(result)
  })
  
  app.get('/trainers/:id',async(req,res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await trainerCollection.findOne(query)
    res.send(result)
  })
  app.get('/feedTrainers/:email',async(req,res)=>{
    
    const email = req.params.email;
    const query = { email: email };
    const result = await trainerCollection.findOne(query)
    res.send(result)
  })
  // confirmed trainer
  app.patch('/trainers/confirm/:id',verifyToken,verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };

    try {
        const trainer = await trainerCollection.findOne(query);

        if (!trainer) {
            return res.status(404).json({ message: 'Trainer not found' });
        }

        console.log('Trainer found:', trainer);

        // Update trainer status in trainerCollection
        const updateTrainerResult = await trainerCollection.updateOne(query, { $set: { status: 'Trainer' } });
        console.log('updateTrainerResult:', updateTrainerResult);

        // Insert trainer into confirmedTrainerCollection with updated status
        const insertResult = await confirmedTrainerCollection.insertOne({ ...trainer, status: 'Trainer' });
        console.log('insertResult:', insertResult);

        // Update user role in userCollection
        const updateUserResult = await userCollection.updateOne({ email: trainer.email }, { $set: { role: 'trainer' } });
        console.log('updateUserResult:', updateUserResult);

        // Verify the role update
        const updatedUser = await userCollection.findOne({ email: trainer.email });
        console.log('updatedUser:', updatedUser);

        if (!updateUserResult.modifiedCount) {
            return res.status(400).json({ message: 'Failed to update user role' });
        }

        // Delete trainer from trainerCollection
        const deleteResult = await trainerCollection.deleteOne(query);
        console.log('deleteResult:', deleteResult);

        res.json({ message: 'Trainer confirmed and moved', trainer });
    } catch (error) {
        console.error('Error confirming trainer:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// feedback
app.post('/reject/:id', verifyToken, async (req, res) => {
  const id = req.params.id;
  const feedback = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid trainer ID' });
  }

  const query = { _id: new ObjectId(id) };

  try {
    // Insert rejected trainer into feedbackCollection with feedback and status
    const insertResult = await feedbackCollection.insertOne(feedback);
    console.log('insertResult:', insertResult);

    if (insertResult.insertedCount === 0) {
      return res.status(500).json({ message: 'Failed to insert feedback' });
    }

    // Delete trainer from trainerCollection
    const deleteResult = await trainerCollection.deleteOne(query);
    console.log('deleteResult:', deleteResult);

    if (deleteResult.deletedCount === 0) {
      return res.status(500).json({ message: 'Failed to delete trainer' });
    }

    res.json({
      message: 'Trainer rejected and feedback recorded',
      insertResult,
      deleteResult
    });
  } catch (error) {
    console.error('Error rejecting trainer:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/reject/:email', verifyToken,  async(req,res)=>{
  const email = req.params.email;
  const query = { email: email };
  const result = await feedbackCollection.findOne(query);
  res.send(result)
})


  // get confirmed trainer
  app.get('/confirmedTrainer',  async(req,res)=>{
    const result = await confirmedTrainerCollection.find().toArray();
    res.send(result)
})
app.get('/users/trainer/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;

    // If the email in the request does not match the email in the token, return an unauthorized access message
    if (email !== req.decoded.email) {
      return res.status(403).send({ message: 'unauthorized access' });
    }

    const query = { email: email };
    
    const user = await userCollection.findOne(query);
    let trainer = false;

    if (user) {
      trainer = user?.role === 'trainer';
     }

    res.send({ trainer });
  } catch (error) {
    console.error('Error fetching member information:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});

app.get('/confirmedTrainer/:id',async(req,res)=>{
  const id = req.params.id;
  const query = {_id: new ObjectId(id)}
  const result = await confirmedTrainerCollection.findOne(query)
  res.send(result)
})
app.delete('/confirmedTrainer/:id',verifyToken, verifyAdmin, async(req,res)=>{
  const id = req.params.id;
  const query = {_id: new ObjectId(id)}
  const result = await confirmedTrainerCollection.deleteOne(query);
  res.send(result)
    })

  // trainers by email
  app.get('/trainee/:email', async (req, res) => {
    const email = req.params.email;
    
    
    const query = { email: email };
    
    try {
        const result = await confirmedTrainerCollection.findOne(query);
        if (result) {
            res.send(result);
        } else {
            res.status(404).send({ message: 'No trainer found with the specified available time' });
        }
    } catch (error) {
        console.error('Error finding trainer:', error);
        res.status(500).send({ message: 'Internal server error' });
    }
});
app.put('/trainee/new/:email', verifyToken, async (req, res) => {
  const email = req.params.email;

  const query = { email: email };

  try {
      const result = await confirmedTrainerCollection.findOne(query);
      if (result) {
          // Update the existing document with new fields
          const update = {
              $set: {
                  newslotName: req.body.newslotName,
                  newslotTime: req.body.newslotTime,
                  newdays: req.body.newdays
              }
          };

          await confirmedTrainerCollection.updateOne(query, update);

          // Fetch the updated document
          const updatedResult = await confirmedTrainerCollection.findOne(query);

          res.send(updatedResult);
      } else {
          res.status(404).send({ message: 'No trainer found with the specified email' });
      }
  } catch (error) {
      console.error('Error finding trainer:', error);
      res.status(500).send({ message: 'Internal server error' });
  }
});


  // bookedTrainer
  app.get('/booked',  async(req,res)=>{
     
    const result = await bookedTrainerCollection.find().toArray();
    res.send(result) 
  })
  app.get('/booked/:name', verifyToken,  async(req,res)=>{
    const userName = req.params.name;
    const query = { name: userName  };
     
    const result = await bookedTrainerCollection.find(query).toArray();
    res.send(result) 
  })
  
  app.post('/booked', async(req,res)=>{
    const booked= req.body;
    
    
    const result = await bookedTrainerCollection.insertOne(booked);
    res.send(result)
  })
  app.get('/booked', async(req,res)=>{
    
    const result = await bookedTrainerCollection.find().toArray();
    res.send(result)
  })
  app.get('/bookedUser/:email', async (req, res) => {
    const userEmail = req.params.email; 
    const query = { userEmail: userEmail }; 
    const result = await bookedTrainerCollection.find(query).toArray(); 
    res.send(result);
});
  // get booked details by id
  app.get('/bookeee/:id',async(req,res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await bookedTrainerCollection.findOne(query)
    res.send(result)
  })
  app.delete('/bookeee/:id',verifyToken, async(req,res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await bookedTrainerCollection.deleteOne(query);
    res.send(result)
      })
  // member api
  app.get('/users/member/:email', verifyToken, async (req, res) => {
    try {
      const email = req.params.email;
  
      // If the email in the request does not match the email in the token, return an unauthorized access message
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' });
      }
  
      const query = { email: email };  
      const user = await userCollection.findOne(query);
      let member = false;
  
      if (user) {
        member = user?.role === 'member';
       }
  
      res.send({ member });
    } catch (error) {
      console.error('Error fetching member information:', error);
      res.status(500).send({ message: 'Internal server error' });
    }
  });

  // payment api
  app.post('/create-payment-intent', async(req,res)=>{
    const {price}=req.body;
    const amount = parseInt(price * 100)
    console.log(amount,'amount inside the intent')
    const paymentIntent = await stripe.paymentIntents.create({
      amount:amount,
      currency:'usd',
      payment_method_types:['card']
    });

    res.send({
      clientSecret: paymentIntent.client_secret
    })
 
  })
   app.post('/payments', async(req,res)=>{
    const payment = req.body;
    const paymentResult = await paymentCollection.insertOne(payment);
    // delete each item from cart
    console.log('payment info', payment)
    const filter = { statusBook: payment.statusBook};
      const updateDoc = {
        $set:{
          statusBook: 'Booked'
        }
      }
      const updateResult = await bookedTrainerCollection.updateOne(filter, updateDoc);
    // const query = { slotId: payment.slotId };
    // const deleteResult = await bookedTrainerCollection.deleteOne(query)
    res.send({paymentResult, updateResult})


  })
  app.get('/payments', verifyToken,verifyAdmin,  async(req,res)=>{
     
    const result = await paymentCollection.find().toArray();
    res.send(result) 
  })

  // newsletter
  app.post('/news', async (req, res) => {
    const news = req.body;
  
    // Don't let a user insert in db if it already exists
    const query = { email: news.email };
    const existingUser = await newsLetterCollection.findOne(query);
  
    if (existingUser) {
      return res.send({ message: 'User already exists', insertedId: null });
    }
  
  
    const result = await newsLetterCollection.insertOne(news);
    res.send(result);
  });
  app.get('/news', verifyToken,verifyAdmin,  async(req,res)=>{
     
    const result = await newsLetterCollection.find().toArray();
    res.send(result) 
  })
  // states or analytics
  app.get('/admin-stats',verifyToken, verifyAdmin, async(req,res)=>{
    const newsUser = await newsLetterCollection.estimatedDocumentCount();
    
    const paymentUser = await paymentCollection.estimatedDocumentCount();
    // revenue
    const result = await paymentCollection.aggregate([
      {
        $group:{
          _id: null,
          totalRevenue:{
            $sum:'$price'
          }
        }

      }
    ]).toArray();

    const revenue = result.length > 0?result[0].totalRevenue : 0
    res.send({
       newsUser,paymentUser, revenue
    })
  })
  // review
  app.post('/review', async(req,res)=>{
    const booked= req.body;
   
    
    const result = await reviewCollection.insertOne(booked);
    res.send(result)
  })
  app.get('/review', async(req,res)=>{
    
    const result = await reviewCollection.find().toArray();
    res.send(result)
  })
  // new class
  app.post('/newClass',verifyToken,verifyAdmin, async(req,res)=>{
    const newClass= req.body;
   
    
    const result = await newClassCollection.insertOne(newClass);
    res.send(result)
  })
  app.get('/newClass', async(req,res)=>{
    
    const result = await newClassCollection.find().toArray();
    res.send(result)
  })
  
  // forum
  app.post('/forum',verifyToken, async (req, res) => {
    const newClass = req.body;
    const result = await forumCollection.insertOne(newClass);
    res.send(result);
});

// Get all posts
app.get('/forum', async (req, res) => {
    const result = await forumCollection.find().toArray();
    res.send(result);
});

// Upvote a post
app.post('/forum/:id/upvote', async (req, res) => {
    const postId = req.params.id;
    try {
        const result = await forumCollection.findOneAndUpdate(
            { _id: new ObjectId(postId) },
            { $inc: { upvotes: 1 } },
            { returnDocument: 'after' }
        );
        if (!result.value) return res.status(404).json({ message: 'Post not found' });

        res.json({ upvotes: result.value.upvotes, downvotes: result.value.downvotes });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Downvote a post
app.post('/forum/:id/downvote', async (req, res) => {
    const postId = req.params.id;
    try {
        const result = await forumCollection.findOneAndUpdate(
            { _id: new ObjectId(postId) },
            { $inc: { downvotes: 1 } },
            { returnDocument: 'after' }
        );
        if (!result.value) return res.status(404).json({ message: 'Post not found' });

        res.json({ upvotes: result.value.upvotes, downvotes: result.value.downvotes });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get the current votes for a post
app.get('/forum/:id', async (req, res) => {
    const postId = req.params.id;
    try {
        const post = await forumCollection.findOne({ _id: new ObjectId(postId) });
        if (!post) return res.status(404).json({ message: 'Post not found' });

        res.json({ upvotes: post.upvotes, downvotes: post.downvotes });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);







app.get('/',(req,res)=>{
    res.send('fitness tracker')
})

app.listen(port,()=>{
    console.log(`fitness tracker running on port, ${port}`)
})