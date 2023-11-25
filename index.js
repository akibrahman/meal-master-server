const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const port = process.env.PORT || 5000;
const app = express();
const {
  MongoClient,
  ServerApiVersion,
  serialize,
  ObjectId,
} = require("mongodb");

//! Middlewares
app.use(
  cors({
    origin: [
      "https://jobnest-akib.web.app",
      "https://jobnest-akib.firebaseapp.com",
      "http://localhost:5176",
      "http://localhost:5174",
    ],
    // origin: "http://localhost:5176",
    // credentials: true,
    // optionsSuccessStatus: 200,
  })
);
app.use(express.json());

app.use(cookieParser());

//! Verify Token Middleware
// const verifyToken = async (req, res, next) => {
//   const token = req?.cookies?.token;
//   if (!token) {
//     return res.status(401).send({ success: false, message: "Unauthorized" });
//   }
//   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
//     if (err) {
//       return res.status(401).send({ success: false, message: "Unauthorized" });
//     }
//     req.data = decoded;
//     next();
//   });
// };

//! Creating MongoDB Environment
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bfs9yhw.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//!First Responce
app.get("/", (req, res) => {
  res.send("Mealmaster is Running");
});

async function run() {
  try {
    // await client.connect();
    console.log("MongoDB Running");

    //! Collections
    const allMealsCollection = client.db("MealMasterDB").collection("AllMeals");
    const usersCollection = client.db("MealMasterDB").collection("AllUsers");
    const reviewsCollection = client
      .db("MealMasterDB")
      .collection("AllReviews");

    //! Create Token
    // app.post("/create-jwt", async (req, res) => {
    //   const user = await req.body;
    //   const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    //     expiresIn: "1h",
    //   });
    //   res
    //     .cookie("token", token, {
    //       httpOnly: true,
    //       secure: true,
    //       sameSite: "none",
    //     })
    //     .send({ success: true });
    // });
    //! Remove Token
    app.post("/remove-jwt", async (req, res) => {
      res.clearCookie("token", { maxAge: 0 }).send({ success: true });
    });

    //! Save or modify user email, status in DB
    app.put("/all-users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const isExist = await usersCollection.findOne(query);
      console.log("User found?----->", isExist);
      if (isExist) {
        await usersCollection.updateOne(
          query,
          {
            $set: { name: user.name },
          },
          options
        );
        return res.send(isExist);
      }
      const result = await usersCollection.updateOne(
        query,
        {
          $set: { ...user, timestamp: Date.now() },
        },
        options
      );
      res.send(result);
    });

    //! Get all Users
    app.get("/all-users", async (req, res) => {
      const search = req.query.search;

      const result = await usersCollection
        .find({
          $or: [
            { name: { $regex: new RegExp(search, "i") } },
            { email: { $regex: new RegExp(search, "i") } },
          ],
        })
        .toArray();
      res.send(result);
    });

    //! Make one user Admin
    app.put("/make-admin/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.updateOne(
        { email },
        {
          $set: {
            role: "admin",
          },
        }
      );
      res.send(result);
    });

    //!  Get all meals
    app.get("/all-meals", async (req, res) => {
      const search = req.query.search;
      const category = req.query.category;
      const sbp = req.query.sbp;

      const result = await allMealsCollection
        .find({
          $and: [
            { mealTitle: { $regex: new RegExp(search, "i") } },
            {
              mealType: category == "all" ? { $exists: true } : category,
            },
          ],
        })
        .sort({ price: sbp == "l2h" ? 1 : -1 })
        .toArray();
      res.send(result);
    });

    //! Get All meals - Home Page
    app.get("/all-meals-home", async (req, res) => {
      //
      const result = await allMealsCollection.find().toArray();
      res.send(result);
    });

    //! Get one Meal
    app.get("/meal/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allMealsCollection.findOne(query);
      res.send(result);
    });

    //! Inc Like of a Meal
    app.put("/inc-like", async (req, res) => {
      const data = await req.body;
      const user = await usersCollection.findOne({ email: data.email });
      const newArray = [...user.likings, data.id];
      const userResult = await usersCollection.updateOne(
        { email: data.email },
        {
          $set: {
            likings: newArray,
          },
        }
      );
      const mealResult = await allMealsCollection.updateOne(
        { _id: new ObjectId(data.id) },
        {
          $inc: { likes: 1 },
        }
      );
      res.send({ userResult, mealResult });
    });

    //! Dec Like of a Meal
    app.put("/dec-like", async (req, res) => {
      const data = await req.body;
      const user = await usersCollection.findOne({ email: data.email });
      const newArray = [...user.likings];
      const index = newArray.indexOf(data.id);
      newArray.splice(index, 1);

      const userResult = await usersCollection.updateOne(
        { email: data.email },
        {
          $set: {
            likings: newArray,
          },
        }
      );
      const mealResult = await allMealsCollection.updateOne(
        { _id: new ObjectId(data.id) },
        {
          $inc: { likes: -1 },
        }
      );
      res.send({ userResult, mealResult });
    });

    //! Meal is Liked by user or not
    app.get("/is-liked", async (req, res) => {
      const email = req.query.email;
      const id = req.query.id;
      const data = await usersCollection
        .find({
          $and: [
            {
              likings: {
                $in: [id],
              },
            },
            {
              email: email,
            },
          ],
        })
        .toArray();
      if (data.length == 0) {
        res.send({ liked: false });
      } else {
        res.send({ liked: true });
      }
    });

    //! Add a Review
    app.post("/add-review", async (req, res) => {
      const data = await req.body;
      const id = data.mealId;
      const result1 = await reviewsCollection.insertOne(data);
      const result2 = await allMealsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $inc: { numReviews: 1 },
        }
      );
      res.send({ result1, result2 });
    });

    //! Get Reviews Meal Wise
    app.get("/meal-wise-reviews", async (req, res) => {
      const id = req.query.id;
      const query = { mealId: id };
      const result = await reviewsCollection.find(query).toArray();
      res.send(result);
    });

    //! Get Role
    app.get("/get-role", async (req, res) => {
      const email = req.query.email;
      const result = await usersCollection.findOne({ email });
      res.send(result.role);
    });
  } finally {
  }
}
run().catch(console.dir);

//! App listener
app.listen(port, () => {
  console.log(`MealMaster is running on port: ${port}`);
});
