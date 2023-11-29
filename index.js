const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(
  "sk_test_51JNWijH1dNBPX31WU3trCGNpFtwUCRrNU5dgI1EmM4jOsLeyzCMcp7mQSEyPJO2z0rGKu8D7CL0lQrjcZopKVQVk00LI9e0Rpl"
);
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
      "http://localhost:5176",
      "http://localhost:5174",
      "https://mealmaster-akib.web.app",
      "https://mealmaster-akib.firebaseapp.com",
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);
app.use(express.json());
app.use(cookieParser());

//! Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req?.cookies?.MealMaster_Token;
  if (!token) {
    return res.status(401).send({ success: false, message: "Unauthorized" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ success: false, message: "Unauthorized" });
    }
    req.data = decoded;
    next();
  });
};

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
    const allUpcomingMealsCollection = client
      .db("MealMasterDB")
      .collection("AllUpcomingMeals");
    const usersCollection = client.db("MealMasterDB").collection("AllUsers");
    const reviewsCollection = client
      .db("MealMasterDB")
      .collection("AllReviews");
    const paymentsCollection = client
      .db("MealMasterDB")
      .collection("AllPayments");
    const requestedMealCollection = client
      .db("MealMasterDB")
      .collection("AllRequestedMeals");

    //! Verify Admin
    const verifyAdmin = async (req, res, next) => {
      const adminEmail = req.data.email;
      const user = await usersCollection.findOne({ email: adminEmail });
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Not Admin" });
      }
      next();
    };

    //! Token Generator
    app.post("/create-jwt", async (req, res) => {
      const user = await req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res
        .cookie("MealMaster_Token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    //!Token Remove
    app.post("/remove-jwt", (req, res) => {
      res
        .clearCookie("MealMaster_Token", { maxAge: 0 })
        .send({ success: true });
    });

    //! Payment Call - Stripe
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(parseFloat(price) * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
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

    //! Get all Users Admin
    app.get("/all-users", verifyToken, verifyAdmin, async (req, res) => {
      const search = req.query.search;
      const page = parseInt(req.query.page);
      const itemPerPage = 10;
      const users = await usersCollection
        .find({
          $or: [
            { name: { $regex: new RegExp(search, "i") } },
            { email: { $regex: new RegExp(search, "i") } },
          ],
        })
        .skip(itemPerPage * page)
        .limit(itemPerPage)
        .toArray();
      const count = await usersCollection.countDocuments();
      res.send({ users, count });
    });

    //! Make one user Admin - Admin
    app.put(
      "/make-admin/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

    //! Get Admin Profile
    app.get("/admin-profile", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.query.email;
      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

    //! Admin Profile Data
    app.get(
      "/admin-profile-data",
      // verifyToken,
      // verifyAdmin,
      async (req, res) => {
        const email = req.query.email;
        const requestedMealsCount =
          await requestedMealCollection.countDocuments();
        const servedMeal = await requestedMealCollection
          .find({ status: "delivered" })
          .toArray();
        const pendingMeal = await requestedMealCollection
          .find({ status: "pending" })
          .toArray();
        const payment = await paymentsCollection
          .aggregate([
            {
              $project: { amount: 1 },
            },
            {
              $group: {
                _id: null,
                totalAmount: { $sum: "$amount" },
              },
            },
          ])
          .toArray();
        const addedMeal = await allMealsCollection
          .find({ distributorEmail: email })
          .toArray();
        res.send({
          requestedMealsCount,
          servedMealCount: servedMeal.length,
          pendingMealCount: pendingMeal.length,
          paymentAmount: payment[0].totalAmount,
          addedMealCount: addedMeal.length,
        });
      }
    );

    //! Get one user - User
    app.get("/my-profile", verifyToken, async (req, res) => {
      const email = req.query.email;
      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

    //! Update User's Profile
    app.patch("/update-my-profile/:email", async (req, res) => {
      const email = req.params.email;
      const data = await req.body;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { about: data } }
      );
      res.send(result);
    });

    //!  Get all meals - Meals Page
    app.get("/all-meals", async (req, res) => {
      const search = req.query.search;
      const category = req.query.category;
      const sbp = req.query.sbp;

      const page = parseInt(req.query.page);
      const limit = parseInt(req.query.limit);
      // const count = await allMealsCollection.countDocuments();

      const mealsCount = await allMealsCollection
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

      const meals = await allMealsCollection
        .find({
          $and: [
            { mealTitle: { $regex: new RegExp(search, "i") } },
            {
              mealType: category == "all" ? { $exists: true } : category,
            },
          ],
        })
        .sort({ price: sbp == "l2h" ? 1 : -1 })
        .skip(page)
        .limit(limit)
        .toArray();
      res.send({ meals, count: mealsCount.length });
    });

    //! Get All meals - Home Page
    app.get("/all-meals-home", async (req, res) => {
      //
      const result = await allMealsCollection.find().toArray();
      res.send(result);
    });

    //! Get All meals - Admin Page
    app.get("/all-meals-admin", verifyToken, verifyAdmin, async (req, res) => {
      const pageNumber = parseInt(req.query.page);
      const itemPerPage = 10;
      const meals = await allMealsCollection
        .find()
        .skip(pageNumber * itemPerPage)
        .limit(itemPerPage)
        .toArray();
      const count = await allMealsCollection.countDocuments();
      res.send({ meals, count });
    });

    //! Delete a Meal - Admin Page
    app.delete(
      "/delete-a-meal-admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        try {
          await allMealsCollection.deleteOne({
            _id: new ObjectId(id),
          });
          await requestedMealCollection.deleteOne({ mealId: id });
          await reviewsCollection.deleteOne({ mealId: id });
          await usersCollection.updateMany(
            { likings: { $in: [id] } },
            {
              $pull: { likings: id },
            }
          );
          res.send({ success: true });
        } catch (error) {
          res.send({ success: true, error });
        }
      }
    );

    //! Get one Meal
    app.get("/meal/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allMealsCollection.findOne(query);
      res.send(result);
    });

    //! Update one meal - Admin
    app.patch("/update-one-meal/:id", async (req, res) => {
      const data = await req.body;
      const id = req.params.id;
      const result = await allMealsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            mealTitle: data.mealTitle,
            mealType: data.mealType,
            price: data.price,
            mealImage: data.mealImage,
            ingredients: data.ingredients,
            description: data.description,
            rating: data.rating,
          },
        }
      );
      res.send(result);
    });

    //! Add a Meal - Admin
    app.post("/add-meal", verifyToken, verifyAdmin, async (req, res) => {
      const data = req.body;
      const result = await allMealsCollection.insertOne(data);
      res.send(result);
    });

    //! Add a Meal to Upcoming - Admin
    app.post(
      "/add-meal-upcoming",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const data = req.body;
        const UpcomingMealData = { mainMealData: data, likes: 0 };
        const result = await allUpcomingMealsCollection.insertOne(
          UpcomingMealData
        );
        res.send(result);
      }
    );

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

    //! Inc Like of a Upcoming Meal
    app.put("/inc-like-upcoming", async (req, res) => {
      const data = await req.body;
      const user = await usersCollection.findOne({ email: data.email });
      const newArray = [...user.ulikings, data.id];
      const userResult = await usersCollection.updateOne(
        { email: data.email },
        {
          $set: {
            ulikings: newArray,
          },
        }
      );
      const mealResult = await allUpcomingMealsCollection.updateOne(
        { _id: new ObjectId(data.id) },
        {
          $inc: { likes: 1 },
        }
      );
      res.send({ userResult, mealResult });
    });

    //! Upcoming Meal is Liked by user or not
    app.get("/is-liked-upcoming", async (req, res) => {
      const email = req.query.email;
      const id = req.query.id;
      const data = await usersCollection
        .find({
          $and: [
            {
              ulikings: {
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

    //! get a Review
    app.get("/review/:id", async (req, res) => {
      const id = req.params.id;
      const result = await reviewsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    //! Update a Review
    app.patch("/review-update/:id", async (req, res) => {
      const id = req.params.id;
      const data = await req.body;
      const result = await reviewsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            rating: data.newRating,
            review: data.newReviewText,
          },
        }
      );
      res.send(result);
    });

    //! Delete a Review &  Dec a review count
    app.patch("/delete-a-my-review", async (req, res) => {
      const reviewId = req.query.reviewId;
      const mealId = req.query.mealId;

      try {
        await reviewsCollection.deleteOne({
          _id: new ObjectId(reviewId),
        });
        await allMealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          {
            $inc: { numReviews: -1 },
          }
        );
        res.send({ success: true });
      } catch (error) {
        res.send({ data: error, success: false });
      }
    });

    // Get all reviews - Admin
    // app.get("/all-reviews", async (req, res) => {
    //   const result = await reviewsCollection.find().toArray();
    //   res.send(result);
    // });

    //! Get Reviews Meal Wise
    app.get("/meal-wise-reviews", async (req, res) => {
      const id = req.query.id;
      const query = { mealId: id };
      const result = await reviewsCollection.find(query).toArray();
      res.send(result);
    });

    //! Delete a Review and Decrise review count - Admin
    app.patch("/delete-one-review", async (req, res) => {
      const reviewId = req.query.reviewId;
      const mealId = req.query.mealId;
      console.log(reviewId);
      console.log(mealId);
      await reviewsCollection.deleteOne({
        _id: new ObjectId(reviewId),
      });
      await allMealsCollection.updateOne(
        { _id: new ObjectId(mealId) },
        {
          $inc: { numReviews: -1 },
        }
      );
      res.send({ success: true });
    });

    //! All Reviews - Admin
    app.get(
      "/all-reviews-aggrigate",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const sort = req.query.sort;
        const dir = req.query.dir;
        const pageNumber = parseInt(req.query.page);
        const itemPerPage = 10;
        const sortField =
          sort == "sbl" ? "likes" : sort == "sbr" ? "reviews" : null;
        const reviews = await reviewsCollection
          .aggregate([
            {
              $project: { mealId: { $toObjectId: "$mealId" } },
            },
            {
              $lookup: {
                from: "AllMeals",
                localField: "mealId",
                foreignField: "_id",
                as: "meal",
              },
            },
            {
              $unwind: "$meal",
            },
            {
              $project: {
                _id: 1,
                mealId: 1,
                mealTitle: "$meal.mealTitle",
                likes: "$meal.likes",
                reviews: "$meal.numReviews",
              },
            },
            {
              $sort: {
                [sortField]: dir == "lth" ? 1 : -1,
              },
            },
          ])
          .skip(itemPerPage * pageNumber)
          .limit(itemPerPage)
          .toArray();
        const count = await reviewsCollection.countDocuments();
        res.send({ reviews, count });
      }
    );

    //! All Reviews - User
    app.get("/my-reviews-aggrigate", verifyToken, async (req, res) => {
      const email = req.query.email;
      const page = parseInt(req.query.page);
      const itemPerPage = 10;
      const reviews = await reviewsCollection
        .aggregate([
          {
            $project: {
              mealId: { $toObjectId: "$mealId" },
              email: 1,
              rating: 1,
              review: 1,
            },
          },
          {
            $lookup: {
              from: "AllMeals",
              localField: "mealId",
              foreignField: "_id",
              as: "meal",
            },
          },
          {
            $unwind: "$meal",
          },
          {
            $match: {
              email: { $eq: email },
            },
          },
        ])
        .skip(itemPerPage * page)
        .limit(itemPerPage)
        .toArray();
      const count = await reviewsCollection.countDocuments();
      res.send({ reviews, count });
    });

    //! Get Role
    app.get("/get-role", verifyToken, async (req, res) => {
      const email = req.query.email;
      const result = await usersCollection.findOne({ email });
      res.send(result.role);
    });

    //! Get Package
    app.get("/get-package", verifyToken, async (req, res) => {
      const email = req.query.email;
      const result = await usersCollection.findOne({ email });
      res.send(result.badge);
    });

    //! Change Package
    app.patch("/change-package", async (req, res) => {
      const email = req.query.email;
      const pack = req.query.pack;
      const result = await usersCollection.updateOne(
        { email },
        {
          $set: {
            badge: `bronze-${pack}`,
          },
        }
      );
      res.send(result);
    });

    //! Create Subscription history
    app.post("/subscription-handler", async (req, res) => {
      const data = await req.body;
      const result = await paymentsCollection.insertOne(data);
      res.send(result);
    });

    //! Get all Payments
    app.get("/all-payments", verifyToken, verifyAdmin, async (req, res) => {
      const payments = await paymentsCollection.find().toArray();
      const count = await paymentsCollection.countDocuments();
      res.send({ payments, count });
    });

    //! Check meal requested or not
    app.get("/check-requested-meal", async (req, res) => {
      const id = req.query.id;
      const email = req.query.email;
      const isExistRequest = await requestedMealCollection.findOne({
        $and: [{ mealId: id }, { email }],
      });
      res.send(isExistRequest);
    });

    //! Add a requested Meal
    app.post("/add-requested-meal", async (req, res) => {
      const data = await req.body;
      const result = await requestedMealCollection.insertOne(data);
      res.send(result);
    });

    //! Delete a Requested Meal
    app.delete("/delete-requested-meal/:id", async (req, res) => {
      const id = req.params.id;
      const result = await requestedMealCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    //! Get All Requested Meals -  Admin
    app.get(
      "/all-requested-meals",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const search = req.query.search;
        const page = parseInt(req.query.page);
        const itemPerPage = 10;
        const requestedMeals = await requestedMealCollection
          .aggregate([
            {
              $project: {
                name: 1,
                email: 1,
                status: 1,
                mealId: { $toObjectId: "$mealId" },
              },
            },
            {
              $lookup: {
                from: "AllMeals",
                localField: "mealId",
                foreignField: "_id",
                as: "meal",
              },
            },
            {
              $unwind: "$meal",
            },
            {
              $match: {
                $or: [
                  { name: { $regex: new RegExp(search, "i") } },
                  { email: { $regex: new RegExp(search, "i") } },
                ],
              },
            },
          ])
          .skip(itemPerPage * page)
          .limit(itemPerPage)
          .toArray();
        const count = await requestedMealCollection.countDocuments();
        res.send({ requestedMeals, count });
      }
    );

    //! Get All Requested Meals -  User
    app.get("/my-requested-meals", verifyToken, async (req, res) => {
      const email = req.query.email;
      const sort = req.query.sort;
      const page = parseInt(req.query.page);
      const itemPerPage = 10;
      const requestedMeals = await requestedMealCollection
        .aggregate([
          {
            $project: {
              name: 1,
              email: 1,
              status: 1,
              mealId: { $toObjectId: "$mealId" },
            },
          },
          {
            $lookup: {
              from: "AllMeals",
              localField: "mealId",
              foreignField: "_id",
              as: "meal",
            },
          },
          {
            $unwind: "$meal",
          },
          {
            $match: {
              email: { $eq: email },
            },
          },
          {
            $sort: {
              status: sort == "del" ? 1 : -1,
            },
          },
        ])
        .skip(itemPerPage * page)
        .limit(itemPerPage)
        .toArray();
      const count = await requestedMealCollection.countDocuments();
      res.send({ requestedMeals, count });
    });

    //! Update a Requested meal's status - Admin
    app.patch(
      "/update-requested-meal/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const requestedMeal = await requestedMealCollection.findOne({
          _id: new ObjectId(id),
        });
        const status = requestedMeal.status;
        if (status == "pending") {
          const result = await requestedMealCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                status: "delivered",
              },
            }
          );
          res.send(result);
        } else if (status == "delivered") {
          res.send({ delivered: true });
        }
      }
    );
    //! Get all Upcoming Meals - Admin
    app.get("/all-upcoming-meals", async (req, res) => {
      const page = parseInt(req.query.page);
      const itemPerPage = 10;
      const upcomingMeals = await allUpcomingMealsCollection
        .find()
        .skip(page * itemPerPage)
        .limit(itemPerPage)
        .toArray();
      const count = await allUpcomingMealsCollection.countDocuments();
      res.send({ upcomingMeals, count });
    });

    //! Get all Upcoming Meals - User
    app.get("/all-upcoming-meals-user", async (req, res) => {
      const upcomingMeals = await allUpcomingMealsCollection.find().toArray();
      res.send(upcomingMeals);
    });

    //! From Upcoming Meals to Meals
    app.post(
      "/from-upcoming-to-meals/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        console.log(id);
        try {
          const upcomingMeal = await allUpcomingMealsCollection.findOne({
            _id: new ObjectId(id),
          });
          const meal = upcomingMeal.mainMealData;
          await allMealsCollection.insertOne(meal);
          await allUpcomingMealsCollection.deleteOne({
            _id: new ObjectId(id),
          });
          res.send({ success: true });
        } catch (error) {
          res.send(error);
        }
      }
    );
  } finally {
  }
}
run().catch(console.dir);

//! App listener
app.listen(port, () => {
  console.log(`MealMaster is running on port: ${port}`);
});
