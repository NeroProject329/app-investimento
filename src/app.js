const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const clientRoutes = require("./routes/client.routes");
const { requestContext } = require("./middleware/requestContext");

const app = express();


app.set("trust proxy", 1);

// JSON body
app.use(express.json());

// Cookies
app.use(cookieParser());

app.use(requestContext);

// CORS (por enquanto ok assim; quando tiver front, a gente trava por domínio)
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Rotas
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/client", clientRoutes);



// (Opcional) handler de erro padrão (ajuda muito)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, message: "Erro interno" });
});

module.exports = { app };
