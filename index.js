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
    // const allJobsCollection = client.db("JobNestDB").collection("AllJobs");
    // const appliedJobsCollection = client
    //   .db("JobNestDB")
    //   .collection("AppliedJobs");

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
  } finally {
  }
}
run().catch(console.dir);

//! App listener
app.listen(port, () => {
  console.log(`MealMaster is running on port: ${port}`);
});
