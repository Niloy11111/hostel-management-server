const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
const punycode = require("punycode/");
// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tg0ohza.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("hostelDB").collection("users");
    const mealCollection = client.db("hostelDB").collection("Meals");
    const upcomingMealCollection = client
      .db("hostelDB")
      .collection("upcomingMeals");
    const productionMealCollection = client
      .db("hostelDB")
      .collection("productionMeals");
    const requestedMealCollection = client
      .db("hostelDB")
      .collection("requestedMeal");
    const reviewCollection = client.db("hostelDB").collection("reviews");
    const membershipCollection = client
      .db("hostelDB")
      .collection("membershipPlans");
    const paymentCollection = client.db("hostelDB").collection("payments");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log('inside again verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //meal related api
    app.get("/meals", async (req, res) => {
      const filter = req.query;

      const searchQuery = String(filter.search || "");

      const query = {
        name: { $regex: searchQuery, $options: "i" },
      };
      const options = {
        sort: {
          price: filter.sort === "asc" ? 1 : -1,
        },
      };

      const result = await mealCollection.find(query, options).toArray();
      res.send(result);
    });

    //get meals by i
    app.get("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealCollection.findOne(query);
      res.send(result);
    });

    app.get("/upcomingMeals", async (req, res) => {
      const result = await upcomingMealCollection.find().toArray();
      res.send(result);
    });

    //get membership data
    app.get("/plans", async (req, res) => {
      const result = await membershipCollection.find().toArray();
      res.send(result);
    });

    app.get("/plans/:planName", async (req, res) => {
      const filter = { planName: req.params.planName };
      const result = await membershipCollection.find(filter).toArray();
      res.send(result);
    });

    // users related api
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    //get reviews
    app.get("/reviews", async (req, res) => {
      let query = {};

      if (req.query?.userEmail) {
        query = { userEmail: req.query.userEmail };
      }
      if (req.query?.title) {
        query = { title: req.query.title };
      }

      const cursor = reviewCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewCollection.findOne(query);
      res.send(result);
    });

    //delete review
    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewCollection.deleteOne(query);
      res.send(result);
    });

    //delete meals from allMeals
    app.delete("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealCollection.deleteOne(query);
      res.send(result);
    });

    //delete requested meal
    app.delete("/requestedMeals/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await requestedMealCollection.deleteOne(query);
      res.send(result);
    });

    // updateReview
    app.patch("/reviews/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          review: item.newReview,
        },
      };

      const result = await reviewCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    //update meals
    app.put("/updateMeals/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedMeal = req.body;

      const meal = {
        $set: {
          name: updatedMeal.name,
          category: updatedMeal.category,
          postTime: updatedMeal.postTime,
          rating: updatedMeal.rating,
          likes: updatedMeal.likes,
          review: updatedMeal.review,
          adminEmail: updatedMeal.adminEmail,
          adminName: updatedMeal.adminName,
          ingredient: updatedMeal.ingredient,
          image: updatedMeal.image,
          description: updatedMeal.description,
          price: updatedMeal.price,
        },
      };

      const result = await mealCollection.updateOne(filter, meal, options);
      res.send(result);
    });

    app.patch("/increaseReview/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const result = await mealCollection.updateOne(filter, {
        $inc: { review: 1 },
      });
      res.send(result);
    });

    //get requestedMeal
    app.get("/requestedMeals", verifyToken, async (req, res) => {
      let query = {};

      if (req.query?.userEmail) {
        query = { userEmail: req.query.userEmail };
      }

      const cursor = requestedMealCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/likedMeals/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const userLiked = req.body.userLiked;

      const result = await mealCollection.updateOne(
        filter,
        userLiked
          ? {
              $inc: { likes: 1 },
            }
          : {
              $inc: { likes: -1 },
            }
      );
      res.send(result);
    });

    app.patch("/upcomingToggle/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const isLiked = req.body.isLiked;

      const result = await upcomingMealCollection.updateOne(filter, {
        $set: { toggle: !isLiked },
      });
      res.send(result);
    });

    app.patch("/upcominglikeAddRemove/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const { userLiked, uid } = req.body;

      const updated = userLiked
        ? { $pull: { likedUsers: uid }, $inc: { likes: -1 } }
        : { $push: { likedUsers: uid }, $inc: { likes: 1 } };

      const result = await upcomingMealCollection.updateOne(filter, updated);
      res.send(result);
    });

    app.patch("/users/admin/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // patch to change status of requested meals

    app.patch("/requestedMeals/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "delivered",
        },
      };
      const result = await requestedMealCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });

    // add meal
    app.post("/meals", async (req, res) => {
      const meal = req.body;
      const result = await mealCollection.insertOne(meal);
      res.send(result);
    });

    app.post("/upcomingMeals", async (req, res) => {
      const upcomingMeal = req.body;
      const result = await upcomingMealCollection.insertOne(upcomingMeal);
      res.send(result);
    });

    app.post("/addToProductionList", async (req, res) => {
      const productionMeal = req.body;
      const result = await productionMealCollection.insertOne(productionMeal);
      const allProductions = await productionMealCollection.find().toArray();
      res.send({ result, allProductions });
    });

    app.get("/productionMeals", async (req, res) => {
      const result = await productionMealCollection.find().toArray();
      res.send(result);
    });

    //meal request
    app.post("/mealRequest", async (req, res) => {
      const meal = req.body;
      const result = await requestedMealCollection.insertOne(meal);
      res.send(result);
    });
    app.post("/reviews", async (req, res) => {
      const userEmail = req.body.userEmail;

      const meal = req.body;
      const result = await reviewCollection.insertOne(meal);
      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price, email } = req.body;
      const amount = parseInt(price * 100);

      // console.log("email", email);

      const query = { email: email };
      const latestPayment = await paymentCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();

      if (latestPayment) {
        const createdAtMs = new Date(latestPayment[0].createdAt).getTime();
        const currentDateMs = Date.now();
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
        // const thirtyDaysInMs = 1 * 60 * 1000;

        if (currentDateMs - createdAtMs < thirtyDaysInMs) {
          return res.status(403).json({
            message: "Access denied. You can only pay once every 30 days.",
          });
        }
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };

      if (req.params.email !== req.decoded.email) {
        return res.send({ message: "forbidden access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      res.send({ paymentResult });
    });

    app.get("/payments", async (req, res) => {
      const cursor = paymentCollection.find();
      const result = await cursor.toArray();

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("current server is running");
});

app.listen(port, () => {
  console.log(`Current server is running on port: ${port}`);
});
