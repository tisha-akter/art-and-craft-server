const express = require('express');
const app = express();
const cors = require('cors');
// const jwt = require('jsonwebtoken');
require('dotenv').config()

const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)

const port = process.env.PORT || 5000;


// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }

    // bearer token 
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })

}



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u4rhioo.mongodb.net/?retryWrites=true&w=majority`;

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
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const ClassesInfoCollection = client.db("summerCamp").collection("classesInfo");
        const usersCollection = client.db("summerCamp").collection("users");
        const selectedClassCollection = client.db("summerCamp").collection("selectedClasses");
        const paymentCollection = client.db("summerCamp").collection("payments");



        // Token 
        // app.post('/jwt', (req, res) => {
        //     const user = req.body;
        //     const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

        //     res.send({ token })
        // })



        // classes and instruc related api 
        app.get('/classesInfo', async (req, res) => {
            const result = await ClassesInfoCollection.find().toArray();
            res.send(result);
        })

        // update or edit 
        app.get('/classesInfo/update/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await ClassesInfoCollection.findOne(query);
            res.send(result);
        })

        // class create 
        app.post('/classesInfo', async (req, res) => {
            const newClass = req.body;
            newClass.status = 'pending';
            try {
                await ClassesInfoCollection.insertOne(newClass);
                res.json({ success: true, message: 'Class created successfully' });
            } catch (error) {
                console.error('Error creating class:', error);
                res.status(500).json({ success: false, message: 'Failed to create class' });
            }
        });



        // for approve post 
        app.patch('/classesInfo/update/status/:classId', async (req, res) => {
            const classId = req.params.classId;
            const { status, feedback } = req.body;

            console.log(classId, feedback);

            try {
                // Update the class status in the database
                await ClassesInfoCollection.updateOne(
                    { _id: new ObjectId(classId) },
                    { $set: { status: status, feedback: feedback } }
                );

                res.json({ success: true, message: 'Class status updated successfully' });
            } catch (error) {
                console.error('Error updating class status:', error);
                res.status(500).json({ success: false, message: 'Failed to update class status' });
            }
        });




        // users related api 
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });


        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user?.email }
            const existingUser = await usersCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });


        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })


        // for make admin 
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.get('/users/instructor/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' };
            res.send(result);
        })



        // delete users 
        app.delete('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        });


        //   selectedClass related apis
        app.get('/selectedClasses', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }

            // const decodedEmail = req.decoded.email;
            // if (email !== decodedEmail) {
            //     return res.status(403).send({ error: true, message: 'forbidden access' })
            // }

            const query = { email: email };
            const result = await selectedClassCollection.find(query).toArray();
            res.send(result);

        });


        app.post('/selectedClasses', async (req, res) => {
            const item = req.body;
            console.log(item);
            const result = await selectedClassCollection.insertOne(item)
            res.send(result);
        })

        app.delete('/selectedClasses/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedClassCollection.deleteOne(query);
            res.send(result);
        })


        // create payment intent 
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;

            const amount = price * 100;
            // console.log(price, amount)

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })


        // payment related api 
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment);


            const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } }
            const deleteResult = await selectedClassCollection.deleteMany(query)

            res.send({ insertResult, deleteResult });
        })


        //enrolled classes
        app.post('/enrolled-classes', async (req, res) => {
            const { userId } = req.body;

            const result = await selectedClassCollection.find({ userId }).toArray();
            res.send({ result });

        });





        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);





app.get('/', (req, res) => {
    res.send('summer camp school is running')
})

app.listen(port, () => {
    console.log(`Summer camp is is running on port ${port}`);
})