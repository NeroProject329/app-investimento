const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");


const app = express();

// JSON body
app.use(express.json());

// Cookies
app.use(cookieParser());

// CORS (ajustaremos depois quando conectar no Next)
app.use(
  cors({
    origin: true, // depois vamos travar isso pro domínio do front
    credentials: true,
  })
);

// Rotas
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);


module.exports = { app };
