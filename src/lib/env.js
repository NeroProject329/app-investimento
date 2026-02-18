const dotenv = require("dotenv");
dotenv.config();

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Faltando variável de ambiente: ${name}`);
  return v;
}

const env = {
  PORT: process.env.PORT || "3009",
  DATABASE_URL: requireEnv("DATABASE_URL"),
  JWT_SECRET: requireEnv("JWT_SECRET"),
};

module.exports = { env };
