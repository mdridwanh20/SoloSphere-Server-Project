import express, { json } from 'express'
import cors from 'cors'
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb'
import dotenv from 'dotenv';
dotenv.config();
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
// console.log(process.env.SECRET_KEY);


const port = process.env.PORT || 5000
const app = express()
app.use(cookieParser())

// jwt work here
const corsOptions = {
  origin: ['http://localhost:5173'],
  credentials: true,
  optionalSuccessStatus: 200,
}
// middle war
app.use(cors(corsOptions)) // jwt work corsOptions
app.use(json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.37zek.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

// verification; token ----------user this client site : BidRequests file
const verification = (req, res, next) => {
  const token = req.cookies?.token
  if (!token) return res.status(401).send({ message: 'unauthorized access' })
  jwt.verify(token, process.env.SECRET_KEY, (error, decoded => {

    if (err) {
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
  }))
  next()
}

async function run() {
  try {
    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })

    // database collection;
    const jobCollection = client.db('solo-db').collection("jobs")
    const bidsCollection = client.db('solo-db').collection("bids")

    // * generation jwt;
    app.post('/jwt', async (req, res) => {
      // create token
      const email = req.body
      const token = jwt.sign(email, process.env.SECRET_KEY, { expiresIn: '365d' })
      // console.log(token);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENY === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      })
        .send({ success: true })
    })


    // logout || clear cookie from browser
    app.get('/logout', async (req, res) => {
      res.clearCookie('token', {
        maxAge: 0,
        secure: process.env.NODE_ENY === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      })
        .send({ success: true })
    })




    // * save a job in db;
    app.post('/add-job', async (req, res) => {
      const jobData = req.body;
      const result = await jobCollection.insertOne(jobData)
      res.send(result)
    })

    // get all jobs data from db;
    app.get('/all-jobs', async (req, res) => {
      // filter all jobs and search work here:
      const filter = req.query.filter
      const search = req.query.search
      const sort = req.query.sort
      let options = {}
      if (sort) options = { sort: { deadline: sort === 'asc' ? 1 : -1 } }

      let query = {
        title:
          { $regex: search, $options: 'i' }
      }

      if (filter) query.category = filter
      const result = await jobCollection.find(query, options).toArray()
      res.send(result)

    })

    // get all jobs;
    app.get('/all-jobs-tab', async (req, res) => {
      const result = await jobCollection.find().toArray()
      res.send(result)
    })


    // get all jobs posted by a specific user;
    app.get('/jobs/:email', async (req, res) => {
      const email = req.params.email
      const query = { 'buyer.email': email }
      const result = await jobCollection.find(query).toArray()
      res.send(result);
    })

    // delete a job from db;
    app.delete('/jobs/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await jobCollection.deleteOne(query)
      res.send(result)
    })

    // get a single job data by id from db ;
    app.get('/job/:id', async (req, res) => {
      const id = req.params
      const query = { _id: new ObjectId(id) }
      const result = await jobCollection.findOne(query)
      res.send(result)
    })

    // save a job in db; (with update data)
    app.put('/update-job/:id', async (req, res) => {
      const id = req.params.id
      const jobData = req.body;

      const update = {
        $set: jobData,
      }
      const query = { _id: new ObjectId(id) }
      const option = { upsert: true }

      const result = await jobCollection.updateOne(query, update, option)
      res.send(result)
    })





    // * save a bid data in db
    app.post('/add-bid', async (req, res) => {
      const bidData = req.body

      // if a user placed a bid already in this job;
      const query = { email: bidData.email, jobId: bidData.jobId }
      const alreadyExist = await bidsCollection.findOne(query)
      if (alreadyExist)
        return res
          .status(400)
          .send('You have already placed a bid on this job')

      // save data in bids collection
      const result = await bidsCollection.insertOne(bidData)

      // increase bid count in jobs collection;
      const filter = { _id: new ObjectId(bidData.jobId) }
      const update = {
        $inc: { Bid_count: 1 }
      }
      const updateBidCount = await jobCollection.updateOne(filter, update)
      res.send(result)

    })

    // get all bids for a specific;
    app.get('/bids/:email', async (req, res) => {

      const email = req.params.email
      const query = { email }
      const result = await bidsCollection.find(query).toArray()
      res.send(result)

    })

    // get all bid request for a specific user; ------------> file BidRequests
    app.get('/bid-request/:email', verification, async (req, res) => {
      // token work next one line
      const decodedEmail = req.user?.email

      const email = req.params.email
      console.log('email from token-->', decodedEmail);
      console.log('email from token-->', email);
      
      const query = { buyer: email }
      const result = await bidsCollection.find(query).toArray()
      if (decodedEmail !== email) return

      res.send(result)
    })


    // update bid status;
    app.patch('/bid-status-update/:id', async (req, res) => {
      const id = req.params.id
      const { status } = req.body
      const filter = { _id: new ObjectId(id) }
      const updated = {
        $set: { status: status },
      }
      const result = await bidsCollection.updateOne(filter, updated)
      res.send(result)
    })




    console.log(
      `Pinged your deployment. You successfully connected to MongoDB! ${port}`
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)
app.get('/', (req, res) => {
  res.send('Hello from SoloSphere Server....')
})

app.listen(port, () => console.log(`Server running on port ${port}`))
