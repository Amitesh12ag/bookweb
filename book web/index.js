

import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import axios from "axios";
import session from "express-session";
import env from "dotenv";

const app = express();
const port = 3000;

const db = new pg.Client({
  user: process.env.USER,
  host:   process.env.HOST,
  database: process.env.DATABASE,
  password: process.env.PASSWORD,
  port: 5432,
});
db.connect();

env.config();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

// Setup session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}));

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/add", (req, res) => {
  if (!req.session.user_id) {
    res.redirect("/login");
  } else {
    res.render("add.ejs");
  }
});

app.get("/new", (req, res) => {
  if (!req.session.user_id) {
    res.redirect("/login");
  } else {
    res.render("new.ejs");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      res.status(500).send("Internal server error");
    } else {
      res.redirect("/login");
    }
  });
});

app.get("/delete", async (req, res) => {
  const bookName = req.body["bookname"];

  try {
    const result = await db.query("DELETE FROM books1 WHERE book_name = $1", [bookName]);

    if (result.rowCount != 0) {
      res.redirect("/old");
    } else {
      res.status(404).send("Book not found");
    }
  } catch (err) {
    console.error("Error executing query:", err);
    res.status(500).send("Error deleting data from database");
  }
});


app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  const query = "INSERT INTO myuser (email, password) VALUES ($1, $2)";
  const values = [email, password];
  await db.query(query, values);
  res.redirect("/login");
});

app.post("/login", async (req, res) => {
  const email = req.body.username; // Use email, not username
  const password = req.body.password;

  try {
    const query = "SELECT user_id, password FROM myuser WHERE email = $1";
    const values = [email];
    const result = await db.query(query, values);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (password === user.password) {
        req.session.user_id = user.user_id;
        res.redirect("/add");
      } else {
        res.send("Invalid email or password");
      }
    } else {
      res.send("Invalid email or password");
    }
  } catch (err) {
    console.error("Error during authentication:", err.stack);
    res.status(500).send("Internal server error");
  }
});

app.post("/new", async (req, res) => {
  if (!req.session.user_id) {
    res.redirect("/login");
  } else {
    try {
      const book_name = req.body["book-name"];
      const rating = req.body["book-rating"];
      const notes = req.body["book-notes"];
      const isbn = req.body["isbn-code"];
      const user_id = req.session.user_id;

      const query = "INSERT INTO notes (book_name, notes, ratings, isbn, user_id) VALUES ($1, $2, $3, $4, $5)";
      const values = [book_name, notes, rating, isbn, user_id];

      const result = await db.query(query, values);
      console.log("Rows affected:", result.rowCount); // Log number of rows affected

      res.redirect("/add");
    } catch (err) {
      console.error("Error executing query:", err);
      res.status(500).send("Error inserting data into database");
    }
  }
});

app.get("/old", async (req, res) => {
  if (!req.session.user_id) {
    res.redirect("/login");
  } else {
    try {
      // Query to fetch book data
      const query = "SELECT * FROM notes WHERE user_id = $1";
      const values = [req.session.user_id];
      const { rows } = await db.query(query, values);


      // Fetch cover images for each book using Open Library Covers API
      const booksWithCovers = await Promise.all(
        rows.map(async (book) => {
          const isbn = book.isbn; // Assuming ISBN field in your database
          const coverUrl = `http://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

          try {
            const response = await axios.get(coverUrl, { responseType: 'arraybuffer' });
            if (response.status === 200) {
              const base64Image = Buffer.from(response.data, 'binary').toString('base64');
              const coverImageUrl = `data:image/jpeg;base64,${base64Image}`;
              return { ...book, cover_image: coverImageUrl };
            } else {
              console.error(`Failed to fetch cover for ISBN ${isbn}`);
              return { ...book, cover_image: null };
            }
          } catch (error) {
            console.error(`Error fetching cover for ISBN ${isbn}:`, error);
            return { ...book, cover_image: null };
          }
        })
      );

      // Render HTML template and pass fetched data with cover images
      res.render("old.ejs", { books: booksWithCovers });
    } catch (err) {
      console.error("Error fetching data:", err);
      res.status(500).send("Error fetching data from database");
    }
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
